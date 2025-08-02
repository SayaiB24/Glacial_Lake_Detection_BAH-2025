"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog" // For Modal
import {
  Search, Layers, Home, ZoomIn, ZoomOut, Ruler, Download, ChevronLeft, ChevronRight, Expand, Info, BarChart3, FileText,
  TriangleIcon as ExclamationTriangle, MapIcon, Snowflake, MapPin, Droplets,
} from "lucide-react"
import Link from "next/link"


// Holds the details for each base map
const baseLayerSources = {
  satellite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: 'Tiles &copy; Esri' },
  terrain: { url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', attribution: 'Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap' },
  hybrid: { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '© OpenStreetMap contributors' }
};

interface LayerData { id: string; name: string; enabled: boolean; icon: any; }
interface FeatureInfo { type: string; properties: any; }

export default function GISMapPage() {
  const mapRef = useRef<HTMLDivElement>(null)
  const pageContainerRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<any>(null)
  const baseLayerRef = useRef<any>(null)
  const drawnItemsRef = useRef<any>(null) // <-- ADDED: Ref to store drawings
  const [isLayerPanelOpen, setIsLayerPanelOpen] = useState(true)
  const [isInfoPanelOpen, setIsInfoPanelOpen] = useState(true)
  const [activeTab, setActiveTab] = useState("information")
  const [selectedFeature, setSelectedFeature] = useState<FeatureInfo | null>(null)
  const [coordinates, setCoordinates] = useState("28.2380° N, 83.9956° E")
  const [searchQuery, setSearchQuery] = useState("")
  const layerRefs = useRef<{ [key: string]: any }>({})

  const [layers, setLayers] = useState<LayerData[]>([
    { id: "satellite", name: "Satellite", enabled: false, icon: MapIcon },
    { id: "terrain", name: "Terrain", enabled: false, icon: MapIcon },
    { id: "hybrid", name: "Hybrid", enabled: true, icon: MapIcon },
  ]);

  const [featureLayers, setFeatureLayers] = useState<LayerData[]>([
    { id: "lakes", name: "Glacial Lakes", enabled: true, icon: Droplets },
    { id: "rivers", name: "Rivers", enabled: true, icon: Droplets },
    { id: "glaciers", name: "Glaciers", enabled: false, icon: Snowflake },
    { id: "watersheds", name: "Watersheds", enabled: false, icon: MapPin },
  ]);

  useEffect(() => {
    // ADDED: A check to prevent the map from re-initializing on re-renders
    if (mapInstance.current) return;

    // ADDED: Imports are moved inside to run only on the client, fixing the error.
    const L = require("leaflet");
    require("leaflet/dist/leaflet.css");
    require("leaflet-draw/dist/leaflet.draw.css");
    require("leaflet-draw");

    // This check ensures the map container element exists before proceeding.
    if (!mapRef.current) return;
    
    // --- Your original code starts here (it's correct) ---
    mapInstance.current = L.map(mapRef.current, { center: [28.238, 83.9956], zoom: 6, zoomControl: false });
    
    // Initialize the container for drawn items
    drawnItemsRef.current = new L.FeatureGroup();
    mapInstance.current.addLayer(drawnItemsRef.current);

    handleBaseLayerChange('hybrid');
    loadAllFeatureLayers();

    mapInstance.current.on("mousemove", (e: any) => {
      const lat = e.latlng.lat.toFixed(4);
      const lng = e.latlng.lng.toFixed(4);
      setCoordinates(`${lat}° N, ${lng}° E`);
    });
    
    mapInstance.current.on(L.Draw.Event.CREATED, (event: any) => {
      const layer = event.layer;
      drawnItemsRef.current.addLayer(layer);

      if (event.layerType === 'polygon') {
        const area = L.GeometryUtil.geodesicArea(layer.getLatLngs()[0]);
        const areaInKm = (area / 1000000).toFixed(2);
        layer.bindPopup(`<b>Area:</b> ${areaInKm} km²`).openPopup();
      }
      if (event.layerType === 'polyline') {
        let distance = 0;
        const latlngs = layer.getLatLngs();
        for (let i = 0; i < latlngs.length - 1; i++) {
          distance += latlngs[i].distanceTo(latlngs[i + 1]);
        }
        const distanceInKm = (distance / 1000).toFixed(2);
        layer.bindPopup(`<b>Distance:</b> ${distanceInKm} km`).openPopup();
      }
    });

    // MODIFIED: A more robust cleanup function
    return () => {
        if(mapInstance.current) {
            mapInstance.current.remove();
            mapInstance.current = null;
        }
    };
  }, []); 

  
  const handleBaseLayerChange = (layerId: string) => {
    if (!mapInstance.current || !L) return;
    setLayers((prev) => prev.map((l) => ({ ...l, enabled: l.id === layerId })));
    if (baseLayerRef.current) { mapInstance.current.removeLayer(baseLayerRef.current); }
    const source = baseLayerSources[layerId as keyof typeof baseLayerSources];
    const newBaseLayer = L.tileLayer(source.url, { attribution: source.attribution });
    newBaseLayer.addTo(mapInstance.current);
    baseLayerRef.current = newBaseLayer;
    newBaseLayer.bringToBack();
  };

  const loadAllFeatureLayers = async () => {
    const layersToLoad = [
      { id: 'lakes', path: '/lakes.geojson', style: { color: "#3B82F6", weight: 2, fillOpacity: 0.6, fillColor: "#93C5FD" }, type: 'Lake' },
      { id: 'rivers', path: '/rivers.geojson', style: { color: "#06B6D4", weight: 3, opacity: 0.8 }, type: 'River' },
      { id: 'glaciers', path: '/glaciers.geojson', style: { color: "#A5B4FC", weight: 1, fillOpacity: 0.7, fillColor: "#C7D2FE" }, type: 'Glacier' },
      { id: 'watersheds', path: '/watersheds.geojson', style: { color: "#16A34A", weight: 2, fillOpacity: 0.2, fillColor: "#86EFAC" }, type: 'Watershed' }
    ];

    for (const layerInfo of layersToLoad) {
      try {
        const response = await fetch(layerInfo.path);
        if (!response.ok) throw new Error(`Failed to fetch ${layerInfo.path}`);
        const data = await response.json();
        
        const geoJsonLayer = L.geoJSON(data, {
          style: layerInfo.style,
          onEachFeature: (feature: any, layer: any) => {
            layer.on("click", () => setSelectedFeature({ type: layerInfo.type, properties: feature.properties }));
            layer.bindPopup(`<div class="p-1 font-sans"><h4 class="font-bold">${feature.properties.name || `Unnamed ${layerInfo.type}`}</h4></div>`);
          },
        });
        layerRefs.current[layerInfo.id] = geoJsonLayer;
        if (featureLayers.find(l => l.id === layerInfo.id)?.enabled) {
            geoJsonLayer.addTo(mapInstance.current);
        }
      } catch (error) { console.error(`Error loading ${layerInfo.id}:`, error); }
    }
  };

  const toggleLayer = (layerId: string) => {
    const layer = layerRefs.current[layerId];
    if (!layer) return;
    const isEnabled = featureLayers.find((l) => l.id === layerId)?.enabled;
    if (isEnabled) { mapInstance.current.removeLayer(layer); } 
    else { mapInstance.current.addLayer(layer); }
    setFeatureLayers((prev) => prev.map((l) => (l.id === layerId ? { ...l, enabled: !l.enabled } : l)));
  };

  const handleSearch = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || !searchQuery) return;
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${searchQuery}`);
    const data = await response.json();
    if (data && data.length > 0) {
      mapInstance.current.setView([data[0].lat, data[0].lon], 13);
    } else { alert("Location not found."); }
  };

  const startMeasuring = (tool: 'distance' | 'area') => {
    if (!mapInstance.current || !L) return;
    const drawOptions = {
        polyline: { shapeOptions: { color: '#f357a1', weight: 4 } },
        polygon: { shapeOptions: { color: '#f357a1', weight: 4 }, showArea: true },
    };
    if(tool === 'distance') new L.Draw.Polyline(mapInstance.current, drawOptions.polyline).enable();
    if(tool === 'area') new L.Draw.Polygon(mapInstance.current, drawOptions.polygon).enable();
  };
  
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) pageContainerRef.current?.requestFullscreen();
    else document.exitFullscreen();
  };

  const downloadData = (format: string) => {
    if (!selectedFeature) { alert("Please select a feature first"); return; }
    if (format === 'geojson') {
        const geojsonData = { type: "Feature", properties: selectedFeature.properties, geometry: null };
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(geojsonData, null, 2));
        const link = document.createElement("a");
        link.href = dataStr;
        link.download = `${selectedFeature.properties.name || 'feature'}.geojson`;
        link.click();
    } else { alert(`Functionality for downloading as ${format.toUpperCase()} is not implemented yet.`); }
  };

  const zoomIn = () => mapInstance.current?.zoomIn();
  const zoomOut = () => mapInstance.current?.zoomOut();
  const goHome = () => mapInstance.current?.setView([28.238, 83.9956], 6);

  return (
    <div className="h-screen flex flex-col bg-gray-50" ref={pageContainerRef}>
      {/* Header */}
      <header className="bg-white shadow-sm border-b z-10 h-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full">
          <div className="flex justify-between items-center h-full">
            <Link href="/" className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                    <span className="text-white font-bold text-sm">❄</span>
                </div>
                <span className="text-xl font-bold text-gray-900">GlacierWatch</span>
            </Link>
            <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input placeholder="Search locations..." className="pl-10 w-64" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={handleSearch} />
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 flex relative">
        {/* Left Sidebar */}
        <div className={`bg-white shadow-lg z-20 transition-transform duration-300 border-r ${isLayerPanelOpen ? "translate-x-0" : "-translate-x-full"}`} style={{ width: "300px" }}>
            <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
                <h3 className="text-lg font-semibold flex items-center text-gray-700"><Layers className="w-5 h-5 mr-2" />Map Layers</h3>
                <Button variant="ghost" size="sm" onClick={() => setIsLayerPanelOpen(false)}><ChevronLeft className="w-4 h-4" /></Button>
            </div>
            <div className="p-4 space-y-4 overflow-y-auto">
                <div className="space-y-2"> {/* Base Layers */}
                    <div className="flex items-center space-x-2 text-sm font-medium text-gray-700 mb-2"><MapIcon className="w-4 h-4" /><span>Base Layers</span></div>
                    {layers.map((layer) => (
                        <div key={layer.id} className="flex items-center space-x-3 pl-6">
                        <input type="radio" name="baseLayer" id={layer.id} checked={layer.enabled} onChange={() => handleBaseLayerChange(layer.id)} className="text-blue-600" />
                        <label htmlFor={layer.id} className="text-sm text-gray-600 cursor-pointer">{layer.name}</label>
                        </div>
                    ))}
                </div>
                <div className="space-y-2"> {/* Glacial Features */}
                    <div className="flex items-center space-x-2 text-sm font-medium text-gray-700 mb-2"><Snowflake className="w-4 h-4" /><span>Glacial Features</span></div>
                    {featureLayers.map((layer) => (
                        <div key={layer.id} className="flex items-center space-x-3 pl-6">
                            <Checkbox id={layer.id} checked={layer.enabled} onCheckedChange={() => toggleLayer(layer.id)} />
                            <label htmlFor={layer.id} className="text-sm text-gray-600 cursor-pointer">{layer.name}</label>
                        </div>
                    ))}
                </div>
                <div className="pt-4 border-t"> {/* Analysis Tools */}
                    <h4 className="text-sm font-medium text-gray-700 mb-3">Analysis Tools</h4>
                    <div className="space-y-2">
                        <Button onClick={() => startMeasuring('distance')} variant="outline" size="sm" className="w-full justify-start bg-transparent"><Ruler className="w-4 h-4 mr-2" />Measure Distance</Button>
                        <Button onClick={() => startMeasuring('area')} variant="outline" size="sm" className="w-full justify-start bg-transparent"><MapIcon className="w-4 h-4 mr-2" />Measure Area</Button>
                    </div>
                </div>
            </div>
        </div>
        {!isLayerPanelOpen && <Button className="absolute top-4 left-4 z-20" onClick={() => setIsLayerPanelOpen(true)} size="sm"><ChevronRight className="w-4 h-4" /></Button>}

        {/* Map Container */}
        <div className="flex-1 relative">
            <div ref={mapRef} className="w-full h-full" />
            <div className="absolute top-4 right-4 z-20 space-y-2"> {/* Map Controls */}
                <Button onClick={zoomIn} size="sm" className="block w-10 h-10 p-0"><ZoomIn className="w-4 h-4" /></Button>
                <Button onClick={zoomOut} size="sm" className="block w-10 h-10 p-0"><ZoomOut className="w-4 h-4" /></Button>
                <Button onClick={goHome} size="sm" className="block w-10 h-10 p-0"><Home className="w-4 h-4" /></Button>
                <Button onClick={toggleFullscreen} size="sm" className="block w-10 h-10 p-0"><Expand className="w-4 h-4" /></Button>
            </div>
        </div>

        {/* Right Sidebar */}
        <div className={`bg-white shadow-lg z-20 transition-transform duration-300 border-l ${isInfoPanelOpen ? "translate-x-0" : "translate-x-full"}`} style={{ width: "350px" }}>
            <div className="p-4 h-full overflow-y-auto">
                {activeTab === "information" && selectedFeature && (
                    <div className="space-y-6">
                        <div>
                            <h4 className="font-semibold text-gray-900 mb-3 pb-2 border-b">Selected Feature</h4>
                             {/* Properties will be shown in the modal */}
                        </div>
                        <div>
                            <h4 className="font-semibold text-gray-900 mb-3 pb-2 border-b">Risk Assessment</h4>
                            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-3">
                                <div className="flex items-center space-x-2 text-yellow-800 font-medium mb-2"><ExclamationTriangle className="w-4 h-4" /><span>{selectedFeature.properties.risk_level || "Unknown"} Risk</span></div>
                                <p className="text-sm text-yellow-700">Based on current monitoring data, this feature shows a {selectedFeature.properties.risk_level?.toLowerCase() || 'n/a'} risk. Regular monitoring recommended.</p>
                            </div>
                            <Dialog>
                                <DialogTrigger asChild>
                                    <Button className="w-full bg-blue-600 hover:bg-blue-700">View Detailed Assessment</Button>
                                </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader><DialogTitle>Detailed Information: {selectedFeature.properties.name}</DialogTitle></DialogHeader>
                                    <div className="space-y-2 text-sm mt-4 max-h-96 overflow-y-auto">
                                        {Object.entries(selectedFeature.properties).map(([key, value]) => (
                                            <div key={key} className="flex justify-between border-b pb-1">
                                                <span className="text-gray-600 capitalize">{key.replace(/_/g, ' ')}</span>
                                                <span className="font-medium text-right">{String(value)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </DialogContent>
                            </Dialog>
                        </div>
                        <div>
                            <h4 className="font-semibold text-gray-900 mb-3 pb-2 border-b">Download Data</h4>
                            <div className="space-y-2">
                                <Button className="w-full justify-between" variant="outline" onClick={() => downloadData('geojson')}><div className="flex items-center"><FileText className="w-4 h-4 mr-2" />GeoJSON</div><Download className="w-4 h-4" /></Button>
                                <Button className="w-full justify-between" variant="outline" onClick={() => downloadData('shp')}><div className="flex items-center"><FileText className="w-4 h-4 mr-2" />Shapefile</div><Download className="w-4 h-4" /></Button>
                                <Button className="w-full justify-between" variant="outline" onClick={() => downloadData('pdf')}><div className="flex items-center"><FileText className="w-4 h-4 mr-2" />PDF Report</div><Download className="w-4 h-4" /></Button>
                            </div>
                        </div>
                    </div>
                )}
                {activeTab === "information" && !selectedFeature && (
                    <div className="text-center text-gray-500 pt-16">
                        <Info className="mx-auto w-12 h-12 mb-4" />
                        <p>Click on a feature on the map to see its information.</p>
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  )
}