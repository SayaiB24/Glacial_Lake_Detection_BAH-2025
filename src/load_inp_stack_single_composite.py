import rasterio
import matplotlib.pyplot as plt
import numpy as np

# Use raw string to avoid escape sequence issues
file_path = r'data\LISS3\processed\LISS3_1\LISS3_1_input_stack.tif'

# Load the TIFF file
with rasterio.open(file_path) as src:
    # Read bands for false-color composite (NIR=3, Red=2, Green=1)
    img = src.read([3, 2, 1])  # Adjust indices if band order differs
    img = img.transpose(1, 2, 0)  # Reshape to (height, width, bands)
    num_bands = src.count
    print(f'Number of bands in TIFF: {num_bands}')

# Normalize each band for better visualization
for i in range(img.shape[2]):
    band = img[:, :, i]
    # Clip outliers to 2nd and 98th percentiles for better contrast
    band = np.clip(band, np.percentile(band, 2), np.percentile(band, 98))
    img[:, :, i] = (band - band.min()) / (band.max() - band.min())  # Normalize to [0, 1]

# Display the false-color composite
plt.figure(figsize=(8, 8))
plt.imshow(img)
plt.title('False-Color Composite (NIR, Red, Green)')
plt.axis('off')
plt.show()