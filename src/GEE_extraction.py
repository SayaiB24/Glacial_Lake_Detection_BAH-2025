import ee
import datetime

ee.Authenticate()
ee.Initialize(project='concise-orb-312405')

# Define ROI (circular buffer)
lat, lon = 27.374618669873204, 88.76078811371141
buffer_km = 5
roi = ee.Geometry.Point([lon, lat]).buffer(buffer_km * 1000)

start_date = '2024-07-01'
end_date = '2024-07-31'

datasets = {
    "Sentinel-2": "COPERNICUS/S2_SR_HARMONIZED",
    "Landsat-8": "LANDSAT/LC08/C02/T1_L2",
    "Landsat-9": "LANDSAT/LC09/C02/T1_L2"
}

scales = {
    "Sentinel-2": 10,
    "Landsat-8": 30,
    "Landsat-9": 30
}

# Optional: Cloud masking for Sentinel-2
def mask_s2_clouds(img):
    cloud_prob = img.select('MSK_CLDPRB')
    mask = cloud_prob.lt(20)  # Cloud probability < 20%
    return img.updateMask(mask)

for name, dataset in datasets.items():
    print(f"🔄 Processing: {name}")
    try:
        collection = ee.ImageCollection(dataset).filterDate(start_date, end_date).filterBounds(roi)

        if name == "Sentinel-2":
            collection = collection.map(mask_s2_clouds)

        image = collection.median().clip(roi)  # No select() – export all bands

        task = ee.batch.Export.image.toDrive(
            image=image,
            description=f"{name.replace('-', '')}_Glacial_Lake_July2024_AllBands",
            folder='GEE_Exports',
            region=roi.coordinates().getInfo(),
            scale=scales[name],
            crs='EPSG:4326',
            maxPixels=1e13
        )
        task.start()
        print(f"✅ Export started for {name}. Check Google Drive > GEE_Exports.")

    except Exception as e:
        print(f"❌ Failed for {name}: {e}")
