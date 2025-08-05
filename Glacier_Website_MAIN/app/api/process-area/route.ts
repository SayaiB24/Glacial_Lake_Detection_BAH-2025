// File: app/api/process-area/route.ts

import { NextRequest, NextResponse } from "next/server";

// Helper function to create a mock polygon within the user's bounding box
const createMockPolygon = (bbox: number[][]) => {
    const minLng = bbox[0][0];
    const minLat = bbox[0][1];
    const maxLng = bbox[1][0];
    const maxLat = bbox[1][1];

    const centerLat = minLat + (maxLat - minLat) / 2;
    const centerLng = minLng + (maxLng - minLng) / 2;
    const size = Math.min(maxLat - minLat, maxLng - minLng) * 0.1;

    return [[
        [centerLng - size, centerLat - size],
        [centerLng + size, centerLat - size],
        [centerLng + size, centerLat + size],
        [centerLng - size, centerLat + size],
        [centerLng - size, centerLat - size],
    ]];
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const areaGeometry = body.area;

    if (!areaGeometry || areaGeometry.type !== 'Polygon') {
        return NextResponse.json({ error: "Invalid area geometry provided." }, { status: 400 });
    }

    // Simulate GEE fetch and AI model processing
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Create a mock GeoJSON response
    const mockBoundingBox = [
        areaGeometry.coordinates[0][0], // min lng, min lat
        areaGeometry.coordinates[0][2], // max lng, max lat
    ];

    const mockLakePolygon = createMockPolygon(mockBoundingBox);
    const mockArea = 0.5 + Math.random(); // Add some randomness

    const mockResponse = {
        polygons: {
            type: "FeatureCollection",
            features: [{
                type: "Feature",
                properties: { area_sqkm: mockArea, confidence: 0.95 },
                geometry: { type: "Polygon", coordinates: mockLakePolygon },
            }],
        },
        stats: {
            lake_count: 1,
            total_area_sqkm: mockArea,
            processing_time_sec: 2.8,
        },
    };

    return NextResponse.json(mockResponse);

  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}