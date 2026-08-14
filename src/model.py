"""Shared model definition and preprocessing for glacial lake segmentation.

This is the single source of truth for both training and inference. The
normalisation previously lived in three places (the notebook's dataset class,
the notebook's predict cell, and notebooks/predict.py) and had drifted apart,
so inference silently fed the model differently-scaled data than training.

Attribute names below intentionally match the notebook definitions exactly, so
checkpoints trained from the notebook load with `load_state_dict` unchanged.
"""

from __future__ import annotations

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

# --------------------------------------------------------------------------- #
#                              INPUT SPECIFICATION
# --------------------------------------------------------------------------- #

#: Order of the 8 bands in an input stack, as produced by the preprocessing
#: notebooks. Index 0-3 are the LISS-3 optical bands.
CHANNEL_NAMES = (
    "LISS3_B2",   # 0  green
    "LISS3_B3",   # 1  red
    "LISS3_B4",   # 2  NIR
    "LISS3_B5",   # 3  SWIR
    "DEM",        # 4  elevation, metres
    "SLOPE",      # 5  degrees
    "ASPECT",     # 6  degrees
    "NDWI",       # 7  index in [-1, 1]
)

N_CHANNELS = len(CHANNEL_NAMES)

OPTICAL_MAX = 1023.0   # LISS-3 is 10-bit
DEM_MAX = 4000.0
SLOPE_MAX = 90.0
ASPECT_MAX = 360.0


def normalize_stack(stack: np.ndarray) -> np.ndarray:
    """Scale an 8-band input stack to [0, 1].

    Mirrors ``GlacialLakeDataset.__getitem__`` in ``notebooks/R_Hybrid.ipynb``
    exactly. Any change here must be made for training and inference together.

    Args:
        stack: float array of shape ``(8, H, W)``.

    Returns:
        A new normalised array. The input is not modified.

    Raises:
        ValueError: if the stack does not have exactly 8 channels.
    """
    if stack.ndim != 3 or stack.shape[0] != N_CHANNELS:
        raise ValueError(
            f"Expected an array of shape ({N_CHANNELS}, H, W), got {stack.shape}. "
            f"Bands must be ordered: {', '.join(CHANNEL_NAMES)}."
        )

    # Copy so callers keep their original data; the previous implementation
    # mutated the caller's array in place via `/=`.
    out = stack.astype(np.float32, copy=True)

    out[:4] /= OPTICAL_MAX
    out[4] /= DEM_MAX
    out[5] /= SLOPE_MAX
    out[6] /= ASPECT_MAX
    out[7] = (out[7] + 1.0) / 2.0

    return np.clip(out, 0.0, 1.0)


# --------------------------------------------------------------------------- #
#                             MODEL BUILDING BLOCKS
# --------------------------------------------------------------------------- #


class DoubleConv(nn.Module):
    def __init__(self, in_channels, out_channels, mid_channels=None):
        super().__init__()
        if not mid_channels:
            mid_channels = out_channels
        self.double_conv = nn.Sequential(
            nn.Conv2d(in_channels, mid_channels, 3, padding=1, bias=False),
            nn.BatchNorm2d(mid_channels),
            nn.ReLU(inplace=True),
            nn.Conv2d(mid_channels, out_channels, 3, padding=1, bias=False),
            nn.BatchNorm2d(out_channels),
            nn.ReLU(inplace=True),
        )

    def forward(self, x):
        return self.double_conv(x)


class Down(nn.Module):
    def __init__(self, in_channels, out_channels):
        super().__init__()
        self.maxpool_conv = nn.Sequential(nn.MaxPool2d(2), DoubleConv(in_channels, out_channels))

    def forward(self, x):
        return self.maxpool_conv(x)


class GlobalBranch(nn.Module):
    """GLNet-style global context branch: downsample, convolve, upsample."""

    def __init__(self, in_channels, out_channels=32):
        super().__init__()
        self.downsample = nn.AvgPool2d(4, stride=4)
        self.convs = nn.Sequential(
            nn.Conv2d(in_channels, out_channels, 3, padding=1, bias=False),
            nn.BatchNorm2d(out_channels),
            nn.ReLU(inplace=True),
            nn.Conv2d(out_channels, out_channels, 3, padding=1, bias=False),
            nn.BatchNorm2d(out_channels),
            nn.ReLU(inplace=True),
        )
        self.upsample = nn.Upsample(scale_factor=4, mode="bilinear", align_corners=True)

    def forward(self, x):
        return self.upsample(self.convs(self.downsample(x)))


class LocalBranch(nn.Module):
    """GLNet-style full-resolution detail branch."""

    def __init__(self, in_channels, out_channels=32):
        super().__init__()
        self.convs = nn.Sequential(
            nn.Conv2d(in_channels, out_channels, 3, padding=1, bias=False),
            nn.BatchNorm2d(out_channels),
            nn.ReLU(inplace=True),
            nn.Conv2d(out_channels, out_channels, 1, bias=False),
            nn.BatchNorm2d(out_channels),
            nn.ReLU(inplace=True),
        )

    def forward(self, x):
        return self.convs(x)


class AttentionGate(nn.Module):
    def __init__(self, F_g, F_l, F_int):
        super().__init__()
        self.W_g = nn.Sequential(nn.Conv2d(F_g, F_int, 1, bias=True), nn.BatchNorm2d(F_int))
        self.W_x = nn.Sequential(nn.Conv2d(F_l, F_int, 1, bias=True), nn.BatchNorm2d(F_int))
        self.psi = nn.Sequential(nn.Conv2d(F_int, 1, 1, bias=True), nn.BatchNorm2d(1), nn.Sigmoid())
        self.relu = nn.ReLU(inplace=True)

    def forward(self, g, x):
        return x * self.psi(self.relu(self.W_g(g) + self.W_x(x)))


class Up_Attention(nn.Module):
    """Upscale, gate the skip connection with attention, then convolve."""

    def __init__(self, ch_g, ch_x, ch_out, dropout_p=0.5):
        super().__init__()
        self.up = nn.Upsample(scale_factor=2, mode="bilinear", align_corners=True)
        self.att = AttentionGate(F_g=ch_g, F_l=ch_x, F_int=(ch_g + ch_x) // 4)
        self.conv = DoubleConv(in_channels=ch_g + ch_x, out_channels=ch_out)
        self.dropout = nn.Dropout(dropout_p)

    def forward(self, x1, x2):
        # x1 is the gating signal from the layer below; x2 is the skip connection.
        x1 = self.up(x1)

        # Reconcile odd input sizes BEFORE the attention gate. The notebook padded
        # afterwards, so AttentionGate received mismatched tensors and raised a
        # shape error on any non-power-of-two input.
        diffY = x2.size()[2] - x1.size()[2]
        diffX = x2.size()[3] - x1.size()[3]
        if diffY or diffX:
            x1 = F.pad(x1, [diffX // 2, diffX - diffX // 2, diffY // 2, diffY - diffY // 2])

        x2_att = self.att(g=x1, x=x2)
        return self.conv(self.dropout(torch.cat([x2_att, x1], dim=1)))


class OutConv(nn.Module):
    def __init__(self, in_channels, out_channels):
        super().__init__()
        self.conv = nn.Conv2d(in_channels, out_channels, kernel_size=1)

    def forward(self, x):
        return self.conv(x)


# --------------------------------------------------------------------------- #
#                                  FULL MODEL
# --------------------------------------------------------------------------- #


class GlacialLake_HybridNet(nn.Module):
    """GLNet parallel encoder + Attention U-Net decoder with MC-dropout."""

    def __init__(self, n_channels=N_CHANNELS, n_classes=1, dropout_p=0.5):
        super().__init__()
        self.local_branch = LocalBranch(n_channels, out_channels=32)
        self.global_branch = GlobalBranch(n_channels, out_channels=32)

        self.down1 = Down(64, 128)
        self.down2 = Down(128, 256)
        self.down3 = Down(256, 512)
        self.down4 = Down(512, 1024)

        self.up1 = Up_Attention(1024, 512, 512, dropout_p)
        self.up2 = Up_Attention(512, 256, 256, dropout_p)
        self.up3 = Up_Attention(256, 128, 128, dropout_p)
        self.up4 = Up_Attention(128, 64, 64, dropout_p)

        self.outc = OutConv(64, n_classes)

    def forward(self, x):
        x1 = torch.cat([self.local_branch(x), self.global_branch(x)], dim=1)

        x2 = self.down1(x1)
        x3 = self.down2(x2)
        x4 = self.down3(x3)
        x5 = self.down4(x4)

        x_up = self.up1(x5, x4)
        x_up = self.up2(x_up, x3)
        x_up = self.up3(x_up, x2)
        x_up = self.up4(x_up, x1)

        return self.outc(x_up)


def load_hybrid_model(checkpoint_path, device="cpu", n_channels=N_CHANNELS, n_classes=1):
    """Build the hybrid network and load trained weights onto ``device``."""
    model = GlacialLake_HybridNet(n_channels=n_channels, n_classes=n_classes)
    state = torch.load(checkpoint_path, map_location=device, weights_only=True)
    # Checkpoints are sometimes saved as {"state_dict": ...} or with DataParallel
    # "module." prefixes; accept both without forcing the caller to unwrap them.
    if isinstance(state, dict) and "state_dict" in state:
        state = state["state_dict"]
    if isinstance(state, dict) and any(k.startswith("module.") for k in state):
        state = {k.removeprefix("module."): v for k, v in state.items()}
    model.load_state_dict(state)
    model.to(device)
    model.eval()
    return model


def enable_mc_dropout(model):
    """Re-enable dropout while keeping BatchNorm in eval mode.

    Required for Monte Carlo dropout uncertainty estimation: calling
    ``model.train()`` would also put BatchNorm into training mode, so it would
    update its running statistics from the inference batch and normalise using
    batch statistics instead of the ones learned during training. That both
    corrupts the checkpoint's buffers and makes every pass depend on batch
    composition, which contaminates the uncertainty estimate.
    """
    model.eval()
    for module in model.modules():
        if isinstance(module, nn.Dropout):
            module.train()
    return model


@torch.no_grad()
def mc_dropout_predict(model, image_tensor, n_passes=30):
    """Estimate a prediction and its pixel-wise uncertainty via MC dropout.

    Runs ``n_passes`` stochastic forward passes with dropout active and
    BatchNorm frozen, then reduces them to a mean probability map and the
    per-pixel standard deviation across passes.

    Args:
        model: a trained ``GlacialLake_HybridNet``.
        image_tensor: input of shape ``(B, C, H, W)``, already normalised.
        n_passes: number of stochastic passes; must be at least 2.

    Returns:
        ``(mean_probs, std_probs)`` as numpy arrays of shape ``(B, 1, H, W)``.
        ``std_probs`` is the pixel-wise confidence map: low means the model
        agrees with itself across passes, high means it does not.

    Raises:
        ValueError: if ``n_passes`` is less than 2.
    """
    if n_passes < 2:
        raise ValueError(f"n_passes must be >= 2 to estimate a spread, got {n_passes}")

    was_training = model.training
    enable_mc_dropout(model)

    # Welford's online algorithm: keeps memory constant in n_passes rather than
    # stacking every prediction, which matters for large tiles.
    mean = None
    m2 = None
    for i in range(1, n_passes + 1):
        probs = torch.sigmoid(model(image_tensor))
        if mean is None:
            mean = torch.zeros_like(probs)
            m2 = torch.zeros_like(probs)
        delta = probs - mean
        mean += delta / i
        m2 += delta * (probs - mean)

    variance = m2 / (n_passes - 1)  # sample variance

    if was_training:
        model.train()
    else:
        model.eval()

    return mean.cpu().numpy(), variance.sqrt().cpu().numpy()
