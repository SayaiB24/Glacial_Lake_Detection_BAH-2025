// components/MapDisplay.tsx
'use client';

import { useState } from 'react';
import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { LatLngExpression } from 'leaflet';

// Import your GeoJSON data
// The '@' alias should be configured in your tsconfig.json to point to the root or src directory.
// If it's not, you can use relative paths like '../data/glaciers.geojson'.
import glaciersData from '@/data/glaciers.geojson';
import lakesData from '@/data/lakes.geojson';
import riversData from '@/data/rivers.geojson';
import watershedsData from '@/data/watersheds.geojson';

import { BaseLayerControl } from './ui/BaseLayerControl'; // We will create this next

// Define your base layers
const baseLayers = {
  Satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
  },
  Terrain: {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)'
  },
  Hybrid: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }
};

export function MapDisplay() {
  const [selectedLayer, setSelectedLayer] = useState('Hybrid');

  const position: LatLngExpression = [27.9881, 86.9250]; // Example: Mount Everest
  const zoom = 10;

  const currentLayer = baseLayers[selectedLayer as keyof typeof baseLayers];

  return (
    <div className="relative h-full w-full">
      <MapContainer center={position} zoom={zoom} scrollWheelZoom={true} style={{ height: '100%', width: '100%' }}>
        {/* The key prop ensures React re-renders the TileLayer when the URL changes */}
        <TileLayer
          key={selectedLayer}
          url={currentLayer.url}
          attribution={currentLayer.attribution}
        />

        {/* Add your GeoJSON layers here */}
        <GeoJSON data={glaciersData as any} style={{ color: 'cyan' }} />
        <GeoJSON data={lakesData as any} style={{ color: 'blue' }} />
        <GeoJSON data={riversData as any} style={{ color: 'navy' }} />
        <GeoJSON data={watershedsData as any} style={{ color: 'green' }} />

      </MapContainer>
      <div className="absolute top-4 right-4 z-[1000] bg-white p-4 rounded-md shadow-lg">
        <BaseLayerControl
          layers={Object.keys(baseLayers)}
          selectedLayer={selectedLayer}
          onLayerChange={setSelectedLayer}
        />
      </div>
    </div>
  );
}