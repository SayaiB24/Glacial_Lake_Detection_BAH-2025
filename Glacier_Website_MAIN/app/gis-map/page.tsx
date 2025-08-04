"use client"

import { useEffect, useRef, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import {
  Search, Layers, Home, ZoomIn, ZoomOut, Ruler, Download, ChevronLeft, ChevronRight, Expand, Info, BarChart3, FileText,
  TriangleIcon as ExclamationTriangle, MapIcon, Snowflake, MapPin, Droplets, Upload
} from "lucide-react"
import Link from "next/link"

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw";
import "leaflet-draw/dist/leaflet.draw.css";

const baseLayerSources = {
  satellite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: 'Tiles &copy; Esri' },
  terrain: { url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', attribution: 'Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap' },
  hybrid: { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '© OpenStreetMap contributors' }
};

interface LayerData { id: string; name: string; enabled: boolean; icon: any; }
interface FeatureInfo { type: string; properties: any; }

function GISMap() {
  const mapRef = useRef<HTMLDivElement>(null)
  const pageContainerRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<any>(null)
  const baseLayerRef = useRef<any>(null)
  const drawnItemsRef = useRef<any>(null)
  const [isLayerPanelOpen, setIsLayerPanelOpen] = useState(true)
  const [isInfoPanelOpen, setIsInfoPanelOpen] = useState(true)
  const [activeTab, setActiveTab] = useState("information")
  const [selectedFeature, setSelectedFeature] = useState<FeatureInfo | null>(null)
  const [coordinates, setCoordinates] = useState("28.2380° N, 83.9956° E")
  const [searchQuery, setSearchQuery] = useState("")
  const [timeSeriesResult, setTimeSeriesResult] = useState<any>(null)
  const [timeSeriesLoading, setTimeSeriesLoading] = useState(false)
  const [timeSeriesError, setTimeSeriesError] = useState<string | null>(null)
  const [selectLakeMode, setSelectLakeMode] = useState(false)
  const [filterMode, setFilterMode] = useState(false)
  const [filterRadius, setFilterRadius] = useState(5)
  const [filterCenter, setFilterCenter] = useState<{lat: number, lng: number} | null>(null)
  const [filterResults, setFilterResults] = useState<any[]>([])
  const [filterLoading, setFilterLoading] = useState(false)
  const [filterError, setFilterError] = useState<string | null>(null)
  const [showFilterResultsPanel, setShowFilterResultsPanel] = useState(false)
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const layerRefs = useRef<{ [key: string]: any }>({})
  const areaFilterMarkerRef = useRef<any>(null)
  const areaFilterCircleRef = useRef<any>(null)
  const timeSeriesMarkerRef = useRef<any>(null)

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

  const searchParams = useSearchParams();

  useEffect(() => {
    if (mapInstance.current) return;

    const L = require("leaflet");
    require("leaflet-draw/dist/leaflet.draw.css");
    require("leaflet-draw");
    if (!mapRef.current) return;

    const query = searchParams.get('query');
    const lat = searchParams.get('lat');
    const lng = searchParams.get('lng');
    const zoom = searchParams.get('zoom');

    let initialCenter: [number, number] = [28.238, 83.9956];
    let initialZoom = 6;

    const createMap = (center: [number, number], zoom: number) => {
        if (mapInstance.current) return;
        mapInstance.current = L.map(mapRef.current, { center, zoom, zoomControl: false });
        drawnItemsRef.current = new L.FeatureGroup();
        mapInstance.current.addLayer(drawnItemsRef.current);
        loadAllFeatureLayers();
        handleBaseLayerChange('hybrid');
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
    };

    const geocodeQueryAndSetView = async (searchQuery: string) => {
        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${searchQuery}`);
            const data = await response.json();
            if (data && data.length > 0) {
                createMap([data[0].lat, data[0].lon], 13);
            } else {
                console.warn("Location from query not found, using default.");
                createMap(initialCenter, initialZoom);
            }
        } catch (error) {
            console.error("Geocoding failed:", error);
            createMap(initialCenter, initialZoom);
        }
    };

    if (query) {
        geocodeQueryAndSetView(query);
    } else {
        if (lat && lng) {
            initialCenter = [parseFloat(lat), parseFloat(lng)];
            initialZoom = zoom ? parseInt(zoom) : 10;
        }
        createMap(initialCenter, initialZoom);
    }

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [searchParams]);

  useEffect(() => {
    if (!mapInstance.current) return;
    const handleMapClick = (e: any) => {
      if (filterMode) {
        setFilterCenter({ lat: e.latlng.lat, lng: e.latlng.lng });
        if (areaFilterMarkerRef.current) {
          mapInstance.current.removeLayer(areaFilterMarkerRef.current);
        }
        areaFilterMarkerRef.current = L.marker([e.latlng.lat, e.latlng.lng], { icon: L.icon({ iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png', iconSize: [25, 41], iconAnchor: [12, 41] }) }).addTo(mapInstance.current);

        if (areaFilterCircleRef.current) {
          mapInstance.current.removeLayer(areaFilterCircleRef.current);
        }
        areaFilterCircleRef.current = L.circle([e.latlng.lat, e.latlng.lng], {
          radius: filterRadius * 1000, color: "#2563eb", fillColor: "#60a5fa", fillOpacity: 0.2, weight: 2, dashArray: "4 4"
        }).addTo(mapInstance.current);
      }
      if (selectLakeMode) {
        if (timeSeriesMarkerRef.current) {
          mapInstance.current.removeLayer(timeSeriesMarkerRef.current);
        }
        timeSeriesMarkerRef.current = L.marker([e.latlng.lat, e.latlng.lng], { icon: L.icon({ iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png', iconSize: [25, 41], iconAnchor: [12, 41] }) }).addTo(mapInstance.current);
      }
    };
    mapInstance.current.on("click", handleMapClick);
    return () => {
      if (mapInstance.current) {
        mapInstance.current.off("click", handleMapClick);
      }
    };
  }, [filterMode, selectLakeMode, filterRadius]);

  const runLakeAreaFilter = async (lat: number, lng: number, radiusKm: number) => {
    setFilterLoading(true); setFilterError(null); setFilterResults([]);
    try {
      const lakesLayer = layerRefs.current["lakes"];
      if (!lakesLayer) throw new Error("Lakes data not loaded");
      const found: any[] = [];
      lakesLayer.eachLayer((layer: any) => {
        if (layer.feature?.geometry?.type === "Point") {
          const [lakeLng, lakeLat] = layer.feature.geometry.coordinates;
          const R = 6371; const dLat = (lakeLat - lat) * Math.PI / 180; const dLng = (lakeLng - lng) * Math.PI / 180;
          const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat*Math.PI/180) * Math.cos(lakeLat*Math.PI/180) * Math.sin(dLng/2) * Math.sin(dLng/2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); const d = R * c;
          if (d <= radiusKm) found.push({ ...layer.feature.properties, lat: lakeLat, lng: lakeLng, risk_level: layer.feature.properties.risk_level || "Unknown", distance_km: d.toFixed(2) });
        }
      });
      setFilterResults(found); setShowFilterResultsPanel(true);
      if (areaFilterMarkerRef.current && mapInstance.current) { mapInstance.current.removeLayer(areaFilterMarkerRef.current); areaFilterMarkerRef.current = null; }
    } catch (err: any) { setFilterError(err.message || "Error occurred");
    } finally { setFilterLoading(false); }
  }

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

  const handleTimeSeriesDetection = async (coords: [number, number]) => {
    setTimeSeriesLoading(true); setTimeSeriesError(null); setTimeSeriesResult(null);
    try {
      const res = await fetch("/api/detect_glacial_lake?mode=timeseries", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ longitude: coords[0], latitude: coords[1] })
      });
      if (!res.ok) throw new Error("Time series detection failed");
      const data = await res.json();
      setTimeSeriesResult(data);
    } catch (err: any) { setTimeSeriesError(err.message || "Error occurred");
    } finally { setTimeSeriesLoading(false); }
  }

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
            layer.on("click", () => {
              setSelectedFeature({ type: layerInfo.type, properties: feature.properties });
              if (selectLakeMode && layerInfo.type === 'Lake' && feature.geometry?.type === 'Point') {
                handleTimeSeriesDetection(feature.geometry.coordinates);
                setSelectLakeMode(false);
              } else {
                setTimeSeriesResult(null);
                setTimeSeriesError(null);
              }
            });
            layer.bindPopup(`<div class="p-1 font-sans"><h4 class="font-bold">${feature.properties.name || `Unnamed ${layerInfo.type}`}</h4></div>`);
          },
        });
        layerRefs.current[layerInfo.id] = geoJsonLayer;
        if (featureLayers.find(l => l.id === layerInfo.id)?.enabled && mapInstance.current) {
          geoJsonLayer.addTo(mapInstance.current);
        }
      } catch (error) { console.error(`Error loading ${layerInfo.id}:`, error); }
    }
  };

  const toggleLayer = (layerId: string) => {
    const layer = layerRefs.current[layerId];
    if (!layer || !mapInstance.current) return;
    const isEnabled = featureLayers.find((l) => l.id === layerId)?.enabled;
    if (isEnabled) { mapInstance.current.removeLayer(layer); }
    else { mapInstance.current.addLayer(layer); }
    setFeatureLayers((prev) => prev.map((l) => (l.id === layerId ? { ...l, enabled: !l.enabled } : l)));
  };

  const handleMapSearch = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || !searchQuery) return;
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${searchQuery}`);
    const data = await response.json();
    if (data && data.length > 0 && mapInstance.current) {
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

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      const file = event.target.files[0];
      setUploadedFile(file);
      console.log("File uploaded:", file.name);
    }
  };

  const zoomIn = () => mapInstance.current?.zoomIn();
  const zoomOut = () => mapInstance.current?.zoomOut();
  const goHome = () => mapInstance.current?.setView([28.238, 83.9956], 6);

  return (
    <div className="h-screen flex flex-col bg-gray-50" ref={pageContainerRef}>
      <header className="bg-white shadow-sm border-b z-10 h-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full">
          <div className="flex justify-between items-center h-full">
            <Link href="/" className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center"><span className="text-white font-bold text-sm">❄</span></div>
                <span className="text-xl font-bold text-gray-900">GlacierWatch</span>
            </Link>
            <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input placeholder="Search on map..." className="pl-10 w-64" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={handleMapSearch} />
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 flex relative overflow-hidden">
        <div className={`bg-white shadow-lg z-20 transition-transform duration-300 border-r ${isLayerPanelOpen ? "translate-x-0" : "-translate-x-full"}`} style={{ width: "300px" }}>
            <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
                <h3 className="text-lg font-semibold flex items-center text-gray-700"><Layers className="w-5 h-5 mr-2" />Map Layers</h3>
                <Button variant="ghost" size="sm" onClick={() => setIsLayerPanelOpen(false)}><ChevronLeft className="w-4 h-4" /></Button>
            </div>
            <div className="p-4 space-y-4 overflow-y-auto">
                <div className="space-y-2">
                    <div className="flex items-center space-x-2 text-sm font-medium text-gray-700 mb-2"><MapIcon className="w-4 h-4" /><span>Base Layers</span></div>
                    {layers.map((layer) => (
                        <div key={layer.id} className="flex items-center space-x-3 pl-6">
                        <input type="radio" name="baseLayer" id={layer.id} checked={layer.enabled} onChange={() => handleBaseLayerChange(layer.id)} className="text-blue-600" />
                        <label htmlFor={layer.id} className="text-sm text-gray-600 cursor-pointer">{layer.name}</label>
                        </div>
                    ))}
                </div>
                <div className="space-y-2">
                    <div className="flex items-center space-x-2 text-sm font-medium text-gray-700 mb-2"><Snowflake className="w-4 h-4" /><span>Glacial Features</span></div>
                    {featureLayers.map((layer) => (
                        <div key={layer.id} className="flex items-center space-x-3 pl-6">
                            <Checkbox id={layer.id} checked={layer.enabled} onCheckedChange={() => toggleLayer(layer.id)} />
                            <label htmlFor={layer.id} className="text-sm text-gray-600 cursor-pointer">{layer.name}</label>
                        </div>
                    ))}
                </div>
                <div className="pt-4 border-t">
                    <h4 className="text-sm font-medium text-gray-700 mb-3">Analysis Tools</h4>
                    <div className="space-y-2">
                        <Button onClick={() => startMeasuring('distance')} variant="outline" size="sm" className="w-full justify-start bg-transparent"><Ruler className="w-4 h-4 mr-2" />Measure Distance</Button>
                        <Button onClick={() => startMeasuring('area')} variant="outline" size="sm" className="w-full justify-start bg-transparent"><MapIcon className="w-4 h-4 mr-2" />Measure Area</Button>
                    </div>
                </div>
            </div>
        </div>
        {!isLayerPanelOpen && <Button className="absolute top-4 left-4 z-20" onClick={() => setIsLayerPanelOpen(true)} size="sm"><ChevronRight className="w-4 h-4" /></Button>}

        <div className="flex-1 flex flex-col">
            <div className="bg-gray-100 border-b p-2 flex justify-end items-center space-x-2">
                <Button onClick={zoomIn} size="sm" className="w-9 h-9 p-0 bg-white text-gray-800 hover:bg-gray-200 shadow-sm border"><ZoomIn className="w-4 h-4" /></Button>
                <Button onClick={zoomOut} size="sm" className="w-9 h-9 p-0 bg-white text-gray-800 hover:bg-gray-200 shadow-sm border"><ZoomOut className="w-4 h-4" /></Button>
                <Button onClick={goHome} size="sm" className="w-9 h-9 p-0 bg-white text-gray-800 hover:bg-gray-200 shadow-sm border"><Home className="w-4 h-4" /></Button>
                <Button onClick={toggleFullscreen} size="sm" className="w-9 h-9 p-0 bg-white text-gray-800 hover:bg-gray-200 shadow-sm border"><Expand className="w-4 h-4" /></Button>
            </div>

            <div className="flex-1 relative">
                <div ref={mapRef} className="w-full h-full" />
            </div>
        </div>

        <div className={`bg-white shadow-lg z-20 transition-transform duration-300 border-l ${isInfoPanelOpen ? "translate-x-0" : "translate-x-full"}`} style={{ width: "350px" }}>
            <div className="p-4 h-full overflow-y-auto flex flex-col gap-8">
                {activeTab === "information" && selectedFeature && (
                    <div className="space-y-6">
                        <div><h4 className="font-semibold text-gray-900 mb-3 pb-2 border-b">Selected Feature</h4></div>
                        <div>
                            <h4 className="font-semibold text-gray-900 mb-3 pb-2 border-b">Risk Assessment</h4>
                            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-3">
                                <div className="flex items-center space-x-2 text-yellow-800 font-medium mb-2"><ExclamationTriangle className="w-4 h-4" /><span>{selectedFeature.properties.risk_level || "Unknown"} Risk</span></div>
                                <p className="text-sm text-yellow-700">Based on current monitoring data, this feature shows a {selectedFeature.properties.risk_level?.toLowerCase() || 'n/a'} risk. Regular monitoring recommended.</p>
                            </div>
                            <Dialog>
                                <DialogTrigger asChild><Button className="w-full bg-blue-600 hover:bg-blue-700">View Detailed Assessment</Button></DialogTrigger>
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
                        {timeSeriesLoading && (<div className="text-blue-600 mt-4">Detecting glacial lake time series...</div>)}
                        {timeSeriesError && (<div className="text-red-600 mt-4">{timeSeriesError}</div>)}
                        {timeSeriesResult && (
                            <div className="mt-4">
                                <h3 className="font-bold mb-2 text-gray-800">Time Series Detection Result:</h3>
                                {timeSeriesResult.images && Array.isArray(timeSeriesResult.images) && (
                                    <div className="flex flex-col gap-2">{timeSeriesResult.images.map((img: string, idx: number) => (<img key={idx} src={img} alt={`Lake Time Series ${idx + 1}`} className="rounded shadow max-h-48" />))}</div>
                                )}
                                {timeSeriesResult.stats && (<pre className="bg-gray-100 p-2 rounded text-sm overflow-x-auto">{JSON.stringify(timeSeriesResult.stats, null, 2)}</pre>)}
                                {!timeSeriesResult.images && !timeSeriesResult.stats && (<pre className="bg-gray-100 p-2 rounded text-sm overflow-x-auto">{JSON.stringify(timeSeriesResult, null, 2)}</pre>)}
                            </div>
                        )}
                    </div>
                )}
                {activeTab === "information" && !selectedFeature && filterCenter && (
                    <div className="pt-4">
                        <h4 className="font-semibold text-gray-900 mb-3 pb-2 border-b">Lakes within {filterRadius} km</h4>
                        <Button size="sm" variant="secondary" className="mb-3" onClick={() => {
                            setFilterCenter(null); setFilterResults([]); setFilterError(null); setShowFilterResultsPanel(false);
                            if (areaFilterMarkerRef.current && mapInstance.current) mapInstance.current.removeLayer(areaFilterMarkerRef.current);
                            if (areaFilterCircleRef.current && mapInstance.current) mapInstance.current.removeLayer(areaFilterCircleRef.current);
                        }}>← Back</Button>
                        {filterLoading && <div className="text-blue-600">Searching...</div>}
                        {filterError && <div className="text-red-600">{filterError}</div>}
                        {!filterLoading && !filterError && filterResults.length === 0 && (<div className="text-gray-500">No lakes found.</div>)}
                        {!filterLoading && !filterError && filterResults.length > 0 && (
                            <ul className="divide-y divide-gray-200">{filterResults.map((lake, idx) => (<li key={idx} className="py-2 flex flex-col"><span className="font-bold text-gray-800">{lake.name || "Unnamed Lake"}</span><span className="text-xs text-gray-500">Dist: {lake.distance_km} km</span><span className="text-xs text-gray-500">Risk: <span className={lake.risk_level === "High" ? "text-red-600" : lake.risk_level === "Medium" ? "text-yellow-600" : "text-green-600"}>{lake.risk_level}</span></span></li>))}</ul>
                        )}
                    </div>
                )}
                {activeTab === "information" && !selectedFeature && !filterCenter && (
                    <div className="text-center text-gray-500 pt-16 flex flex-col items-center gap-4">
                        <div className="flex flex-col gap-2 w-full max-w-xs mx-auto mt-2">
                            <Button variant={selectLakeMode ? "default" : "outline"} className={selectLakeMode ? "bg-blue-600 text-white" : ""} onClick={() => setSelectLakeMode(v => !v)}>
                                {selectLakeMode ? "Click on Map to Select Point..." : "Select Point for Time Series"}
                            </Button>
                            <Button variant={filterMode ? "default" : "outline"} className={filterMode ? "bg-green-600 text-white" : ""} onClick={() => setFilterMode(v => !v)}>
                                {filterMode ? "Click on Map to Set Center..." : "Filter Lakes by Area"}
                            </Button>
                            <Button variant="outline" className="justify-CENTER" onClick={() => fileInputRef.current?.click()}>
                                <Upload className="w-4 h-4 mr-2" /> Upload GeoTIFF
                            </Button>
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileUpload}
                                accept=".tif,.tiff,.geotiff"
                                className="hidden"
                            />
                        </div>
                        {filterMode && (
                            <div className="bg-white rounded shadow p-3 mt-6 flex flex-col gap-2 w-64 mx-auto">
                                <label className="font-medium text-gray-700">Select Radius:</label>
                                <select className="border rounded p-1" value={filterRadius} onChange={e => {
                                    const newRadius = Number(e.target.value);
                                    setFilterRadius(newRadius);
                                    if (filterCenter && areaFilterCircleRef.current && mapInstance.current) areaFilterCircleRef.current.setRadius(newRadius * 1000);
                                }}>
                                <option value={5}>5 km</option><option value={10}>10 km</option><option value={20}>20 km</option><option value={50}>50 km</option>
                                </select>
                                <div className="text-xs text-gray-500">Now click map to set center.</div>
                                <div className="flex gap-2 mt-2">
                                    <Button size="sm" variant="secondary" onClick={() => {
                                        setFilterMode(false); setFilterCenter(null); setFilterResults([]); setFilterError(null); setShowFilterResultsPanel(false);
                                        if (areaFilterMarkerRef.current && mapInstance.current) mapInstance.current.removeLayer(areaFilterMarkerRef.current);
                                        if (areaFilterCircleRef.current && mapInstance.current) mapInstance.current.removeLayer(areaFilterCircleRef.current);
                                    }}>Cancel</Button>
                                    <Button size="sm" disabled={!filterCenter} onClick={() => {if (filterCenter) runLakeAreaFilter(filterCenter.lat, filterCenter.lng, filterRadius)}}>Submit</Button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>

        {showFilterResultsPanel && (
            <div className="fixed bottom-4 right-4 z-50 bg-white shadow-lg rounded-lg p-4 w-[340px] max-h-72 overflow-y-auto border">
                <h4 className="font-semibold text-gray-900 mb-3 pb-2 border-b">Lakes within {filterRadius} km</h4>
                {filterLoading && <div className="text-blue-600">Searching...</div>}
                {filterError && <div className="text-red-600">{filterError}</div>}
                {!filterLoading && !filterError && filterResults.length === 0 && (<div className="text-gray-500">No lakes found.</div>)}
                {!filterLoading && !filterError && filterResults.length > 0 && (
                    <ul className="divide-y divide-gray-200">{filterResults.map((lake, idx) => (<li key={idx} className="py-2 flex flex-col"><span className="font-bold text-gray-800">{lake.name || "Unnamed Lake"}</span><span className="text-xs text-gray-500">Dist: {lake.distance_km} km</span><span className="text-xs text-gray-500">Risk: <span className={lake.risk_level === "High" ? "text-red-600" : lake.risk_level === "Medium" ? "text-yellow-600" : "text-green-600"}>{lake.risk_level}</span></span></li>))}</ul>
                )}
                <Button size="sm" className="mt-3 w-full" onClick={() => {
                    setShowFilterResultsPanel(false);
                    if (areaFilterCircleRef.current && mapInstance.current) mapInstance.current.removeLayer(areaFilterCircleRef.current);
                }}>Close</Button>
            </div>
        )}
      </div>
    </div>
  )
}

export default function GISMapPage() {
    return (
        <Suspense fallback={<div>Loading Map...</div>}>
            <GISMap />
        </Suspense>
    )
}
