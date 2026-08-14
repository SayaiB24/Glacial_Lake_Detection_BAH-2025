"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Search, Layers, Home, ZoomIn, ZoomOut, Ruler, Download, ChevronLeft, ChevronRight, X } from "lucide-react"
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
  data?: any
}

export default function InteractiveMap() {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<any>(null)
  const [isLayerPanelOpen, setIsLayerPanelOpen] = useState(true)
  const [layers, setLayers] = useState<LayerData[]>([
    { id: "lakes", name: "Glacial Lakes", enabled: true },
    { id: "rivers", name: "Rivers", enabled: true },
    { id: "glaciers", name: "Glaciers", enabled: false },
    { id: "watersheds", name: "Watersheds", enabled: false },
    { id: "elevation", name: "Elevation", enabled: false },
    { id: "temperature", name: "Temperature", enabled: false },
  ])
  const [selectedFeature, setSelectedFeature] = useState<any>(null)
  const [dataError, setDataError] = useState<string | null>(null)
  const layerRefs = useRef<{ [key: string]: any }>({})

  useEffect(() => {
    if (!mapRef.current || !L) return

    // Initialize map
    mapInstance.current = L.map(mapRef.current).setView([28.238, 83.9956], 6)

    // Add base layer
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
    }).addTo(mapInstance.current)

    // Load initial data
    loadLayerData()

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove()
      }
    }
  }, [])

  // The /api/data/* endpoints are not implemented and the backing GeoJSON files
  // are not committed, so surface a clear message instead of an empty map.
  const fetchGeoJson = async (url: string, label: string) => {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`${label} (${url}): HTTP ${response.status}`)
    return response.json()
  }

  const loadLayerData = async () => {
    try {
      // Load lakes data
      const lakesData = await fetchGeoJson("/api/data/lakes", "Glacial Lakes")

      const lakesLayer = L.geoJSON(lakesData, {
        style: {
          color: "#3B82F6",
          weight: 2,
          fillOpacity: 0.6,
        },
        onEachFeature: (feature: any, layer: any) => {
          layer.on("click", () => {
            setSelectedFeature({
              type: "Lake",
              properties: feature.properties,
            })
          })
        },
      })

      layerRefs.current["lakes"] = lakesLayer
      lakesLayer.addTo(mapInstance.current)

      // Load rivers data
      const riversData = await fetchGeoJson("/api/data/rivers", "Rivers")

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
        },
      })

      layerRefs.current["rivers"] = riversLayer
      riversLayer.addTo(mapInstance.current)
      setDataError(null)
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown error"
      console.error("Error loading layer data:", detail)
      setDataError(
        `Map layers could not be loaded — ${detail}. The /api/data/* endpoints are not implemented and their GeoJSON files are not in the repository.`,
      )
    }
  }

  const toggleLayer = (layerId: string) => {
    setLayers((prev) => prev.map((layer) => (layer.id === layerId ? { ...layer, enabled: !layer.enabled } : layer)))

    const layer = layerRefs.current[layerId]
    if (layer) {
      const isEnabled = layers.find((l) => l.id === layerId)?.enabled
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

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-sm border-b z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
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
                  Interactive Map
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

      <div className="flex-1 relative">
        {/* Layer Panel */}
        <div
          className={`absolute top-0 left-0 h-full bg-white shadow-lg z-20 transition-transform duration-300 ${
            isLayerPanelOpen ? "translate-x-0" : "-translate-x-full"
          }`}
          style={{ width: "320px" }}
        >
          <div className="p-4 border-b">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold flex items-center">
                <Layers className="w-5 h-5 mr-2" />
                Map Layers
              </h3>
              <Button variant="ghost" size="sm" onClick={() => setIsLayerPanelOpen(false)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
            {layers.map((layer) => (
              <div key={layer.id} className="flex items-center space-x-3">
                <Checkbox id={layer.id} checked={layer.enabled} onCheckedChange={() => toggleLayer(layer.id)} />
                <label
                  htmlFor={layer.id}
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  {layer.name}
                </label>
              </div>
            ))}
          </div>
        </div>

        {/* Layer Panel Toggle Button */}
        {!isLayerPanelOpen && (
          <Button className="absolute top-4 left-4 z-20" onClick={() => setIsLayerPanelOpen(true)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        )}

        {/* Map Controls */}
        <div className="absolute top-4 right-4 z-20 space-y-2">
          <Button onClick={zoomIn} size="sm" className="block">
            <ZoomIn className="w-4 h-4" />
          </Button>
          <Button onClick={zoomOut} size="sm" className="block">
            <ZoomOut className="w-4 h-4" />
          </Button>
          <Button onClick={goHome} size="sm" className="block">
            <Home className="w-4 h-4" />
          </Button>
          <Button size="sm" className="block">
            <Ruler className="w-4 h-4" />
          </Button>
          <Button size="sm" className="block">
            <Download className="w-4 h-4" />
          </Button>
        </div>

        {/* Feature Info Panel */}
        {selectedFeature && (
          <Card className="absolute bottom-4 right-4 z-20 w-80">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{selectedFeature.type} Information</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setSelectedFeature(null)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(selectedFeature.properties || {}).map(([key, value]) => (
                  <div key={key} className="flex justify-between">
                    <span className="font-medium capitalize">{key.replace("_", " ")}:</span>
                    <span className="text-gray-600">{String(value)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {dataError && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] max-w-2xl rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-md">
            {dataError}
          </div>
        )}

        {/* Map Container */}
        <div
          ref={mapRef}
          className="w-full h-full"
          style={{
            marginLeft: isLayerPanelOpen ? "320px" : "0",
            width: isLayerPanelOpen ? "calc(100% - 320px)" : "100%",
            transition: "margin-left 0.3s, width 0.3s",
          }}
        />
      </div>
    </div>
  )
}
