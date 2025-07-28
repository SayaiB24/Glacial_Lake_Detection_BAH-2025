import rasterio
import matplotlib.pyplot as plt
import numpy as np

# Use raw string to avoid escape sequence issues
file_path = r'data\LISS3\processed\LISS3_1\LISS3_1_input_stack.tif'

# Load the TIFF file
with rasterio.open(file_path) as src:
    # Read all bands
    bands = src.read()  # Shape: (bands, height, width)
    num_bands = bands.shape[0]
    print(f'Number of bands: {num_bands}')

# Display each band
fig, axes = plt.subplots(1, num_bands, figsize=(5 * num_bands, 5))
for i in range(num_bands):
    # Normalize for better visualization
    band = bands[i]
    band = (band - band.min()) / (band.max() - band.min())  # Normalize to [0, 1]
    axes[i].imshow(band, cmap='gray')
    axes[i].set_title(f'Band {i+1}')
    axes[i].axis('off')
plt.tight_layout()
plt.show()