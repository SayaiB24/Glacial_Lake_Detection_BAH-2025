"use client"

import { useEffect, useRef, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Search, Layers, Home, ZoomIn, ZoomOut, Ruler, Expand, ChevronLeft, MapIcon, ChevronDown,
  Image as ImageIcon, LineChart, AlertTriangle, BarChart3
} from "lucide-react"
import Link from "next/link"
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw";
import "leaflet-draw/dist/leaflet.draw.css";
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ChartOptions } from 'chart.js';

// Register ChartJS components
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const baseLayerSources = {
  satellite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: 'Tiles &copy; Esri' },
  terrain: { url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', attribution: 'Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap' },
  hybrid: { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '© OpenStreetMap contributors' }
};

interface LayerData { id: string; name: string; enabled: boolean; icon: any; }
interface RiskAlert {
    id: string;
    name: string;
    riskLevel: 'High' | 'Moderate' | 'Low';
    lastUpdated: string;
}

function GISMap() {
  const mapRef = useRef<HTMLDivElement>(null)
  const pageContainerRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<any>(null)
  const baseLayerRef = useRef<any>(null)
  const drawnItemsRef = useRef<any>(null)
  const [isLayerPanelOpen, setIsLayerPanelOpen] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawnArea, setDrawnArea] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState("");
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [isResultsOpen, setIsResultsOpen] = useState(true);
  const [riskAlerts, setRiskAlerts] = useState<RiskAlert[]>([]);
  const [showHimalayaGraph, setShowHimalayaGraph] = useState(false);
  const analysisLayerRef = useRef<any>(null);
  const drawControlRef = useRef<any>(null);

  const [layers, setLayers] = useState<LayerData[]>([
    { id: "satellite", name: "Satellite", enabled: false, icon: MapIcon },
    { id: "terrain", name: "Terrain", enabled: false, icon: MapIcon },
    { id: "hybrid", name: "Hybrid", enabled: true, icon: MapIcon },
  ]);

  // Data for the Himalaya glacial lakes graph
  const himalayaLakesData = {
    labels: ['Ganga', 'Brahmaputra', 'Indus'],
    datasets: [
      {
        label: 'Number of Lakes',
        data: [1020, 1530, 850],
        backgroundColor: [
          'rgba(255, 99, 132, 0.2)',
          'rgba(54, 162, 235, 0.2)',
          'rgba(255, 206, 86, 0.2)',
        ],
        borderColor: [
          'rgba(255, 99, 132, 1)',
          'rgba(54, 162, 235, 1)',
          'rgba(255, 206, 86, 1)',
        ],
        borderWidth: 1,
      },
    ],
  };

  const chartOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: 'Lakes by River Basin',
        font: {
          size: 14,
        }
      },
    },
  };

  useEffect(() => {
    if (mapInstance.current) return;

    const L = require("leaflet");
    require("leaflet-draw/dist/leaflet.draw.css");
    require("leaflet-draw");
    if (!mapRef.current) return;

    let initialCenter: [number, number] = [28.238, 83.9956];
    let initialZoom = 6;

    const createMap = (center: [number, number], zoom: number) => {
        if (mapInstance.current) return;
        mapInstance.current = L.map(mapRef.current, { center, zoom, zoomControl: false });
        drawnItemsRef.current = new L.FeatureGroup();
        mapInstance.current.addLayer(drawnItemsRef.current);
        handleBaseLayerChange('hybrid');

        mapInstance.current.on(L.Draw.Event.CREATED, (event: any) => {
            const layer = event.layer;
            if (drawControlRef.current) {
                drawnItemsRef.current.clearLayers();
                drawnItemsRef.current.addLayer(layer);
                setDrawnArea(layer.toGeoJSON());
                setIsDrawing(false);
                drawControlRef.current = null;
            } else {
                drawnItemsRef.current.addLayer(layer);
                 if (event.layerType === 'polygon') {
                    const area = L.GeometryUtil.geodesicArea(layer.getLatLngs()[0]);
                    layer.bindPopup(`<b>Area:</b> ${(area / 1000000).toFixed(2)} km²`).openPopup();
                 }
                 if (event.layerType === 'polyline') {
                    let distance = 0;
                    const latlngs = layer.getLatLngs();
                    for (let i = 0; i < latlngs.length - 1; i++) {
                        distance += latlngs[i].distanceTo(latlngs[i + 1]);
                    }
                    layer.bindPopup(`<b>Distance:</b> ${(distance / 1000).toFixed(2)} km`).openPopup();
                 }
            }
        });
    };

    createMap(initialCenter, initialZoom);

    // Fetch risk alerts
    const fetchRiskAlerts = async () => {
        try {
            const response = await fetch('/api/risk-alerts');
            const data = await response.json();
            setRiskAlerts(data);
        } catch (error) {
            console.error("Failed to fetch risk alerts:", error);
        }
    };
    fetchRiskAlerts();

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, []);

  const handleExitAoiMode = () => {
    if (isDrawing && drawControlRef.current) {
        drawControlRef.current.disable();
        drawControlRef.current = null;
    }
    setIsDrawing(false);
    setDrawnArea(null);
    if (drawnItemsRef.current) {
        drawnItemsRef.current.clearLayers();
    }
    setAnalysisResult(null);
    setProcessingStatus("");
    if (analysisLayerRef.current) {
        if (mapInstance.current.hasLayer(analysisLayerRef.current)) {
            mapInstance.current.removeLayer(analysisLayerRef.current);
        }
        analysisLayerRef.current = null;
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
            handleExitAoiMode();
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isDrawing]);

  const handleEnableDrawing = () => {
    handleExitAoiMode();
    setIsDrawing(true);
    const drawingTool = new L.Draw.Rectangle(mapInstance.current, {
        shapeOptions: { color: '#0ea5e9', fillColor: '#67e8f9', fillOpacity: 0.5 }
    });
    drawControlRef.current = drawingTool;
    drawingTool.enable();
  };

  const handleStartProcessing = async () => {
    if (!drawnArea) { alert("Please select an area first."); return; }
    setIsProcessing(true);
    setIsResultsOpen(true);
    setAnalysisResult(null);
    if (analysisLayerRef.current) {
        if (mapInstance.current.hasLayer(analysisLayerRef.current)) {
            mapInstance.current.removeLayer(analysisLayerRef.current);
        }
        analysisLayerRef.current = null;
    }

    try {
      setProcessingStatus("Requesting satellite imagery...");
      await new Promise(resolve => setTimeout(resolve, 1500));
      setProcessingStatus("Analyzing image with AI model...");
      const response = await fetch('/api/process-area', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ area: drawnArea.geometry }),
      });
      if (!response.ok) throw new Error('Analysis failed on the server.');
      const result = await response.json();
      setAnalysisResult(result);
      setProcessingStatus("Analysis complete.");
      analysisLayerRef.current = L.geoJSON(result.polygons, {
        style: { color: "#be123c", weight: 2, fillColor: "#f43f5e", fillOpacity: 0.7 },
        onEachFeature: (feature: any, layer: any) => {
           layer.bindPopup(`<b>Detected Lake</b><br/>Area: ${(feature.properties.area_sqkm || 0).toFixed(4)} km²`);
        }
      }).addTo(mapInstance.current);
    } catch (error: any) { setProcessingStatus(`Error: ${error.message}`);
    } finally { setIsProcessing(false); }
  };

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

  const startMeasuring = (tool: 'distance' | 'area') => {
    if (!mapInstance.current || !L) return;
    handleExitAoiMode();
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

  const zoomIn = () => mapInstance.current?.zoomIn();
  const zoomOut = () => mapInstance.current?.zoomOut();
  const goHome = () => mapInstance.current?.setView([28.238, 83.9956], 6);

  const riskColor = (level: RiskAlert['riskLevel']) => {
    switch(level) {
        case 'High': return 'text-red-500';
        case 'Moderate': return 'text-yellow-500';
        default: return 'text-gray-500';
    }
  }

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
                  <Input placeholder="Search on map..." className="pl-10 w-64" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              </div>
            </div>
          </div>
        </header>

      <div className="flex-1 flex relative overflow-hidden">
        <div className={`bg-white shadow-lg z-20 transition-all duration-300 border-r flex flex-col h-full ${isLayerPanelOpen ? 'ml-0' : '-ml-[300px]'}`} style={{ width: "300px" }}>
            <div className="p-4 border-b bg-gray-50 flex items-center justify-between flex-shrink-0">
                <h3 className="text-lg font-semibold flex items-center text-gray-700"><Layers className="w-5 h-5 mr-2" />Map Layers</h3>
                <Button variant="ghost" size="sm" onClick={() => setIsLayerPanelOpen(false)}><ChevronLeft className="w-4 h-4" /></Button>
            </div>
            <div className="flex-1 p-4 space-y-4 overflow-y-auto">
                <div className="space-y-2">
                    <div className="flex items-center space-x-2 text-sm font-medium text-gray-700 mb-2"><MapIcon className="w-4 h-4" /><span>Base Layers</span></div>
                    {layers.map((layer) => (
                        <div key={layer.id} className="flex items-center space-x-3 pl-6">
                        <input type="radio" name="baseLayer" id={layer.id} checked={layer.enabled} onChange={() => handleBaseLayerChange(layer.id)} className="text-blue-600" />
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
                <div className="pt-4 border-t">
                    <Button onClick={() => setShowHimalayaGraph(v => !v)} variant="outline" size="sm" className="w-full justify-start bg-transparent">
                        <BarChart3 className="w-4 h-4 mr-2" />
                        Himalaya glacial lakes
                    </Button>
                    {showHimalayaGraph && (
                        <div className="mt-4 h-[300px]">
                            <Bar data={himalayaLakesData} options={chartOptions} />
                        </div>
                    )}
                </div>
            </div>
        </div>

        <div className="flex-1 flex flex-col relative">
            <div className="absolute top-2 right-2 z-[1000] p-2 flex justify-end items-center space-x-2">
              <Button onClick={zoomIn} size="sm" className="w-9 h-9 p-0 bg-white text-gray-800 hover:bg-gray-200 shadow-sm border"><ZoomIn className="w-4 h-4" /></Button>
              <Button onClick={zoomOut} size="sm" className="w-9 h-9 p-0 bg-white text-gray-800 hover:bg-gray-200 shadow-sm border"><ZoomOut className="w-4 h-4" /></Button>
              <Button onClick={goHome} size="sm" className="w-9 h-9 p-0 bg-white text-gray-800 hover:bg-gray-200 shadow-sm border"><Home className="w-4 h-4" /></Button>
              <Button onClick={toggleFullscreen} size="sm" className="w-9 h-9 p-0 bg-white text-gray-800 hover:bg-gray-200 shadow-sm border"><Expand className="w-4 h-4" /></Button>
            </div>
            <div className="flex-1">
                <div ref={mapRef} className="w-full h-full" />
            </div>
        </div>

        <div className={`bg-white shadow-lg z-20 transition-transform duration-300 border-l`} style={{ width: "350px" }}>
            <div className="p-4 h-full overflow-y-auto flex flex-col">
                {/* --- Section 1: Area of Interest --- */}
                <div className="pb-4">
                    <h3 className="text-lg font-semibold text-gray-800 pb-3 border-b mb-4">Area of Interest Analysis</h3>

                    <div className="space-y-3">
                        <p className="text-sm text-gray-600">Define a rectangular area on the map to run real-time lake detection.</p>
                        {!isDrawing ? (
                            <Button onClick={handleEnableDrawing} className="w-full bg-blue-600 hover:bg-blue-700">Select Area</Button>
                        ) : (
                            <div className="border border-blue-300 bg-blue-50 text-center p-3 rounded-md">
                                <p className="text-sm text-blue-800 font-semibold">Drawing Mode Active</p>
                                <p className="text-xs text-blue-600 mt-1">Click and drag on the map. <br/> Press 'Esc' to exit.</p>
                            </div>
                        )}
                    </div>

                    <div className="mt-2">
                         <Button onClick={handleStartProcessing} disabled={!drawnArea || isProcessing} className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400">
                            {isProcessing ? "Processing..." : "Start Process"}
                        </Button>
                    </div>

                    {(isProcessing || processingStatus || analysisResult) && (
                        <div className="mt-4">
                            <details className="group" open={isResultsOpen} onToggle={(e) => setIsResultsOpen((e.target as HTMLDetailsElement).open)}>
                                <summary className="flex items-center justify-between cursor-pointer font-semibold text-gray-700 p-2 rounded-md transition-colors hover:bg-gray-100">
                                    Status & Results
                                    <ChevronDown className="w-5 h-5 transition-transform group-open:rotate-180" />
                                </summary>
                                <div className="mt-2 bg-gray-50 p-3 rounded-md text-sm text-gray-800 space-y-3">
                                    {isProcessing && (
                                        <div className="flex items-center">
                                            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                            <span>{processingStatus}</span>
                                        </div>
                                    )}
                                    {!isProcessing && processingStatus && (<p><strong>Status:</strong> {processingStatus}</p>)}

                                    {analysisResult && (
                                         <div className="space-y-2 pt-2 border-t border-gray-200">
                                            <div className="flex justify-between"><span>Lakes Detected:</span><span className="font-bold">{analysisResult.stats.lake_count}</span></div>
                                            <div className="flex justify-between"><span>Total Lake Area:</span><span className="font-bold">{analysisResult.stats.total_area_sqkm.toFixed(4)} km²</span></div>
                                         </div>
                                    )}
                                </div>
                            </details>
                        </div>
                    )}
                </div>

                {/* --- Section 2: Latest Risk Alerts --- */}
                <div className="py-4 border-t">
                    <div className="flex justify-between items-center mb-3">
                        <div>
                            <h3 className="text-lg font-semibold text-gray-800">Latest Risk Alerts</h3>
                            <p className="text-xs text-gray-500">Updated every 4 days</p>
                        </div>
                        <Link href="/time-series" passHref>
                            <Button size="sm">View Full Report</Button>
                        </Link>
                    </div>
                    <div className="space-y-2 text-sm">
                        <div className="flex font-semibold text-gray-600 px-2">
                            <div className="flex-1">Lake ID/Name</div>
                            <div className="w-28 text-right">Last Updated</div>
                        </div>
                        {riskAlerts.map(alert => (
                             <div key={alert.id} className="flex items-center bg-gray-50 p-2 rounded-md hover:bg-gray-100 transition-colors">
                                <AlertTriangle className={`w-4 h-4 mr-2 ${riskColor(alert.riskLevel)}`} />
                                <div className="flex-1 truncate">{alert.id}</div>
                                <div className="w-28 text-right text-gray-500">{alert.lastUpdated}</div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* --- Section 3: Navigation Buttons --- */}
                <div className="mt-auto pt-4 border-t space-y-2">
                    <Link href="/analyze-image" passHref>
                        <Button variant="secondary" className="w-full justify-start">
                           <ImageIcon className="w-4 h-4 mr-2"/> Analyze Image
                        </Button>
                    </Link>
                    <Link href="/time-series" passHref>
                         <Button variant="secondary" className="w-full justify-start">
                           <LineChart className="w-4 h-4 mr-2"/> Time Series Analysis
                        </Button>
                    </Link>
                </div>
            </div>
        </div>
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
