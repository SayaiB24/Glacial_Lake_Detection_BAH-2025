"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Search,
  Layers,
  Home,
  ZoomIn,
  ZoomOut,
  Ruler,
  Download,
  ChevronLeft,
  ChevronRight,
  Expand,
  Info,
  BarChart3,
  FileText,
  TriangleIcon as ExclamationTriangle,
  MapIcon,
  Snowflake,
  MapPin,
  Droplets,
} from "lucide-react"
import Link from "next/link"

// Leaflet imports (client-side only)
let L: any = null
if (typeof window !== "undefined") {
  L = require("leaflet")
  require("leaflet/dist/leaflet.css")
}

interface LayerData {
  id: string
  name: string
  enabled: boolean
  icon: any
  data?: any
}

interface FeatureInfo {
  type: string
  properties: any
}

export default function GISMapPage() {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<any>(null)
  const [isLayerPanelOpen, setIsLayerPanelOpen] = useState(true)
  const [isInfoPanelOpen, setIsInfoPanelOpen] = useState(true)
  const [activeTab, setActiveTab] = useState("information")
  const [selectedFeature, setSelectedFeature] = useState<FeatureInfo | null>(null)
  const [coordinates, setCoordinates] = useState("28.2380° N, 83.9956° E")
  const layerRefs = useRef<{ [key: string]: any }>({})

  const [layers, setLayers] = useState<LayerData[]>([
    { id: "satellite", name: "Satellite", enabled: false, icon: MapIcon },
    { id: "terrain", name: "Terrain", enabled: false, icon: MapIcon },
    { id: "hybrid", name: "Hybrid", enabled: true, icon: MapIcon },
  ])

  const [featureLayers, setFeatureLayers] = useState<LayerData[]>([
    { id: "lakes", name: "Glacial Lakes", enabled: true, icon: Droplets },
    { id: "rivers", name: "Rivers", enabled: true, icon: Droplets },
    { id: "glaciers", name: "Glaciers", enabled: false, icon: Snowflake },
    { id: "watersheds", name: "Watersheds", enabled: false, icon: MapPin },
  ])

  useEffect(() => {
    if (!mapRef.current || !L) return

    // Initialize map
    mapInstance.current = L.map(mapRef.current, {
      center: [28.238, 83.9956],
      zoom: 6,
      zoomControl: false,
    })

    // Add base layer
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors | Data: ISRO, NRSC",
    }).addTo(mapInstance.current)

    // Load initial data
    loadLayerData()

    // Update coordinates on mouse move
    mapInstance.current.on("mousemove", (e: any) => {
      const lat = e.latlng.lat.toFixed(4)
      const lng = e.latlng.lng.toFixed(4)
      setCoordinates(`${lat}° N, ${lng}° E`)
    })

    // Set default selected feature
    setTimeout(() => {
      setSelectedFeature({
        type: "Lake",
        properties: {
          id: "GL-2024-001",
          name: "Rakshasa Tal",
          elevation: 4520,
          area_km2: 0.85,
          volume: 12.3,
          risk_level: "Moderate",
          basin: "Indus",
        },
      })
    }, 1000)

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove()
      }
    }
  }, [])

  const loadLayerData = async () => {
    try {
      // Load lakes data
      const lakesResponse = await fetch("/api/data/lakes")
      const lakesData = await lakesResponse.json()

      const lakesLayer = L.geoJSON(lakesData, {
        style: {
          color: "#3B82F6",
          weight: 2,
          fillOpacity: 0.6,
          fillColor: "#93C5FD",
        },
        onEachFeature: (feature: any, layer: any) => {
          layer.on("click", () => {
            setSelectedFeature({
              type: "Lake",
              properties: feature.properties,
            })
          })

          const popupContent = `
            <div class="p-2">
              <h4 class="font-bold text-gray-900 mb-2">${feature.properties.name || "Unnamed Lake"}</h4>
              <p class="text-sm"><strong>Elevation:</strong> ${feature.properties.elevation || "N/A"} m</p>
              <p class="text-sm"><strong>Area:</strong> ${feature.properties.area_km2 || "N/A"} km²</p>
              <p class="text-sm"><strong>Risk Level:</strong> ${feature.properties.risk_level || "Unknown"}</p>
            </div>
          `
          layer.bindPopup(popupContent)
        },
      })

      layerRefs.current["lakes"] = lakesLayer
      lakesLayer.addTo(mapInstance.current)

      // Load rivers data
      const riversResponse = await fetch("/api/data/rivers")
      const riversData = await riversResponse.json()

      const riversLayer = L.geoJSON(riversData, {
        style: {
          color: "#06B6D4",
          weight: 3,
          opacity: 0.8,
        },
        onEachFeature: (feature: any, layer: any) => {
          layer.on("click", () => {
            setSelectedFeature({
              type: "River",
              properties: feature.properties,
            })
          })

          const popupContent = `
            <div class="p-2">
              <h4 class="font-bold text-gray-900 mb-2">${feature.properties.name || "Unnamed River"}</h4>
              <p class="text-sm"><strong>Length:</strong> ${feature.properties.length_km || "N/A"} km</p>
              <p class="text-sm"><strong>Basin:</strong> ${feature.properties.basin || "N/A"}</p>
              <p class="text-sm"><strong>Flow Rate:</strong> ${feature.properties.flow_rate || "N/A"}</p>
            </div>
          `
          layer.bindPopup(popupContent)
        },
      })

      layerRefs.current["rivers"] = riversLayer
      riversLayer.addTo(mapInstance.current)
    } catch (error) {
      console.error("Error loading layer data:", error)
    }
  }

  const toggleLayer = (layerId: string) => {
    setFeatureLayers((prev) =>
      prev.map((layer) => (layer.id === layerId ? { ...layer, enabled: !layer.enabled } : layer)),
    )

    const layer = layerRefs.current[layerId]
    if (layer) {
      const isEnabled = featureLayers.find((l) => l.id === layerId)?.enabled
      if (isEnabled) {
        mapInstance.current.removeLayer(layer)
      } else {
        mapInstance.current.addLayer(layer)
      }
    }
  }

  const zoomIn = () => {
    if (mapInstance.current) {
      mapInstance.current.zoomIn()
    }
  }

  const zoomOut = () => {
    if (mapInstance.current) {
      mapInstance.current.zoomOut()
    }
  }

  const goHome = () => {
    if (mapInstance.current) {
      mapInstance.current.setView([28.238, 83.9956], 6)
    }
  }

  const downloadData = (format: string) => {
    if (!selectedFeature) {
      alert("Please select a feature first")
      return
    }

    const filename = `feature_data.${format}`
    const link = document.createElement("a")
    link.href = `/downloads/reports/${filename}`
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const downloadReport = (reportName: string) => {
    const link = document.createElement("a")
    link.href = `/downloads/reports/${reportName}`
    link.download = reportName
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b z-10 h-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full">
          <div className="flex justify-between items-center h-full">
            <div className="flex items-center space-x-8">
              <Link href="/" className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">❄</span>
                </div>
                <span className="text-xl font-bold text-gray-900">GlacierWatch</span>
              </Link>
              <nav className="hidden md:flex space-x-8">
                <Link href="/" className="text-gray-600 hover:text-gray-900">
                  Home
                </Link>
                <Link href="/gis-map" className="text-gray-900 font-medium">
                  Map
                </Link>
                <Link href="/reports" className="text-gray-600 hover:text-gray-900">
                  Reports
                </Link>
                <Link href="/data" className="text-gray-600 hover:text-gray-900">
                  Data
                </Link>
                <Link href="/about" className="text-gray-600 hover:text-gray-900">
                  About
                </Link>
                <Link href="/contact" className="text-gray-600 hover:text-gray-900">
                  Contact
                </Link>
              </nav>
            </div>
            <div className="flex items-center space-x-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input placeholder="Search locations..." className="pl-10 w-64" />
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 flex relative">
        {/* Left Sidebar - Map Layers */}
        <div
          className={`bg-white shadow-lg z-20 transition-transform duration-300 border-r ${
            isLayerPanelOpen ? "translate-x-0" : "-translate-x-full"
          }`}
          style={{ width: "300px" }}
        >
          <div className="p-4 border-b bg-gray-50">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold flex items-center text-gray-700">
                <Layers className="w-5 h-5 mr-2" />
                Map Layers
              </h3>
              <Button variant="ghost" size="sm" onClick={() => setIsLayerPanelOpen(false)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="p-4 space-y-4 max-h-96 overflow-y-auto">
            {/* Base Layers */}
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
                    onChange={() => {
                      setLayers((prev) => prev.map((l) => ({ ...l, enabled: l.id === layer.id })))
                    }}
                    className="text-blue-600"
                  />
                  <label htmlFor={layer.id} className="text-sm text-gray-600 cursor-pointer">
                    {layer.name}
                  </label>
                </div>
              ))}
            </div>

            {/* Glacial Features */}
            <div className="space-y-2">
              <div className="flex items-center space-x-2 text-sm font-medium text-gray-700 mb-2">
                <Snowflake className="w-4 h-4" />
                <span>Glacial Features</span>
              </div>
              {featureLayers.map((layer) => (
                <div key={layer.id} className="flex items-center space-x-3 pl-6">
                  <Checkbox id={layer.id} checked={layer.enabled} onCheckedChange={() => toggleLayer(layer.id)} />
                  <label htmlFor={layer.id} className="text-sm text-gray-600 cursor-pointer">
                    {layer.name}
                  </label>
                </div>
              ))}
            </div>

            {/* Analysis Tools */}
            <div className="pt-4 border-t">
              <h4 className="text-sm font-medium text-gray-700 mb-3">Analysis Tools</h4>
              <div className="space-y-2">
                <Button variant="outline" size="sm" className="w-full justify-start bg-transparent">
                  <Ruler className="w-4 h-4 mr-2" />
                  Measure Distance
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start bg-transparent">
                  <MapIcon className="w-4 h-4 mr-2" />
                  Measure Area
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start bg-transparent">
                  <Download className="w-4 h-4 mr-2" />
                  Export Data
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Layer Panel Toggle Button */}
        {!isLayerPanelOpen && (
          <Button className="absolute top-4 left-4 z-20" onClick={() => setIsLayerPanelOpen(true)} size="sm">
            <ChevronRight className="w-4 h-4" />
          </Button>
        )}

        {/* Map Container */}
        <div className="flex-1 relative">
          <div ref={mapRef} className="w-full h-full" />

          {/* Map Controls */}
          <div className="absolute top-4 right-4 z-20 space-y-2">
            <Button onClick={zoomIn} size="sm" className="block w-10 h-10 p-0">
              <ZoomIn className="w-4 h-4" />
            </Button>
            <Button onClick={zoomOut} size="sm" className="block w-10 h-10 p-0">
              <ZoomOut className="w-4 h-4" />
            </Button>
            <Button onClick={goHome} size="sm" className="block w-10 h-10 p-0">
              <Home className="w-4 h-4" />
            </Button>
            <Button size="sm" className="block w-10 h-10 p-0">
              <Expand className="w-4 h-4" />
            </Button>
          </div>

          {/* Coordinates Display */}
          <div className="absolute bottom-4 left-4 z-20 bg-white/90 backdrop-blur-sm px-3 py-2 rounded-lg shadow-lg text-sm">
            <div className="flex items-center space-x-4 text-gray-600">
              <span>{coordinates}</span>
              <span>Scale: 1:50,000</span>
              <span>Data: ISRO, NRSC</span>
            </div>
          </div>
        </div>

        {/* Right Sidebar - Information Panel */}
        <div
          className={`bg-white shadow-lg z-20 transition-transform duration-300 border-l ${
            isInfoPanelOpen ? "translate-x-0" : "translate-x-full"
          }`}
          style={{ width: "350px" }}
        >
          <div className="border-b bg-gray-50">
            <div className="flex items-center justify-between p-2">
              <div className="flex space-x-1">
                <Button
                  variant={activeTab === "information" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setActiveTab("information")}
                  className="text-xs"
                >
                  <Info className="w-3 h-3 mr-1" />
                  Information
                </Button>
                <Button
                  variant={activeTab === "analysis" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setActiveTab("analysis")}
                  className="text-xs"
                >
                  <BarChart3 className="w-3 h-3 mr-1" />
                  Analysis
                </Button>
                <Button
                  variant={activeTab === "reports" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setActiveTab("reports")}
                  className="text-xs"
                >
                  <FileText className="w-3 h-3 mr-1" />
                  Reports
                </Button>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setIsInfoPanelOpen(false)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="p-4 h-full overflow-y-auto">
            {/* Information Tab */}
            {activeTab === "information" && (
              <div className="space-y-6">
                {selectedFeature && (
                  <>
                    {/* Selected Feature */}
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-3 pb-2 border-b">Selected Feature</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Lake ID</span>
                          <span className="font-medium">{selectedFeature.properties.id || "GL-2024-001"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Name</span>
                          <span className="font-medium">{selectedFeature.properties.name || "Rakshasa Tal"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Elevation</span>
                          <span className="font-medium">{selectedFeature.properties.elevation || "4,520"} m</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Area</span>
                          <span className="font-medium">{selectedFeature.properties.area_km2 || "0.85"} km²</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Volume</span>
                          <span className="font-medium">{selectedFeature.properties.volume || "12.3"} million m³</span>
                        </div>
                      </div>
                    </div>

                    {/* Risk Assessment */}
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-3 pb-2 border-b">Risk Assessment</h4>
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-3">
                        <div className="flex items-center space-x-2 text-yellow-800 font-medium mb-2">
                          <ExclamationTriangle className="w-4 h-4" />
                          <span>Moderate Risk Level</span>
                        </div>
                        <p className="text-sm text-yellow-700">
                          Based on current monitoring data, this lake shows moderate risk of outburst. Regular
                          monitoring recommended.
                        </p>
                      </div>
                      <Button className="w-full bg-blue-600 hover:bg-blue-700">View Detailed Assessment</Button>
                    </div>

                    {/* Download Data */}
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-3 pb-2 border-b">Download Data</h4>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between p-2 border rounded-lg">
                          <div className="flex items-center space-x-2">
                            <FileText className="w-4 h-4 text-gray-500" />
                            <span className="text-sm">Shapefile</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className="text-xs text-gray-500">2.4 MB</span>
                            <Button size="sm" onClick={() => downloadData("shp")} className="h-6 w-6 p-0">
                              <Download className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                        <div className="flex items-center justify-between p-2 border rounded-lg">
                          <div className="flex items-center space-x-2">
                            <FileText className="w-4 h-4 text-gray-500" />
                            <span className="text-sm">GeoJSON</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className="text-xs text-gray-500">1.8 MB</span>
                            <Button size="sm" onClick={() => downloadData("geojson")} className="h-6 w-6 p-0">
                              <Download className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                        <div className="flex items-center justify-between p-2 border rounded-lg">
                          <div className="flex items-center space-x-2">
                            <FileText className="w-4 h-4 text-gray-500" />
                            <span className="text-sm">PDF Report</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className="text-xs text-gray-500">3.2 MB</span>
                            <Button size="sm" onClick={() => downloadData("pdf")} className="h-6 w-6 p-0">
                              <Download className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Analysis Tab */}
            {activeTab === "analysis" && (
              <div className="space-y-6">
                <div>
                  <h4 className="font-semibold text-gray-900 mb-3">Lake Volume Trend</h4>
                  <div className="h-32 bg-gray-100 rounded-lg flex items-center justify-center">
                    <span className="text-gray-500 text-sm">Chart visualization would appear here</span>
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 mb-3">Risk Distribution</h4>
                  <div className="h-32 bg-gray-100 rounded-lg flex items-center justify-center">
                    <span className="text-gray-500 text-sm">Risk chart would appear here</span>
                  </div>
                </div>
              </div>
            )}

            {/* Reports Tab */}
            {activeTab === "reports" && (
              <div>
                <h4 className="font-semibold text-gray-900 mb-3 pb-2 border-b">Available Reports</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <h5 className="font-medium text-sm">Monthly Assessment</h5>
                      <p className="text-xs text-gray-500">January 2024</p>
                    </div>
                    <Button size="sm" onClick={() => downloadReport("monthly-jan-2024.pdf")} className="h-8 w-8 p-0">
                      <Download className="w-3 h-3" />
                    </Button>
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <h5 className="font-medium text-sm">Risk Analysis</h5>
                      <p className="text-xs text-gray-500">December 2023</p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => downloadReport("risk-analysis-dec-2023.pdf")}
                      className="h-8 w-8 p-0"
                    >
                      <Download className="w-3 h-3" />
                    </Button>
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <h5 className="font-medium text-sm">Annual Summary</h5>
                      <p className="text-xs text-gray-500">2023</p>
                    </div>
                    <Button size="sm" onClick={() => downloadReport("annual-summary-2023.pdf")} className="h-8 w-8 p-0">
                      <Download className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Info Panel Toggle Button */}
        {!isInfoPanelOpen && (
          <Button className="absolute top-4 right-4 z-20" onClick={() => setIsInfoPanelOpen(true)} size="sm">
            <ChevronLeft className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
