import rasterio
import numpy as np
import matplotlib.pyplot as plt

# File paths
input_stack_path = r'data\LISS3\processed\LISS3_1\LISS3_1_input_stack.tif'
mask_path = r'data\LISS3\masks\LISS3_1\LISS3_1_lake_mask.tif'

# Load the input stack (8 bands)
with rasterio.open(input_stack_path) as src_input:
    input_img = src_input.read()  # Shape: (8, height, width)
    input_shape = input_img.shape
    print(f'Input stack: {input_shape} (bands, height, width)')
    print(f'Input band descriptions: {src_input.descriptions}')

# Load the lake mask
with rasterio.open(mask_path) as src_mask:
    mask_img = src_mask.read(1)  # Read single band, Shape: (height, width)
    mask_shape = mask_img.shape
    print(f'Mask: {mask_shape} (height, width)')
    print(f'Mask unique values: {np.unique(mask_img)}')  # Check classes (e.g., 0, 1)

# Verify spatial alignment
if input_shape[1:] != mask_shape:
    raise ValueError(f'Mismatch in dimensions: Input {input_shape[1:]} vs Mask {mask_shape}')

# Transpose input stack to (height, width, bands) for model
input_img = input_img.transpose(1, 2, 0)  # Shape: (height, width, 8)

# Normalize input stack (optional, recommended)
input_img = input_img.astype(float)
for i in range(input_img.shape[2]):
    band = input_img[:, :, i]
    band = np.clip(band, np.percentile(band, 2), np.percentile(band, 98))  # Clip outliers
    band_min, band_max = band.min(), band.max()
    if band_max > band_min:
        input_img[:, :, i] = (band - band_min) / (band_max - band_min)

# Prepare for training
# Example: TensorFlow (uncomment and adjust for your model)
"""
import tensorflow as tf
model = tf.keras.Sequential([
    tf.keras.layers.Conv2D(32, 3, activation='relu', input_shape=(input_shape[1], input_shape[2], 8)),
    # Add other layers (e.g., U-Net for segmentation)
    tf.keras.layers.Conv2D(1, 1, activation='sigmoid')  # Binary segmentation
])
model.compile(optimizer='adam', loss='binary_crossentropy', metrics=['accuracy'])
model.fit(input_img[np.newaxis, ...], mask_img[np.newaxis, ..., np.newaxis], epochs=10)
"""

# Optional: Visualize input stack (false-color) and mask
plt.figure(figsize=(12, 5))
# False-color composite (NIR, Red, Green)
plt.subplot(1, 2, 1)
plt.imshow(input_img[:, :, [2, 1, 0]])  # Bands 3, 2, 1
plt.title('False-Color Composite (NIR, Red, Green)')
plt.axis('off')
# Lake mask
plt.subplot(1, 2, 2)
plt.imshow(mask_img, cmap='binary')
plt.title('Lake Mask')
plt.axis('off')
plt.tight_layout()
plt.show()