export const runtime = "nodejs";

import { NextResponse } from "next/server";
import ee from "@google/earthengine";

// Authentication function
const runGeeAuthentication = () => {
  return new Promise<void>((resolve, reject) => {
    try {
      const credentialsJsonString = process.env.GEE_CREDENTIALS_JSON;
      if (!credentialsJsonString) {
        throw new Error("Server configuration error: GEE_CREDENTIALS_JSON environment variable is not set.");
      }
      const privateKey = JSON.parse(credentialsJsonString);
      privateKey.private_key = privateKey.private_key.replace(/\\n/g, '\n');
      ee.data.authenticateViaPrivateKey(
        privateKey,
        () => {
          console.log("GEE Authentication Successful.");
          ee.initialize(null, null, resolve, reject);
        },
        (error: string) => {
          console.error("GEE private key authentication error:", error);
          reject(new Error(error));
        }
      );
    } catch (e: any) {
      console.error("Failed to setup GEE Authentication:", e.message);
      reject(e);
    }
  });
};

/**
 * Simplified lake area calculation using only Landsat 8/9 data
 */
const getAdvancedLakeAreaForYear = (lakeGeometry: any, targetYear: number): any => {
    const geeGeometry = ee.Geometry(lakeGeometry);
    
    // Use JavaScript number directly in string interpolation
    const startDate = `${targetYear}-01-01`;
    const endDate = `${targetYear}-12-31`;
    
    // Use only Landsat 8 and 9 collections
    const landsat8 = ee.ImageCollection("LANDSAT/LC08/C02/T1_L2")
        .filterBounds(geeGeometry)
        .filterDate(startDate, endDate)
        .filter(ee.Filter.lt('CLOUD_COVER', 50))
        .map((image: any) => {
            // Apply scaling factors
            const opticalBands = image.select(['SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B6', 'SR_B7'])
                .multiply(0.0000275).add(-0.2);
            
            // Cloud masking for Landsat
            const qaMask = image.select('QA_PIXEL');
            const cloudMask = qaMask.bitwiseAnd(1 << 3).eq(0) // Cloud
                .and(qaMask.bitwiseAnd(1 << 4).eq(0)); // Cloud shadow
            
            return opticalBands.updateMask(cloudMask)
                .select(['SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B6', 'SR_B7'], 
                        ['BLUE', 'GREEN', 'RED', 'NIR', 'SWIR1', 'SWIR2'])
                .copyProperties(image, ["system:time_start"]);
        });
    
    const landsat9 = ee.ImageCollection("LANDSAT/LC09/C02/T1_L2")
        .filterBounds(geeGeometry)
        .filterDate(startDate, endDate)
        .filter(ee.Filter.lt('CLOUD_COVER', 50))
        .map((image: any) => {
            // Apply scaling factors
            const opticalBands = image.select(['SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B6', 'SR_B7'])
                .multiply(0.0000275).add(-0.2);
            
            // Cloud masking for Landsat
            const qaMask = image.select('QA_PIXEL');
            const cloudMask = qaMask.bitwiseAnd(1 << 3).eq(0) // Cloud
                .and(qaMask.bitwiseAnd(1 << 4).eq(0)); // Cloud shadow
            
            return opticalBands.updateMask(cloudMask)
                .select(['SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B6', 'SR_B7'], 
                        ['BLUE', 'GREEN', 'RED', 'NIR', 'SWIR1', 'SWIR2'])
                .copyProperties(image, ["system:time_start"]);
        });
    
    // Merge only Landsat collections (both have same data type now)
    const allImages = landsat8.merge(landsat9);
    
    // Check if we have any images
    const imageCount = allImages.size();
    
    // Create temporal composite using median
    const composite = allImages.median();
    
    // Multi-spectral water detection
    const calculateWaterIndices = (image: any) => {
        // NDWI (Normalized Difference Water Index)
        const ndwi = image.normalizedDifference(['GREEN', 'NIR']).rename('NDWI');
        
        // MNDWI (Modified Normalized Difference Water Index)
        const mndwi = image.normalizedDifference(['GREEN', 'SWIR1']).rename('MNDWI');
        
        // AWEIsh (Automated Water Extraction Index - shadow)
        const aweish = image.expression(
            'BLUE + 2.5 * GREEN - 1.5 * (NIR + SWIR1) - 0.25 * SWIR2', {
                'BLUE': image.select('BLUE'),
                'GREEN': image.select('GREEN'),
                'NIR': image.select('NIR'),
                'SWIR1': image.select('SWIR1'),
                'SWIR2': image.select('SWIR2')
            }).rename('AWEIsh');
        
        // AWEInsh (Automated Water Extraction Index - non-shadow)
        const aweinsh = image.expression(
            '4 * (GREEN - SWIR1) - (0.25 * NIR + 2.75 * SWIR2)', {
                'GREEN': image.select('GREEN'),
                'NIR': image.select('NIR'),
                'SWIR1': image.select('SWIR1'),
                'SWIR2': image.select('SWIR2')
            }).rename('AWEInsh');
        
        return image.addBands([ndwi, mndwi, aweish, aweinsh]);
    };
    
    // Apply water indices calculation
    const imageWithIndices = calculateWaterIndices(composite);
    
    // Advanced water detection using multiple indices
    const waterMask = ee.Image(ee.Algorithms.If(
        imageCount.gt(0),
        imageWithIndices.select('NDWI').gt(0.0)
            .and(imageWithIndices.select('MNDWI').gt(-0.1))
            .or(imageWithIndices.select('AWEIsh').gt(0.0))
            .or(imageWithIndices.select('AWEInsh').gt(0.1)),
        ee.Image(0)
    ));
    
    // Morphological operations to clean up the mask
    const kernel = ee.Kernel.circle({radius: 1, units: 'pixels'});
    const cleanedWaterMask = waterMask
        .focal_mode({kernel: kernel, iterations: 1})
        .focal_max({kernel: kernel, iterations: 1})
        .focal_min({kernel: kernel, iterations: 1});
    
    // Clip to the lake geometry buffer
    const bufferedGeometry = geeGeometry.buffer(100);
    const clippedWaterMask = cleanedWaterMask.clip(bufferedGeometry);
    
    // Convert to vectors and find water bodies
    const waterVectors = clippedWaterMask.selfMask().reduceToVectors({
        geometry: bufferedGeometry,
        scale: 30, // Landsat resolution
        maxPixels: 1e9,
        bestEffort: true,
        tileScale: 2
    });
    
    const waterFeatures = ee.FeatureCollection(waterVectors);
    const featureCount = waterFeatures.size();
    
    // Calculate area of water bodies that intersect with the original geometry
    const intersectingFeatures = waterFeatures.filterBounds(geeGeometry);
    const intersectingCount = intersectingFeatures.size();
    
    // Area calculation
    const area = ee.Number(ee.Algorithms.If(
        intersectingCount.gt(0),
        intersectingFeatures
            .map((feature: any) => {
                const intersection = feature.intersection(geeGeometry);
                return ee.Feature(null, {'area': intersection.area(1)});
            })
            .reduceColumns(ee.Reducer.sum(), ['area'])
            .get('sum'),
        ee.Number(ee.Algorithms.If(
            featureCount.gt(0),
            waterFeatures.geometry().area(1),
            0
        ))
    ));
    
    // Return both the area and metadata
    return ee.Dictionary({
        'area': area.divide(10000), // Convert to hectares
        'imageCount': imageCount,
        'featureCount': featureCount,
        'intersectingCount': intersectingCount,
        'year': ee.Number(targetYear)
    });
};

/**
 * Time series analysis function with Landsat only
 */
const getTimeSeriesAnalysis = (lakeGeometry: any, startYear: number, endYear: number): any => {
    // Create array of JavaScript numbers first
    const yearsArray = [];
    for (let year = startYear; year <= endYear; year++) {
        yearsArray.push(year);
    }
    
    // Map over JavaScript array
    const yearlyData = yearsArray.map((year: number) => {
        return getAdvancedLakeAreaForYear(lakeGeometry, year);
    });
    
    return ee.Dictionary({
        'timeSeriesData': ee.List(yearlyData),
        'analysisStartYear': ee.Number(startYear),
        'analysisEndYear': ee.Number(endYear)
    });
};

export async function POST(request: Request) {
  try {
    await runGeeAuthentication();

    const { geometry, year, timeSeriesAnalysis } = await request.json();

    if (!geometry || !year) {
      return NextResponse.json({ 
        error: "Lake geometry and year are required parameters." 
      }, { status: 400 });
    }

    const targetYear = parseInt(year);
    
    let results: any;
    
    if (timeSeriesAnalysis && timeSeriesAnalysis.enabled) {
      // Perform time series analysis
      const startYear = timeSeriesAnalysis.startYear || targetYear - 5;
      const endYear = timeSeriesAnalysis.endYear || targetYear;
      
      console.log(`Running Landsat-only time series analysis from ${startYear} to ${endYear}`);
      
      const timeSeriesData = getTimeSeriesAnalysis(geometry, startYear, endYear);
      
      results = await new Promise((resolve, reject) => {
        timeSeriesData.evaluate((data: any, error: any) => {
          if (error) {
            console.error("GEE Time Series Evaluate Error:", error);
            reject(new Error(error));
          } else {
            console.log("Landsat time series analysis completed successfully");
            resolve(data);
          }
        });
      });
      
    } else {
      // Single year comparison analysis
      console.log(`Running Landsat comparison analysis for ${targetYear} vs 2024`);
      
      const selectedYearData = getAdvancedLakeAreaForYear(geometry, targetYear);
      const baseYearData = getAdvancedLakeAreaForYear(geometry, 2024);

      results = await new Promise((resolve, reject) => {
        ee.Dictionary({ 
          selectedYear: selectedYearData, 
          baseYear: baseYearData 
        }).evaluate((data: any, error: any) => {
          if (error) {
            console.error("GEE Evaluate Error:", error);
            reject(new Error(error));
          } else {
            console.log("Landsat comparison analysis completed successfully");
            // Process the results
            const processedData = {
              selectedYear: {
                area: data.selectedYear?.area || 0,
                metadata: {
                  imageCount: data.selectedYear?.imageCount || 0,
                  featureCount: data.selectedYear?.featureCount || 0,
                  intersectingCount: data.selectedYear?.intersectingCount || 0,
                  year: data.selectedYear?.year || targetYear
                }
              },
              baseYear: {
                area: data.baseYear?.area || 0,
                metadata: {
                  imageCount: data.baseYear?.imageCount || 0,
                  featureCount: data.baseYear?.featureCount || 0,
                  intersectingCount: data.baseYear?.intersectingCount || 0,
                  year: data.baseYear?.year || 2024
                }
              },
              areaChange: (data.selectedYear?.area || 0) - (data.baseYear?.area || 0),
              percentageChange: data.baseYear?.area > 0 ? 
                (((data.selectedYear?.area || 0) - (data.baseYear?.area || 0)) / (data.baseYear?.area || 0)) * 100 : 0
            };
            resolve(processedData);
          }
        });
      });
    }

    console.log("Landsat analysis completed, returning results");
    return NextResponse.json(results);

  } catch (error: any) {
    console.error("Error in Landsat GEE API route:", error);
    return NextResponse.json({ 
      error: "Failed to process Earth Engine request.", 
      details: error.message 
    }, { status: 500 });
  }
}
