"use client";
import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search,
  Layers,
  Home,
  ZoomIn,
  ZoomOut,
  Ruler,
  Expand,
  ChevronLeft,
  MapIcon,
  ChevronDown,
  Image as ImageIcon,
  LineChart,
  AlertTriangle,
  BarChart3,
  X,
  Info,
} from "lucide-react";
import Link from "next/link";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw";
import "leaflet-draw/dist/leaflet.draw.css";
import { Bar, Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions,
} from "chart.js";
import { booleanPointInPolygon } from "@turf/boolean-point-in-polygon";

// Register ChartJS components
ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend);

// TypeScript Interfaces
interface GeoJsonPoint { type: "Point"; coordinates: number[]; }
interface GeoJsonPolygon { type: "Polygon"; coordinates: number[][][]; }
interface GeoJsonMultiPolygon { type: "MultiPolygon"; coordinates: number[][][][]; }
type GeoJsonGeometry = GeoJsonPoint | GeoJsonPolygon | GeoJsonMultiPolygon;

interface GeoJsonProperties {
  ID_No: string; Topo_250K: string; Topo_50K: string; Latitude: number; Longitude: number;
  River_Syst: string | null; Basin: string; Sub_Basin: string; River: string | null;
  Name: string | null; GL_Type: string; Area_ha: number; Length_km: number; Elev_m: number;
  Source_Img: string; DOP: string; Source_Ele: string; Region: string; State: string; District: string;
}

interface GeoJsonFeature { type: "Feature"; properties: GeoJsonProperties; geometry: GeoJsonGeometry; }
interface GeoJsonFeatureCollection { type: "FeatureCollection"; features: GeoJsonFeature[]; }
interface LayerData { id: string; name: string; enabled: boolean; icon: any; }
interface RiskAlert { id: string; name: string; riskLevel: "High" | "Moderate" | "Low"; lastUpdated: string; }

// Updated interfaces for the new API response
interface AnalysisMetadata {
  imageCount: number;
  featureCount: number;
  intersectingCount: number;
  year: number;
}

interface YearAnalysisResult {
  area: number;
  metadata: AnalysisMetadata;
}

interface ComparisonResult {
  selectedYear: YearAnalysisResult;
  baseYear: YearAnalysisResult;
  areaChange: number;
  percentageChange: number;
}

interface TimeSeriesDataPoint {
  area: number;
  imageCount: number;
  featureCount: number;
  intersectingCount: number;
  year: number;
}

interface TimeSeriesResult {
  timeSeriesData: TimeSeriesDataPoint[];
  analysisStartYear: number;
  analysisEndYear: number;
}

const baseLayerSources = {
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri",
  },
  terrain: {
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: "Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap",
  },
  hybrid: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "© OpenStreetMap contributors",
  },
};

function GISMap() {
  const mapRef = useRef<HTMLDivElement>(null);
  const pageContainerRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const baseLayerRef = useRef<L.Layer | null>(null);
  const drawnItemsRef = useRef<L.FeatureGroup | null>(null);
  const [isLayerPanelOpen, setIsLayerPanelOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawnArea, setDrawnArea] = useState<L.LatLngBounds | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState("");
  const [analysisResult, setAnalysisResult] = useState<{ lakes: GeoJsonFeature[]; } | null>(null);
  const [isResultsOpen, setIsResultsOpen] = useState(true);
  const [riskAlerts, setRiskAlerts] = useState<RiskAlert[]>([]);
  const [showHimalayaGraph, setShowHimalayaGraph] = useState(false);
  const [showLakeMask, setShowLakeMask] = useState(true);
  // Lake inventory is loaded at runtime from /public so the app builds and runs
  // even when sikkim_shape.geojson has not been supplied.
  const [sikkimShape, setSikkimShape] = useState<GeoJsonFeatureCollection>({ type: "FeatureCollection", features: [] });
  const [lakeDataError, setLakeDataError] = useState<string | null>(null);
  const [lakeInfo, setLakeInfo] = useState<GeoJsonProperties | null>(null);
  const [lakeInfoPosition, setLakeInfoPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartPosition, setDragStartPosition] = useState({ x: 0, y: 0 });
  const [lakesInfo, setLakesInfo] = useState<GeoJsonFeature[] | null>(null);
  const [lakesInfoPosition, setLakesInfoPosition] = useState({ x: 100, y: 100 });
  const [isDraggingLakesInfo, setIsDraggingLakesInfo] = useState(false);
  const [dragStartPositionLakesInfo, setDragStartPositionLakesInfo] = useState({ x: 0, y: 0 });
  const [timeSeriesMode, setTimeSeriesMode] = useState(false);
  const [selectedLake, setSelectedLake] = useState<GeoJsonFeature | null>(null);
  const [selectedYear, setSelectedYear] = useState<string>("2023");
  
  // Updated state for new analysis results
  const [comparisonResult, setComparisonResult] = useState<ComparisonResult | null>(null);
  const [timeSeriesResult, setTimeSeriesResult] = useState<TimeSeriesResult | null>(null);
  const [enableTimeSeriesAnalysis, setEnableTimeSeriesAnalysis] = useState(false);
  const [timeSeriesStartYear, setTimeSeriesStartYear] = useState<string>("2019");
  const [timeSeriesEndYear, setTimeSeriesEndYear] = useState<string>("2024");
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);

  const analysisLayerRef = useRef<L.Layer | null>(null);
  const drawControlRef = useRef<L.Control.Draw | null>(null);
  const lakeMaskLayerRef = useRef<L.Layer | null>(null);
  const highlightLayerRef = useRef<L.GeoJSON | null>(null);

  const [layers, setLayers] = useState<LayerData[]>([
    { id: "satellite", name: "Satellite", enabled: false, icon: MapIcon },
    { id: "terrain", name: "Terrain", enabled: false, icon: MapIcon },
    { id: "hybrid", name: "Hybrid", enabled: true, icon: MapIcon },
  ]);

  const himalayaLakesData = {
    labels: ["Ganga", "Brahmaputra", "Indus"],
    datasets: [
      {
        label: "Number of Lakes",
        data: [1020, 1530, 850],
        backgroundColor: [
          "rgba(255, 99, 132, 0.2)",
          "rgba(54, 162, 235, 0.2)",
          "rgba(255, 206, 86, 0.2)",
        ],
        borderColor: [
          "rgba(255, 99, 132, 1)",
          "rgba(54, 162, 235, 1)",
          "rgba(255, 206, 86, 1)",
        ],
        borderWidth: 1,
      },
    ],
  };

  const chartOptions: ChartOptions<"bar"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: "top" as const },
      title: { display: true, text: "Lakes by River Basin", font: { size: 14 } },
    },
  };

  // Chart configuration for time series
  const getTimeSeriesChartData = () => {
    if (!timeSeriesResult) return null;
    
    return {
      labels: timeSeriesResult.timeSeriesData.map(d => d.year.toString()),
      datasets: [
        {
          label: "Lake Area (hectares)",
          data: timeSeriesResult.timeSeriesData.map(d => d.area),
          borderColor: "rgb(59, 130, 246)",
          backgroundColor: "rgba(59, 130, 246, 0.1)",
          tension: 0.1,
        },
      ],
    };
  };

  const timeSeriesChartOptions: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: "top" as const },
      title: { display: true, text: "Lake Area Over Time", font: { size: 14 } },
    },
    scales: {
      y: {
        beginAtZero: true,
        title: { display: true, text: "Area (hectares)" },
      },
      x: {
        title: { display: true, text: "Year" },
      },
    },
  };

  useEffect(() => {
    if (mapInstance.current || !mapRef.current) return;
    mapInstance.current = L.map(mapRef.current).setView([27.5330, 88.5122], 9);
    drawnItemsRef.current = new L.FeatureGroup();
    mapInstance.current.addLayer(drawnItemsRef.current);
    handleBaseLayerChange("hybrid");

    const drawControl = new L.Control.Draw({
      edit: { featureGroup: drawnItemsRef.current },
      draw: { polygon: {}, polyline: false, rectangle: {}, circle: false, marker: false, circlemarker: false },
    });
    mapInstance.current.addControl(drawControl);

    mapInstance.current.on(L.Draw.Event.CREATED, (event: any) => {
      const layer = event.layer;
      drawnItemsRef.current?.addLayer(layer);
      if (layer instanceof L.Polygon || layer instanceof L.Rectangle) {
        setDrawnArea(layer.getBounds());
      }
    });

    const fetchRiskAlerts = async () => {
      try {
        const response = await fetch("/api/risk-alerts");
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
  
  // Load the glacial lake inventory at runtime. The file is not committed to the
  // repo, so a missing file degrades to an empty layer instead of failing the build.
  useEffect(() => {
    let cancelled = false;
    const loadLakeInventory = async () => {
      try {
        const response = await fetch("/sikkim_shape.geojson");
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as GeoJsonFeatureCollection;
        if (!data || data.type !== "FeatureCollection" || !Array.isArray(data.features)) {
          throw new Error("File is not a GeoJSON FeatureCollection");
        }
        if (!cancelled) {
          setSikkimShape(data);
          setLakeDataError(null);
        }
      } catch (error) {
        if (!cancelled) {
          const detail = error instanceof Error ? error.message : "Unknown error";
          console.error("Failed to load /sikkim_shape.geojson:", detail);
          setLakeDataError(
            "Lake inventory unavailable — add sikkim_shape.geojson to the public/ folder to enable the lake layer."
          );
        }
      }
    };
    loadLakeInventory();
    return () => {
      cancelled = true;
    };
  }, []);

  // Rebuild the lake mask layer whenever the inventory or its visibility changes.
  useEffect(() => {
    if (!mapInstance.current) return;

    if (lakeMaskLayerRef.current) {
      mapInstance.current.removeLayer(lakeMaskLayerRef.current);
      lakeMaskLayerRef.current = null;
    }

    if (sikkimShape.features.length === 0) return;

    lakeMaskLayerRef.current = L.geoJSON(sikkimShape as GeoJsonFeatureCollection, {
      style: { color: "#0000FF", weight: 2, opacity: 0.5, fillOpacity: 0.2 },
      onEachFeature: (feature: GeoJsonFeature, layer: L.Layer) => {
        layer.on("contextmenu", (e: L.LeafletMouseEvent) => {
          setLakeInfo(feature.properties as GeoJsonProperties);
          setLakeInfoPosition({ x: e.originalEvent.clientX, y: e.originalEvent.clientY });
        });
      },
    });

    if (showLakeMask) {
      mapInstance.current.addLayer(lakeMaskLayerRef.current);
    }
  }, [sikkimShape, showLakeMask]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") handleExitAoiMode();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!mapInstance.current || !timeSeriesMode) {
        mapInstance.current?.off("click");
        return;
    };

    const onMapClick = (e: L.LeafletMouseEvent) => {
        const features = (sikkimShape as GeoJsonFeatureCollection).features;
        const clickedPoint = [e.latlng.lng, e.latlng.lat];

        let selectedFeature: GeoJsonFeature | null = null;
        for (const feature of features) {
            if (feature.geometry && (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon')) {
                if (booleanPointInPolygon(clickedPoint, feature.geometry)) {
                    selectedFeature = feature;
                    break; 
                }
            }
        }
      
        if (highlightLayerRef.current) {
            mapInstance.current?.removeLayer(highlightLayerRef.current);
        }

        if (selectedFeature) {
            setSelectedLake(selectedFeature);
            setLakeInfo(selectedFeature.properties);
            setLakeInfoPosition({ x: e.originalEvent.clientX, y: e.originalEvent.clientY });

            highlightLayerRef.current = L.geoJSON(selectedFeature, {
                style: { color: '#FFFF00', weight: 4, fillColor: '#FFD700', fillOpacity: 0.5 }
            }).addTo(mapInstance.current!);
        } else {
            setSelectedLake(null);
            setLakeInfo(null);
        }
    };

    mapInstance.current.on("click", onMapClick);
    
    return () => {
        mapInstance.current?.off("click", onMapClick);
    };
  }, [timeSeriesMode, sikkimShape]);

  const handleSearch = async () => {
    if (!searchQuery.trim() || !mapInstance.current) return;
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}`);
      const data = await response.json();
      if (data && data.length > 0) {
        const { lat, lon } = data[0];
        mapInstance.current.setView([parseFloat(lat), parseFloat(lon)], mapInstance.current.getZoom());
      } else {
        alert("Location not found");
      }
    } catch (error) {
      console.error("Error fetching search results:", error);
    }
  };

  const handleTimeSeriesLake = () => {
    handleExitAoiMode();
    setTimeSeriesMode(true);
    alert("Time Series Mode: Click on a lake to select it for analysis.");
  };

  const handleExitAoiMode = () => {
    setIsDrawing(false);
    setDrawnArea(null);
    setTimeSeriesMode(false);
    setSelectedLake(null);
    setLakeInfo(null);
    setComparisonResult(null);
    setTimeSeriesResult(null);

    if (highlightLayerRef.current) {
        mapInstance.current?.removeLayer(highlightLayerRef.current);
        highlightLayerRef.current = null;
    }

    drawnItemsRef.current?.clearLayers();
    setAnalysisResult(null);
    setProcessingStatus("");
    if (analysisLayerRef.current && mapInstance.current?.hasLayer(analysisLayerRef.current)) {
      mapInstance.current.removeLayer(analysisLayerRef.current);
      analysisLayerRef.current = null;
    }
  };

  const handleEnableDrawing = () => {
    handleExitAoiMode();
    setIsDrawing(true);
  };

  const isLakeInArea = (feature: GeoJsonFeature, bounds: L.LatLngBounds): boolean => {
    if (feature.geometry.type === "Point") {
      const [longitude, latitude] = feature.geometry.coordinates;
      return bounds.contains([latitude, longitude]);
    }
    return false;
  };

  const handleStartProcessing = async () => {
    if (!drawnArea) {
      alert("Please select an area first.");
      return;
    }
    setIsProcessing(true);
    setIsResultsOpen(true);
    setAnalysisResult(null);
    if (analysisLayerRef.current && mapInstance.current?.hasLayer(analysisLayerRef.current)) {
      mapInstance.current.removeLayer(analysisLayerRef.current);
      analysisLayerRef.current = null;
    }
    try {
      setProcessingStatus("Requesting satellite imagery...");
      await new Promise((resolve) => setTimeout(resolve, 1500));
      setProcessingStatus("Analyzing image with AI model...");
      const lakesInArea = (sikkimShape as GeoJsonFeatureCollection).features.filter(
        (feature: GeoJsonFeature) => isLakeInArea(feature, drawnArea!)
      );
      setAnalysisResult({ lakes: lakesInArea });
      setLakesInfo(lakesInArea);
      setProcessingStatus("Analysis complete.");
      analysisLayerRef.current = L.geoJSON({ type: "FeatureCollection", features: lakesInArea } as GeoJsonFeatureCollection, {
          style: { color: "#be123c", weight: 2, fillColor: "#f43f5e", fillOpacity: 0.7 },
          onEachFeature: (feature: GeoJsonFeature, layer: L.Layer) => {
            layer.bindPopup(`<b>Lake ID:</b> ${feature.properties.ID_No}`);
          },
        }
      ).addTo(mapInstance.current!);
    } catch (error: unknown) {
      if (error instanceof Error) {
        setProcessingStatus(`Error: ${error.message}`);
      } else {
        setProcessingStatus("An unknown error occurred.");
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBaseLayerChange = (layerId: string) => {
    if (!mapInstance.current) return;
    setLayers((prev) => prev.map((l) => ({ ...l, enabled: l.id === layerId })));
    if (baseLayerRef.current) {
      mapInstance.current.removeLayer(baseLayerRef.current);
    }
    const source = baseLayerSources[layerId as keyof typeof baseLayerSources];
    const newBaseLayer = L.tileLayer(source.url, { attribution: source.attribution });
    newBaseLayer.addTo(mapInstance.current);
    baseLayerRef.current = newBaseLayer;
    newBaseLayer.bringToBack();
  };

  const startMeasuring = (tool: "distance" | "area") => {
    if (!mapInstance.current) return;
    handleExitAoiMode();
    const drawOptions = {
      polyline: tool === "distance" ? {} : undefined,
      polygon: tool === "area" ? {} : undefined,
      rectangle: undefined, circle: undefined, marker: undefined, circlemarker: undefined,
    };
    const drawControl = new L.Control.Draw({ draw: drawOptions });
    mapInstance.current.addControl(drawControl);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) pageContainerRef.current?.requestFullscreen();
    else document.exitFullscreen();
  };

  const zoomIn = () => mapInstance.current?.zoomIn();
  const zoomOut = () => mapInstance.current?.zoomOut();
  const goHome = () => mapInstance.current?.setView([28.238, 83.9956], 6);

  const riskColor = (level: RiskAlert["riskLevel"]) => {
    switch (level) {
      case "High": return "text-red-500";
      case "Moderate": return "text-yellow-500";
      default: return "text-gray-500";
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStartPosition({ x: e.clientX - lakeInfoPosition.x, y: e.clientY - lakeInfoPosition.y });
    e.preventDefault();
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setLakeInfoPosition({ x: e.clientX - dragStartPosition.x, y: e.clientY - dragStartPosition.y });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseDownLakesInfo = (e: React.MouseEvent) => {
    setIsDraggingLakesInfo(true);
    setDragStartPositionLakesInfo({ x: e.clientX - lakesInfoPosition.x, y: e.clientY - lakesInfoPosition.y });
    e.preventDefault();
  };

  const handleMouseMoveLakesInfo = (e: React.MouseEvent) => {
    if (isDraggingLakesInfo) {
      setLakesInfoPosition({ x: e.clientX - dragStartPositionLakesInfo.x, y: e.clientY - dragStartPositionLakesInfo.y });
    }
  };

  const handleMouseUpLakesInfo = () => {
    setIsDraggingLakesInfo(false);
  };

  // Updated function to handle the new API structure
  const compareAreaDifferences = async () => {
    if (!selectedLake) {
        alert("Please select a lake to analyze.");
        return;
    }

    if (selectedYear === "2024") {
        alert("Please select a year other than 2024 to compare against the baseline.");
        return;
    }

    setIsProcessing(true);
    setProcessingStatus(`Analyzing lake area for ${selectedYear} and 2024...`);
    setComparisonResult(null);
    setTimeSeriesResult(null);

    try {
        const requestBody: any = {
            geometry: selectedLake.geometry,
            year: selectedYear,
        };

        // Add time series analysis if enabled
        if (enableTimeSeriesAnalysis) {
            requestBody.timeSeriesAnalysis = {
                enabled: true,
                startYear: parseInt(timeSeriesStartYear),
                endYear: parseInt(timeSeriesEndYear),
            };
        }

        const response = await fetch('/api/gee/compare-lake-area', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.details || "Failed to get data from GEE.");
        }

        const data = await response.json();

        if (enableTimeSeriesAnalysis && data.timeSeriesData) {
            // Handle time series response
            setTimeSeriesResult(data as TimeSeriesResult);
            setProcessingStatus("Time series analysis complete.");
        } else {
            // Handle single comparison response
            setComparisonResult(data as ComparisonResult);
            setProcessingStatus("Area comparison complete.");
        }

    } catch (error: any) {
        console.error("Error comparing area differences:", error);
        setProcessingStatus(`Error: ${error.message}`);
    } finally {
        setIsProcessing(false);
    }
  };

  // Generate available years
  const currentClientYear = new Date().getFullYear();
  const availableYears = Array.from({ length: currentClientYear - 2015 + 1 }, (_, i) => (2015 + i).toString());

  return (
    <div className="h-screen flex flex-col bg-gray-50" ref={pageContainerRef}>
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
              <Input
                placeholder="Search on map..."
                className="pl-10 w-64"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleSearch()}
              />
            </div>
          </div>
        </div>
      </header>
      <div className="flex-1 flex relative overflow-hidden">
        <div
          className={`bg-white shadow-lg z-20 transition-all duration-300 border-r flex flex-col h-full ${
            isLayerPanelOpen ? "ml-0" : "-ml-[300px]"
          }`}
          style={{ width: "300px" }}
        >
          <div className="p-4 border-b bg-gray-50 flex items-center justify-between flex-shrink-0">
            <h3 className="text-lg font-semibold flex items-center text-gray-700">
              <Layers className="w-5 h-5 mr-2" /> Map Layers
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsLayerPanelOpen(false)}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex-1 p-4 space-y-4 overflow-y-auto">
            <div className="space-y-2">
              <div className="flex items-center space-x-2 text-sm font-medium text-gray-700 mb-2">
                <MapIcon className="w-4 h-4" />
                <span>Base Layers</span>
              </div>
              {layers.map((layer) => (
                <div key={layer.id} className="flex items-center space-x-3 pl-6">
                  <input
                    type="radio"
                    name="baseLayer"
                    id={layer.id}
                    checked={layer.enabled}
                    onChange={() => handleBaseLayerChange(layer.id)}
                    className="text-blue-600"
                  />
                  <label
                    htmlFor={layer.id}
                    className="text-sm text-gray-600 cursor-pointer"
                  >
                    {layer.name}
                  </label>
                </div>
              ))}
            </div>
            <div className="pt-4 border-t">
              <h4 className="text-sm font-medium text-gray-700 mb-3">Analysis Tools</h4>
              <div className="space-y-2">
                <Button onClick={() => startMeasuring("distance")} variant="outline" size="sm" className="w-full justify-start bg-transparent">
                  <Ruler className="w-4 h-4 mr-2" /> Measure Distance
                </Button>
                <Button onClick={() => setShowLakeMask(!showLakeMask)} variant="outline" size="sm" className="w-full justify-start bg-transparent">
                  <MapIcon className="w-4 h-4 mr-2" /> Lake Mask
                </Button>
              </div>
            </div>
            <div className="pt-4 border-t">
              <Button onClick={() => setShowHimalayaGraph((v) => !v)} variant="outline" size="sm" className="w-full justify-start bg-transparent">
                <BarChart3 className="w-4 h-4 mr-2" />Himalaya glacial lakes
              </Button>
              {showHimalayaGraph && (
                <div className="mt-4 h-[300px]">
                  <Bar data={himalayaLakesData} options={chartOptions} />
                </div>
              )}
              <Button onClick={handleTimeSeriesLake} variant="outline" size="sm" className="w-full justify-start bg-transparent mt-2">
                <LineChart className="w-4 h-4 mr-2" />Time Series a Lake
              </Button>
            </div>
          </div>
        </div>
        <div className="flex-1 flex flex-col relative">
          <div className="absolute top-2 right-2 z-[1000] p-2 flex justify-end items-center space-x-2">
            <Button onClick={zoomIn} size="sm" className="w-9 h-9 p-0 bg-white text-gray-800 hover:bg-gray-200 shadow-sm border">
              <ZoomIn className="w-4 h-4" />
            </Button>
            <Button onClick={zoomOut} size="sm" className="w-9 h-9 p-0 bg-white text-gray-800 hover:bg-gray-200 shadow-sm border">
              <ZoomOut className="w-4 h-4" />
            </Button>
            <Button onClick={goHome} size="sm" className="w-9 h-9 p-0 bg-white text-gray-800 hover:bg-gray-200 shadow-sm border">
              <Home className="w-4 h-4" />
            </Button>
            <Button onClick={toggleFullscreen} size="sm" className="w-9 h-9 p-0 bg-white text-gray-800 hover:bg-gray-200 shadow-sm border">
              <Expand className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex-1">
            <div ref={mapRef} className="w-full h-full" />
          </div>
        </div>
        <div className={`bg-white shadow-lg z-20 transition-transform duration-300 border-l`} style={{ width: "350px" }}>
          <div className="p-4 h-full overflow-y-auto flex flex-col">
            <div className="pb-4">
              <h3 className="text-lg font-semibold text-gray-800 pb-3 border-b mb-4">Area of Interest Analysis</h3>
              <div className="space-y-3">
                <p className="text-sm text-gray-600">Define a rectangular area on the map to run real-time lake detection.</p>
                {!isDrawing ? (
                  <Button onClick={handleEnableDrawing} className="w-full bg-blue-600 hover:bg-blue-700">Select Area</Button>
                ) : (
                  <div className="border border-blue-300 bg-blue-50 text-center p-3 rounded-md">
                    <p className="text-sm text-blue-800 font-semibold">Drawing Mode Active</p>
                    <p className="text-xs text-blue-600 mt-1">Click and drag on the map. <br /> Press "Esc" to exit.</p>
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
                          <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          <span>{processingStatus}</span>
                        </div>
                      )}
                      {!isProcessing && processingStatus && (<p><strong>Status:</strong> {processingStatus}</p>)}
                      {analysisResult && (
                        <div className="space-y-2 pt-2 border-t border-gray-200">
                          <div className="flex justify-between">
                            <span>Lakes Detected:</span>
                            <span className="font-bold">{analysisResult.lakes.length}</span>
                          </div>
                          <div>
                            <h4>Lake IDs:</h4>
                            <ul>{analysisResult.lakes.map((lake, index) => (<li key={index}>{lake.properties.ID_No}</li>))}</ul>
                          </div>
                        </div>
                      )}
                    </div>
                  </details>
                </div>
              )}
            </div>
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
                {riskAlerts.map((alert) => (
                  <div key={alert.id} className="flex items-center bg-gray-50 p-2 rounded-md hover:bg-gray-100 transition-colors">
                    <AlertTriangle className={`w-4 h-4 mr-2 ${riskColor(alert.riskLevel)}`} />
                    <div className="flex-1 truncate">{alert.id}</div>
                    <div className="w-28 text-right text-gray-500">{alert.lastUpdated}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-auto pt-4 border-t space-y-2">
              <Link href="/time-series" passHref>
                <Button variant="secondary" className="w-full justify-start">
                  <LineChart className="w-4 h-4 mr-2" /> Time Series Analysis
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Updated Lake Information Panel */}
      {lakeInfo && (
        <div className="absolute bg-white p-4 rounded-lg shadow-lg z-[1000] max-w-md" style={{ left: `${lakeInfoPosition.x}px`, top: `${lakeInfoPosition.y}px` }}>
            <div className="flex justify-between items-center mb-2 cursor-move" onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
                <h3 className="text-lg font-semibold">Lake Analysis</h3>
                <Button variant="ghost" size="sm" onClick={() => { setLakeInfo(null); setTimeSeriesMode(false); setSelectedLake(null); handleExitAoiMode(); }}>
                    <X className="w-4 h-4" />
                </Button>
            </div>
            <div className="cursor-auto max-h-96 overflow-y-auto">
                {/* Basic Lake Information */}
                <div className="mb-4 p-3 bg-gray-50 rounded-md">
                    <h4 className="font-semibold mb-2">Basic Information</h4>
                    <div className="space-y-1 text-sm">
                        <div><strong>ID:</strong> {lakeInfo.ID_No}</div>
                        <div><strong>Name:</strong> {lakeInfo.Name || "N/A"}</div>
                        <div><strong>Area:</strong> {lakeInfo.Area_ha} ha</div>
                        <div><strong>Elevation:</strong> {lakeInfo.Elev_m} m</div>
                        <div><strong>Basin:</strong> {lakeInfo.Basin}</div>
                        <div><strong>District:</strong> {lakeInfo.District}</div>
                    </div>
                </div>

                {timeSeriesMode && (
                    <div className="space-y-4">
                        {/* Analysis Configuration */}
                        <div className="p-3 border rounded-md">
                            <h4 className="font-semibold mb-3">Analysis Configuration</h4>
                            
                            {/* Advanced Options Toggle */}
                            <div className="mb-3">
                                <Button 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                                    className="w-full justify-between"
                                >
                                    <span>Advanced Options</span>
                                    <ChevronDown className={`w-4 h-4 transition-transform ${showAdvancedOptions ? 'rotate-180' : ''}`} />
                                </Button>
                            </div>

                            {/* Basic Analysis Options */}
                            <div className="space-y-3">
                                <div>
                                    <label htmlFor="year" className="block text-sm font-medium text-gray-700 mb-1">
                                        Compare with 2024:
                                    </label>
                                    <select 
                                        id="year" 
                                        className="w-full p-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                                        value={selectedYear} 
                                        onChange={(e) => setSelectedYear(e.target.value)}
                                    >
                                        {availableYears.filter(year => year !== "2024").map((year) => (
                                            <option key={year} value={year}>{year}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Time Series Analysis Toggle */}
                                <div className="flex items-center space-x-2">
                                    <input
                                        type="checkbox"
                                        id="enableTimeSeries"
                                        checked={enableTimeSeriesAnalysis}
                                        onChange={(e) => setEnableTimeSeriesAnalysis(e.target.checked)}
                                        className="rounded"
                                    />
                                    <label htmlFor="enableTimeSeries" className="text-sm font-medium text-gray-700">
                                        Enable Time Series Analysis
                                    </label>
                                </div>

                                {/* Time Series Options */}
                                {enableTimeSeriesAnalysis && (
                                    <div className="space-y-2 pl-6 border-l-2 border-blue-200">
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <label className="block text-xs font-medium text-gray-600">Start Year</label>
                                                <select 
                                                    className="w-full p-1 text-sm border border-gray-300 rounded" 
                                                    value={timeSeriesStartYear} 
                                                    onChange={(e) => setTimeSeriesStartYear(e.target.value)}
                                                >
                                                    {availableYears.slice(0, -1).map((year) => (
                                                        <option key={year} value={year}>{year}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-600">End Year</label>
                                                <select 
                                                    className="w-full p-1 text-sm border border-gray-300 rounded" 
                                                    value={timeSeriesEndYear} 
                                                    onChange={(e) => setTimeSeriesEndYear(e.target.value)}
                                                >
                                                    {availableYears.map((year) => (
                                                        <option key={year} value={year}>{year}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Advanced Configuration Options */}
                            {showAdvancedOptions && (
                                <div className="mt-3 pt-3 border-t space-y-2">
                                    <div className="text-xs text-gray-600">
                                        <div className="flex items-center space-x-2 mb-1">
                                            <Info className="w-3 h-3" />
                                            <span className="font-medium">Advanced Algorithm Features:</span>
                                        </div>
                                        <ul className="list-disc list-inside ml-4 space-y-1">
                                            <li>Multi-sensor analysis (Sentinel-2, Landsat 8/9)</li>
                                            <li>Advanced water indices (NDWI, MNDWI, AWEIsh, AWEInsh)</li>
                                            <li>Cloud masking and temporal compositing</li>
                                            <li>Morphological filtering for noise reduction</li>
                                        </ul>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Analysis Button */}
                        <Button 
                            onClick={compareAreaDifferences} 
                            className="w-full bg-blue-600 hover:bg-blue-700" 
                            disabled={isProcessing || selectedYear === "2024"}
                        >
                            {isProcessing ? processingStatus : (enableTimeSeriesAnalysis ? "Run Time Series Analysis" : "Compare Area Differences")}
                        </Button>

                        {/* Results Display */}
                        {(comparisonResult || timeSeriesResult || (isProcessing && selectedLake)) && (
                            <div className="space-y-4">
                                {/* Processing Status */}
                                {isProcessing && (
                                    <div className="flex items-center p-3 bg-blue-50 rounded-md">
                                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        <span className="text-sm text-blue-800">{processingStatus}</span>
                                    </div>
                                )}

                                {/* Comparison Results */}
                                {comparisonResult && !isProcessing && (
                                    <div className="p-3 bg-gray-100 rounded-md">
                                        <h4 className="text-md font-semibold text-gray-800 mb-2">Area Comparison Results</h4>
                                        <div className="space-y-2 text-sm">
                                            <div className="grid grid-cols-2 gap-2">
                                                <div className="p-2 bg-white rounded">
                                                    <div className="text-xs text-gray-600">2024 Area</div>
                                                    <div className="font-semibold">{comparisonResult.baseYear.area.toFixed(2)} ha</div>
                                                    <div className="text-xs text-gray-500">
                                                        Images: {comparisonResult.baseYear.metadata.imageCount}
                                                    </div>
                                                </div>
                                                <div className="p-2 bg-white rounded">
                                                    <div className="text-xs text-gray-600">{selectedYear} Area</div>
                                                    <div className="font-semibold">{comparisonResult.selectedYear.area.toFixed(2)} ha</div>
                                                    <div className="text-xs text-gray-500">
                                                        Images: {comparisonResult.selectedYear.metadata.imageCount}
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            <div className="pt-2 border-t">
                                                <div className="flex justify-between">
                                                    <span className="text-gray-700">Change:</span>
                                                    <span className={`font-semibold ${comparisonResult.areaChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                        {comparisonResult.areaChange >= 0 ? '+' : ''}{comparisonResult.areaChange.toFixed(2)} ha
                                                    </span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-gray-700">Percentage:</span>
                                                    <span className={`font-semibold ${comparisonResult.percentageChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                        {comparisonResult.percentageChange >= 0 ? '+' : ''}{comparisonResult.percentageChange.toFixed(1)}%
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Time Series Results */}
                                {timeSeriesResult && !isProcessing && (
                                    <div className="space-y-3">
                                        <div className="p-3 bg-gray-100 rounded-md">
                                            <h4 className="text-md font-semibold text-gray-800 mb-2">Time Series Analysis</h4>
                                            <div className="text-sm text-gray-600">
                                                Analysis period: {timeSeriesResult.analysisStartYear} - {timeSeriesResult.analysisEndYear}
                                            </div>
                                        </div>
                                        
                                        {/* Time Series Chart */}
                                        {getTimeSeriesChartData() && (
                                            <div className="h-64 bg-white p-2 rounded-md border">
                                                <Line data={getTimeSeriesChartData()!} options={timeSeriesChartOptions} />
                                            </div>
                                        )}
                                        
                                        {/* Data Quality Summary */}
                                        <div className="p-3 bg-white rounded-md border text-xs">
                                            <h5 className="font-semibold mb-2">Data Quality Summary</h5>
                                            <div className="grid grid-cols-2 gap-2">
                                                {timeSeriesResult.timeSeriesData.map((dataPoint, index) => (
                                                    <div key={index} className="flex justify-between">
                                                        <span>{dataPoint.year}:</span>
                                                        <span className={dataPoint.imageCount === 0 ? 'text-red-500' : 'text-green-600'}>
                                                            {dataPoint.imageCount} images
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
      )}

      {/* Lakes Information Panel (unchanged) */}
      {lakesInfo && (
        <div className="absolute bg-white p-4 rounded-lg shadow-lg z-[1000]" style={{ left: `${lakesInfoPosition.x}px`, top: `${lakesInfoPosition.y}px` }}>
            <div className="flex justify-between items-center mb-2 cursor-move" onMouseDown={handleMouseDownLakesInfo} onMouseMove={handleMouseMoveLakesInfo} onMouseUp={handleMouseUpLakesInfo} onMouseLeave={handleMouseUpLakesInfo}>
                <h3 className="text-lg font-semibold">Lakes Information</h3>
                <Button variant="ghost" size="sm" onClick={() => setLakesInfo(null)}>
                    <X className="w-4 h-4" />
                </Button>
            </div>
            <div className="cursor-auto">
                <ul>{lakesInfo.map((lake, index) => (<li key={index}>{lake.properties.ID_No}</li>))}</ul>
            </div>
        </div>
      )}

      {/* Toggle button for layer panel when closed */}
      {!isLayerPanelOpen && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 z-30">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsLayerPanelOpen(true)}
            className="rounded-r-md rounded-l-none bg-white border-l-0"
          >
            <Layers className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

export default function GISMapPage() {
  return (
    <Suspense fallback={<Loading />}>
      <GISMap />
    </Suspense>
  );
}

function Loading() {
  return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-xl font-semibold">Loading Map...</div>
    </div>
  );
}
