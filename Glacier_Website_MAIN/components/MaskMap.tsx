"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/**
 * Renders detected lake polygons on a satellite basemap.
 *
 * Loaded through next/dynamic with ssr:false — Leaflet touches `window` at
 * import time and would break prerendering otherwise.
 */
export interface MaskMapProps {
  /** GeoJSON FeatureCollection of detected lakes, in EPSG:4326. */
  polygons: GeoJSON.FeatureCollection | null;
  /** Optional [west, south, east, north] to frame the view. */
  bounds?: [number, number, number, number] | null;
  className?: string;
}

export default function MaskMap({ polygons, bounds, className }: MaskMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.GeoJSON | null>(null);

  // Create the map once.
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;
    mapRef.current = L.map(containerRef.current, { scrollWheelZoom: true }).setView(
      [27.53, 88.51],
      10,
    );
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { attribution: "Tiles &copy; Esri", maxZoom: 18 },
    ).addTo(mapRef.current);

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Redraw whenever the detections change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }
    if (!polygons || polygons.features.length === 0) {
      if (bounds) map.fitBounds([[bounds[1], bounds[0]], [bounds[3], bounds[2]]]);
      return;
    }

    layerRef.current = L.geoJSON(polygons, {
      style: { color: "#f43f5e", weight: 2, fillColor: "#fb7185", fillOpacity: 0.55 },
      onEachFeature: (feature, layer) => {
        const p = feature.properties ?? {};
        layer.bindPopup(
          `<strong>${p.lake_id ?? "Lake"}</strong><br/>Area: ${
            typeof p.area_ha === "number" ? p.area_ha.toFixed(3) : "?"
          } ha`,
        );
      },
    }).addTo(map);

    const layerBounds = layerRef.current.getBounds();
    if (layerBounds.isValid()) {
      map.fitBounds(layerBounds, { padding: [24, 24], maxZoom: 15 });
    } else if (bounds) {
      map.fitBounds([[bounds[1], bounds[0]], [bounds[3], bounds[2]]]);
    }
  }, [polygons, bounds]);

  return <div ref={containerRef} className={className ?? "w-full h-96 rounded-lg border"} />;
}
