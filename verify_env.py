"""Smoke-test the Python environment for the glacial lake pipeline.

Run with:  .venv\\Scripts\\python.exe verify_env.py
"""

import sys

print(f"Python {sys.version.split()[0]}  ({sys.executable})\n")

failures = []


def check(label, fn):
    try:
        detail = fn()
        print(f"  OK    {label:<32} {detail}")
    except Exception as exc:  # noqa: BLE001 - we want to report any failure
        print(f"  FAIL  {label:<32} {type(exc).__name__}: {exc}")
        failures.append(label)


print("Imports")


def _torch():
    import torch

    return f"{torch.__version__} (CUDA: {torch.cuda.is_available()})"


def _numpy():
    import numpy

    return numpy.__version__


def _rasterio():
    import rasterio

    return f"{rasterio.__version__} (GDAL {rasterio.__gdal_version__})"


def _cv2():
    import cv2

    return cv2.__version__


def _albumentations():
    import albumentations

    return albumentations.__version__


def _smp():
    import segmentation_models_pytorch as smp

    return smp.__version__


def _ee():
    import ee

    return ee.__version__


def _sklearn():
    import sklearn

    return sklearn.__version__


def _matplotlib():
    import matplotlib

    return matplotlib.__version__


def _tqdm():
    import tqdm

    return tqdm.__version__


check("torch", _torch)
check("numpy", _numpy)
check("rasterio", _rasterio)
check("opencv (cv2)", _cv2)
check("albumentations", _albumentations)
check("segmentation_models_pytorch", _smp)
check("earthengine-api", _ee)
check("scikit-learn", _sklearn)
check("matplotlib", _matplotlib)
check("tqdm", _tqdm)

print("\nFunctional checks")


def _tensor_op():
    import torch

    a = torch.randn(2, 8, 64, 64)
    return f"conv forward -> {tuple(torch.nn.Conv2d(8, 16, 3, padding=1)(a).shape)}"


def _amp():
    import torch

    torch.amp.GradScaler()
    return "torch.amp.GradScaler available"


def _hybrid_net():
    """Rebuild the notebook's architecture to prove it constructs and runs."""
    import torch
    import torch.nn as nn

    class DoubleConv(nn.Module):
        def __init__(self, i, o, m=None):
            super().__init__()
            m = m or o
            self.b = nn.Sequential(
                nn.Conv2d(i, m, 3, padding=1, bias=False), nn.BatchNorm2d(m), nn.ReLU(inplace=True),
                nn.Conv2d(m, o, 3, padding=1, bias=False), nn.BatchNorm2d(o), nn.ReLU(inplace=True),
            )

        def forward(self, x):
            return self.b(x)

    class Down(nn.Module):
        def __init__(self, i, o):
            super().__init__()
            self.b = nn.Sequential(nn.MaxPool2d(2), DoubleConv(i, o))

        def forward(self, x):
            return self.b(x)

    class AttentionGate(nn.Module):
        def __init__(self, f_g, f_l, f_int):
            super().__init__()
            self.wg = nn.Sequential(nn.Conv2d(f_g, f_int, 1), nn.BatchNorm2d(f_int))
            self.wx = nn.Sequential(nn.Conv2d(f_l, f_int, 1), nn.BatchNorm2d(f_int))
            self.psi = nn.Sequential(nn.Conv2d(f_int, 1, 1), nn.BatchNorm2d(1), nn.Sigmoid())
            self.relu = nn.ReLU(inplace=True)

        def forward(self, g, x):
            return x * self.psi(self.relu(self.wg(g) + self.wx(x)))

    class UpAttention(nn.Module):
        def __init__(self, ch_g, ch_x, ch_out, p=0.5):
            super().__init__()
            self.up = nn.Upsample(scale_factor=2, mode="bilinear", align_corners=True)
            self.att = AttentionGate(ch_g, ch_x, (ch_g + ch_x) // 4)
            self.conv = DoubleConv(ch_g + ch_x, ch_out)
            self.drop = nn.Dropout(p)

        def forward(self, x1, x2):
            x1 = self.up(x1)
            x2a = self.att(g=x1, x=x2)
            return self.conv(self.drop(torch.cat([x2a, x1], dim=1)))

    class LocalBranch(nn.Module):
        def __init__(self, i, o=32):
            super().__init__()
            self.b = nn.Sequential(
                nn.Conv2d(i, o, 3, padding=1, bias=False), nn.BatchNorm2d(o), nn.ReLU(inplace=True),
                nn.Conv2d(o, o, 1, bias=False), nn.BatchNorm2d(o), nn.ReLU(inplace=True),
            )

        def forward(self, x):
            return self.b(x)

    class GlobalBranch(nn.Module):
        def __init__(self, i, o=32):
            super().__init__()
            self.d = nn.AvgPool2d(4, stride=4)
            self.c = nn.Sequential(
                nn.Conv2d(i, o, 3, padding=1, bias=False), nn.BatchNorm2d(o), nn.ReLU(inplace=True),
                nn.Conv2d(o, o, 3, padding=1, bias=False), nn.BatchNorm2d(o), nn.ReLU(inplace=True),
            )
            self.u = nn.Upsample(scale_factor=4, mode="bilinear", align_corners=True)

        def forward(self, x):
            return self.u(self.c(self.d(x)))

    class HybridNet(nn.Module):
        def __init__(self, n_ch=8, n_cls=1, p=0.5):
            super().__init__()
            self.local, self.glob = LocalBranch(n_ch), GlobalBranch(n_ch)
            self.d1, self.d2, self.d3, self.d4 = Down(64, 128), Down(128, 256), Down(256, 512), Down(512, 1024)
            self.u1 = UpAttention(1024, 512, 512, p)
            self.u2 = UpAttention(512, 256, 256, p)
            self.u3 = UpAttention(256, 128, 128, p)
            self.u4 = UpAttention(128, 64, 64, p)
            self.out = nn.Conv2d(64, n_cls, 1)

        def forward(self, x):
            x1 = torch.cat([self.local(x), self.glob(x)], dim=1)
            x2, x3 = self.d1(x1), None
            x3 = self.d2(x2)
            x4 = self.d3(x3)
            x5 = self.d4(x4)
            y = self.u1(x5, x4)
            y = self.u2(y, x3)
            y = self.u3(y, x2)
            y = self.u4(y, x1)
            return self.out(y)

    net = HybridNet().eval()
    with torch.no_grad():
        out = net(torch.randn(1, 8, 256, 256))
    params = sum(p.numel() for p in net.parameters())
    return f"forward 1x8x256x256 -> {tuple(out.shape)}, {params / 1e6:.1f}M params"


check("torch tensor op", _tensor_op)
check("torch.amp", _amp)
check("GlacialLake_HybridNet", _hybrid_net)

print()
if failures:
    print(f"{len(failures)} check(s) FAILED: {', '.join(failures)}")
    sys.exit(1)
print("All checks passed - environment is ready.")
