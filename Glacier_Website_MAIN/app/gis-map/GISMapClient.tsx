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
import { mannKendall, describeTrend, type MannKendallResult } from "@/lib/mannKendall";

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
interface RiskAlert {
  id: string;
  name: string;
  riskLevel: "High" | "Moderate" | "Low";
  lastUpdated: string;
  /** Screening index 0-100, present once /api/risk-alerts computes it. */
  score?: number;
  areaHa?: number;
  elevationM?: number;
  lakeType?: string;
}

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

// Each base layer is one or more tile URLs drawn in order, so "hybrid" can put
// place labels over imagery.
//
// OpenTopoMap was previously used for terrain but returns HTTP 403 to
// non-browser referrers, which left the terrain option showing a blank map.
// Esri's topographic service is used instead — the same provider as the
// imagery layer, so it is subject to one set of availability rules.
const baseLayerSources = {
  satellite: {
    urls: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
    attribution: "Tiles &copy; Esri",
    maxZoom: 19,
  },
  terrain: {
    urls: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"],
    attribution: "Tiles &copy; Esri — topographic",
    maxZoom: 19,
  },
  hybrid: {
    urls: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
    ],
    attribution: "Tiles &copy; Esri — imagery with place labels",
    maxZoom: 19,
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
  // even when himalaya_lakes.geojson has not been supplied.
  const [sikkimShape, setSikkimShape] = useState<GeoJsonFeatureCollection>({ type: "FeatureCollection", features: [] });
  const [lakeDataError, setLakeDataError] = useState<string | null>(null);
  const [measureMode, setMeasureMode] = useState<"distance" | "area" | null>(null);
  const [measureResult, setMeasureResult] = useState<string | null>(null);
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
  const activeDrawHandlerRef = useRef<{ disable: () => void } | null>(null);
  const measureLayerRef = useRef<L.Layer | null>(null);
  // The draw:created handler is registered once on mount, so it would close over
  // a stale measureMode. Mirror it in a ref that the handler can read.
  const measureModeRef = useRef<"distance" | "area" | null>(null);
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

  // Mann-Kendall trend test over the yearly lake-area series. Years with no
  // usable imagery report an area of 0, which would read as a real collapse in
  // lake extent, so they are excluded rather than treated as observations.
  const getTrendAnalysis = (): MannKendallResult | null => {
    if (!timeSeriesResult) return null;
    const usable = timeSeriesResult.timeSeriesData.filter(
      (d) => d.imageCount > 0 && Number.isFinite(d.area),
    );
    if (usable.length < 3) return null;
    try {
      return mannKendall(
        usable.map((d) => d.area),
        usable.map((d) => d.year),
      );
    } catch (error) {
      console.warn("Mann-Kendall trend test failed:", error);
      return null;
    }
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
      activeDrawHandlerRef.current = null;

      // A polyline can only be a measurement; a polygon or rectangle is an AOI
      // unless a measurement was explicitly started.
      const isPolyline = event.layerType === "polyline";
      const measuring = isPolyline || measureModeRef.current !== null;

      if (measuring) {
        if (measureLayerRef.current && mapInstance.current?.hasLayer(measureLayerRef.current)) {
          mapInstance.current.removeLayer(measureLayerRef.current);
        }
        layer.addTo(mapInstance.current!);
        measureLayerRef.current = layer;

        if (isPolyline) {
          const points: L.LatLng[] = layer.getLatLngs();
          let metres = 0;
          for (let i = 1; i < points.length; i++) metres += points[i - 1].distanceTo(points[i]);
          setMeasureResult(
            metres >= 1000
              ? `${(metres / 1000).toFixed(3)} km along ${points.length} points`
              : `${metres.toFixed(1)} m along ${points.length} points`,
          );
        } else {
          const ring: L.LatLng[] = layer.getLatLngs()[0];
          const m2 = (L as any).GeometryUtil?.geodesicArea
            ? (L as any).GeometryUtil.geodesicArea(ring)
            : 0;
          setMeasureResult(
            m2 >= 1e6
              ? `${(m2 / 1e6).toFixed(4)} km² (${(m2 / 1e4).toFixed(2)} ha)`
              : `${(m2 / 1e4).toFixed(4)} ha`,
          );
        }
        setMeasureMode(null);
        return;
      }

      drawnItemsRef.current?.addLayer(layer);
      if (layer instanceof L.Polygon || layer instanceof L.Rectangle) {
        setDrawnArea(layer.getBounds());
        setIsDrawing(true);
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
  
  useEffect(() => {
    measureModeRef.current = measureMode;
  }, [measureMode]);

  // Load the glacial lake inventory at runtime. The file is not committed to the
  // repo, so a missing file degrades to an empty layer instead of failing the build.
  useEffect(() => {
    let cancelled = false;
    const loadLakeInventory = async () => {
      try {
        const response = await fetch("/himalaya_lakes.geojson");
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
          // Expected when the (gitignored) inventory has not been supplied, so warn
          // rather than error — console.error trips the Next.js dev error overlay.
          console.warn("Lake inventory not loaded from /himalaya_lakes.geojson:", detail);
          setLakeDataError(
            "Lake inventory unavailable — add himalaya_lakes.geojson to the public/ folder to enable the lake layer."
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
    if (!mapInstance.current) return;
    // Previously this only flipped a flag, leaving the user to find the small
    // rectangle icon on the draw toolbar, so the button appeared to do nothing.
    // Activate the rectangle handler directly.
    activeDrawHandlerRef.current?.disable();
    const handler = new (L as any).Draw.Rectangle(mapInstance.current, {
      shapeOptions: { color: "#2563eb", weight: 2, fillOpacity: 0.15 },
    });
    handler.enable();
    activeDrawHandlerRef.current = handler;
  };

  // These panels show either inventory lakes (ID_No / Area_ha / Name) or lakes
  // just detected from imagery (lake_id / area_ha). Reading only the inventory
  // field left every row blank whenever detection results were displayed.
  const describeLake = (lake: any): string => {
    const p = lake?.properties ?? {};
    return p.Name?.trim() || p.lake_id || p.ID_No || "Unnamed lake";
  };

  const lakeAreaHa = (lake: any): string => {
    const p = lake?.properties ?? {};
    const area = typeof p.Area_ha === "number" ? p.Area_ha : p.area_ha;
    return typeof area === "number" ? `${area.toFixed(2)} ha` : "—";
  };

  /** True when any part of the lake intersects the selected bounds. */
  const isLakeInArea = (feature: GeoJsonFeature, bounds: L.LatLngBounds): boolean => {
    const geom = feature.geometry;
    if (!geom) return false;

    if (geom.type === "Point") {
      const [longitude, latitude] = geom.coordinates as number[];
      return bounds.contains([latitude, longitude]);
    }

    // Every lake in the NRSC inventory is a Polygon or MultiPolygon, so the
    // previous Point-only test meant area selection always returned nothing.
    const rings: number[][][] =
      geom.type === "Polygon"
        ? (geom.coordinates as number[][][])
        : (geom.coordinates as number[][][][]).flat();

    for (const ring of rings) {
      for (const [lng, lat] of ring) {
        if (bounds.contains([lat, lng])) return true;
      }
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
      // Run detection over the drawn rectangle rather than filtering the static
      // inventory, so this reports what the imagery shows for the chosen year.
      const sw = drawnArea!.getSouthWest();
      const ne = drawnArea!.getNorthEast();
      const areaPolygon = {
        type: "Polygon",
        coordinates: [[
          [sw.lng, sw.lat], [ne.lng, sw.lat], [ne.lng, ne.lat], [sw.lng, ne.lat], [sw.lng, sw.lat],
        ]],
      };

      setProcessingStatus("Building a cloud-free Landsat composite for the selected area…");
      const response = await fetch("/api/process-area", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ area: areaPolygon, year: parseInt(selectedYear, 10) }),
      });
      const payload = await response.json();

      if (!response.ok) {
        // Without Earth Engine, fall back to reporting the inventory lakes that
        // fall inside the rectangle. That is real data, just not freshly detected.
        const inventoryLakes = sikkimShape.features.filter((f) => isLakeInArea(f, drawnArea!));
        if (response.status === 503 && inventoryLakes.length) {
          setAnalysisResult({ lakes: inventoryLakes });
          setLakesInfo(inventoryLakes);
          analysisLayerRef.current = L.geoJSON(
            { type: "FeatureCollection", features: inventoryLakes } as GeoJsonFeatureCollection,
            { style: { color: "#be123c", weight: 2, fillColor: "#f43f5e", fillOpacity: 0.7 } },
          ).addTo(mapInstance.current!);
          setProcessingStatus(
            `Earth Engine unavailable — showing ${inventoryLakes.length} inventory lakes in this area instead.`,
          );
          return;
        }
        throw new Error(payload?.details || payload?.error || `HTTP ${response.status}`);
      }

      const detected = payload.polygons?.features ?? [];
      const stats = payload.stats ?? {};

      analysisLayerRef.current = L.geoJSON(payload.polygons, {
        style: { color: "#be123c", weight: 2, fillColor: "#f43f5e", fillOpacity: 0.7 },
        onEachFeature: (feature: any, layer: L.Layer) => {
          layer.bindPopup(
            `<b>${feature.properties?.lake_id ?? "Lake"}</b><br/>Area: ${
              feature.properties?.area_ha?.toFixed(3) ?? "?"
            } ha`,
          );
        },
      }).addTo(mapInstance.current!);

      setAnalysisResult({ lakes: detected as any });
      setLakesInfo(detected as any);
      setProcessingStatus(
        `Detected ${stats.lake_count ?? detected.length} lakes totalling ${
          stats.total_area_ha?.toFixed?.(2) ?? "?"
        } ha across ${stats.area_searched_km2 ?? "?"} km², from ${
          stats.landsat_images ?? "?"
        } Landsat scenes in ${stats.year ?? selectedYear} (${stats.processing_time_sec ?? "?"}s).`,
      );
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
    // A base layer may be several stacked tile layers, so group them and treat
    // the group as a single removable layer.
    const group = L.layerGroup(
      source.urls.map((url) =>
        L.tileLayer(url, { attribution: source.attribution, maxZoom: source.maxZoom }),
      ),
    );
    group.addTo(mapInstance.current);
    baseLayerRef.current = group;
    group.eachLayer((layer) => (layer as L.TileLayer).bringToBack());
  };

  /**
   * Start an interactive measurement.
   *
   * The previous implementation added a brand new L.Control.Draw to the map on
   * every click — stacking duplicate toolbars — without ever enabling a draw
   * handler, so no measurement could be taken and no result was displayed.
   */
  const startMeasuring = (tool: "distance" | "area") => {
    if (!mapInstance.current) return;
    handleExitAoiMode();
    setMeasureResult(null);
    setMeasureMode(tool);

    activeDrawHandlerRef.current?.disable();
    const style = { color: "#f59e0b", weight: 3 };
    const handler =
      tool === "distance"
        ? new (L as any).Draw.Polyline(mapInstance.current, { shapeOptions: style })
        : new (L as any).Draw.Polygon(mapInstance.current, { shapeOptions: { ...style, fillOpacity: 0.2 } });
    handler.enable();
    activeDrawHandlerRef.current = handler;
  };

  const clearMeasurement = () => {
    activeDrawHandlerRef.current?.disable();
    activeDrawHandlerRef.current = null;
    if (measureLayerRef.current && mapInstance.current?.hasLayer(measureLayerRef.current)) {
      mapInstance.current.removeLayer(measureLayerRef.current);
    }
    measureLayerRef.current = null;
    setMeasureResult(null);
    setMeasureMode(null);
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
            const err = await response.json().catch(() => ({}));
            const detail: string = err.details || err.error || `HTTP ${response.status}`;

            // Earth Engine needs a service-account key that most checkouts will
            // not have. Rather than dead-ending, fall back to the area change
            // measured directly between the two inventory epochs.
            const fallback = buildEpochComparison();
            if (fallback) {
                setTimeSeriesResult(fallback);
                setProcessingStatus(
                    "Earth Engine is not configured, so this shows measured change between the 2016-17 and 2022 inventories instead.",
                );
                return;
            }
            throw new Error(
                /GEE_CREDENTIALS_JSON/.test(detail)
                    ? "Earth Engine is not configured on this server, and this lake has no matched 2016-17 record to compare against. Set GEE_CREDENTIALS_JSON in Glacier_Website_MAIN/.env.local to enable multi-year analysis."
                    : detail,
            );
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

  /**
   * Build a two-point series from the selected lake's own inventory records.
   *
   * The 2022 inventory carries the matched 2016-2017 area for most lakes, so a
   * real measured comparison is available without Earth Engine. Two points
   * cannot support a significance test, which is why the trend panel reports
   * insufficient data rather than a spurious p-value.
   */
  const buildEpochComparison = (): TimeSeriesResult | null => {
    const p: any = selectedLake?.properties;
    if (!p || p.Area_2016_ha == null || p.Area_ha == null) return null;
    return {
      timeSeriesData: [
        { year: 2016, area: p.Area_2016_ha, imageCount: 1, featureCount: 1, intersectingCount: 1 },
        { year: 2022, area: p.Area_ha, imageCount: 1, featureCount: 1, intersectingCount: 1 },
      ],
      analysisStartYear: 2016,
      analysisEndYear: 2022,
    };
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
                <Button onClick={() => startMeasuring("distance")} variant="outline" size="sm"
                  className={`w-full justify-start ${measureMode === "distance" ? "bg-amber-100 border-amber-400" : "bg-transparent"}`}>
                  <Ruler className="w-4 h-4 mr-2" /> Measure Distance
                </Button>
                <Button onClick={() => startMeasuring("area")} variant="outline" size="sm"
                  className={`w-full justify-start ${measureMode === "area" ? "bg-amber-100 border-amber-400" : "bg-transparent"}`}>
                  <Ruler className="w-4 h-4 mr-2" /> Measure Area
                </Button>
                {measureMode && (
                  <p className="text-xs text-amber-700 px-1">
                    Click on the map to add points, then click the last point again to finish.
                  </p>
                )}
                {measureResult && (
                  <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs">
                    <div className="font-semibold text-amber-900">{measureResult}</div>
                    <button onClick={clearMeasurement} className="mt-1 text-amber-700 hover:underline">
                      Clear measurement
                    </button>
                  </div>
                )}
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
          <div className="flex-1 relative">
            {lakeDataError && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] max-w-xl rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-md">
                {lakeDataError}
              </div>
            )}
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
                            <h4 className="font-medium">Lakes:</h4>
                            <ul className="mt-1 space-y-0.5 max-h-48 overflow-y-auto">
                              {analysisResult.lakes.map((lake, index) => (
                                <li key={index} className="flex justify-between gap-3 text-xs">
                                  <span className="truncate">{describeLake(lake)}</span>
                                  <span className="font-mono shrink-0">{lakeAreaHa(lake)}</span>
                                </li>
                              ))}
                            </ul>
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
                <div className="flex font-semibold text-gray-600 px-2 text-xs">
                  <div className="flex-1">Lake</div>
                  <div className="w-16 text-right">Area</div>
                  <div className="w-14 text-right">Index</div>
                </div>
                {riskAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="flex items-center bg-gray-50 p-2 rounded-md hover:bg-gray-100 transition-colors"
                    title={`${alert.lakeType ?? ""}${alert.elevationM ? ` — ${alert.elevationM} m` : ""} — surveyed ${alert.lastUpdated}`}
                  >
                    <AlertTriangle className={`w-4 h-4 mr-2 shrink-0 ${riskColor(alert.riskLevel)}`} />
                    <div className="flex-1 truncate text-xs" title={alert.name}>{alert.name}</div>
                    <div className="w-16 text-right text-gray-500 text-xs">
                      {alert.areaHa !== undefined ? `${alert.areaHa.toFixed(1)} ha` : "—"}
                    </div>
                    <div className={`w-14 text-right font-semibold text-xs ${riskColor(alert.riskLevel)}`}>
                      {alert.score !== undefined ? alert.score.toFixed(0) : alert.riskLevel}
                    </div>
                  </div>
                ))}
                <p className="text-[10px] leading-snug text-gray-500 px-2 pt-1">
                  Screening index for prioritising monitoring, ranked from the NRSC
                  inventory by dam type, area and elevation. Not a validated hazard
                  assessment.
                </p>
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
                                        
                                        {/* Mann-Kendall Trend Detection */}
                                        {(() => {
                                            const trend = getTrendAnalysis();
                                            if (!trend) {
                                                return (
                                                    <div className="p-3 bg-white rounded-md border text-xs text-gray-500">
                                                        <h5 className="font-semibold mb-1 text-gray-700">Trend Detection</h5>
                                                        Needs at least 3 years with imagery to run the Mann&ndash;Kendall test.
                                                    </div>
                                                );
                                            }
                                            const tone = !trend.significant
                                                ? "bg-gray-50 border-gray-300 text-gray-700"
                                                : trend.trend === "increasing"
                                                  ? "bg-red-50 border-red-300 text-red-900"
                                                  : "bg-blue-50 border-blue-300 text-blue-900";
                                            return (
                                                <div className={`p-3 rounded-md border text-xs ${tone}`}>
                                                    <h5 className="font-semibold mb-2">
                                                        Trend Detection (Mann&ndash;Kendall)
                                                    </h5>
                                                    <p className="mb-2">{describeTrend(trend)}</p>
                                                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono">
                                                        <div className="flex justify-between">
                                                            <span>Sen&apos;s slope</span>
                                                            <span>{trend.sensSlope >= 0 ? "+" : ""}{trend.sensSlope.toFixed(3)} ha/yr</span>
                                                        </div>
                                                        <div className="flex justify-between">
                                                            <span>Total change</span>
                                                            <span>{trend.totalChange >= 0 ? "+" : ""}{trend.totalChange.toFixed(2)} ha</span>
                                                        </div>
                                                        <div className="flex justify-between">
                                                            <span>p-value</span>
                                                            <span>{trend.pValue < 0.001 ? "< 0.001" : trend.pValue.toFixed(3)}</span>
                                                        </div>
                                                        <div className="flex justify-between">
                                                            <span>Kendall&apos;s &tau;</span>
                                                            <span>{trend.tau.toFixed(3)}</span>
                                                        </div>
                                                        <div className="flex justify-between">
                                                            <span>S statistic</span>
                                                            <span>{trend.S}</span>
                                                        </div>
                                                        <div className="flex justify-between">
                                                            <span>Years used</span>
                                                            <span>{trend.n}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })()}

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
            <div className="cursor-auto max-h-64 overflow-y-auto min-w-56">
                <ul className="space-y-0.5">
                  {lakesInfo.map((lake, index) => (
                    <li key={index} className="flex justify-between gap-4 text-sm">
                      <span className="truncate">{describeLake(lake)}</span>
                      <span className="font-mono text-gray-600 shrink-0">{lakeAreaHa(lake)}</span>
                    </li>
                  ))}
                </ul>
                {lakesInfo.length === 0 && (
                  <p className="text-sm text-gray-500">No lakes to show.</p>
                )}
            </div>
        </div>
      )}

      {/* Toggle button for layer panel when closed */}
      {!isLayerPanelOpen && (
        // Leaflet's own panes and controls sit at z-index 400-1000 (see
        // leaflet.css), so this previously rendered at z-30 and was hidden
        // behind the map — there was no way to reopen the panel once collapsed.
        <div className="absolute left-0 top-1/2 -translate-y-1/2 z-[1100]">
          <Button
            variant="default"
            size="sm"
            onClick={() => setIsLayerPanelOpen(true)}
            title="Show map layers"
            className="rounded-r-md rounded-l-none shadow-md gap-1.5 pl-2 pr-3"
          >
            <Layers className="w-4 h-4" />
            <ChevronDown className="w-3.5 h-3.5 -rotate-90" />
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
