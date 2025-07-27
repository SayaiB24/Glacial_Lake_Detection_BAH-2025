import { Chart } from "@/components/ui/chart"
// Import Leaflet library
const L = window.L

// Global variables
let map
let layerGroups = {}
let selectedFeature = null
const measureControl = null

// Initialize map
function initializeMap() {
  // Create map
  map = L.map("map", {
    center: [28.238, 83.9956],
    zoom: 6,
    zoomControl: false,
  })

  // Add base layer
  const baseLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors",
  })
  baseLayer.addTo(map)

  // Initialize layer groups
  layerGroups = {
    lakes: L.layerGroup(),
    rivers: L.layerGroup(),
    glaciers: L.layerGroup(),
    watersheds: L.layerGroup(),
  }

  // Load initial data
  loadMapData()

  // Update coordinates on mouse move
  map.on("mousemove", updateCoordinates)

  // Handle feature clicks
  map.on("click", handleMapClick)
}

// Load map data from API
async function loadMapData() {
  try {
    // Load lakes
    const lakesResponse = await fetch("/api/data/lakes")
    const lakesData = await lakesResponse.json()

    const lakesLayer = L.geoJSON(lakesData, {
      style: {
        color: "#3b82f6",
        weight: 2,
        fillOpacity: 0.6,
        fillColor: "#93c5fd",
      },
      onEachFeature: (feature, layer) => {
        layer.on("click", () => selectFeature(feature, "Lake"))

        // Add popup
        const popupContent = `
                    <div>
                        <h4>${feature.properties.name || "Unnamed Lake"}</h4>
                        <p><strong>Elevation:</strong> ${feature.properties.elevation || "N/A"} m</p>
                        <p><strong>Area:</strong> ${feature.properties.area_km2 || "N/A"} km²</p>
                        <p><strong>Risk Level:</strong> ${feature.properties.risk_level || "Unknown"}</p>
                    </div>
                `
        layer.bindPopup(popupContent)
      },
    })

    layerGroups.lakes.addLayer(lakesLayer)
    layerGroups.lakes.addTo(map)

    // Load rivers
    const riversResponse = await fetch("/api/data/rivers")
    const riversData = await riversResponse.json()

    const riversLayer = L.geoJSON(riversData, {
      style: {
        color: "#06b6d4",
        weight: 3,
        opacity: 0.8,
      },
      onEachFeature: (feature, layer) => {
        layer.on("click", () => selectFeature(feature, "River"))

        const popupContent = `
                    <div>
                        <h4>${feature.properties.name || "Unnamed River"}</h4>
                        <p><strong>Length:</strong> ${feature.properties.length_km || "N/A"} km</p>
                        <p><strong>Basin:</strong> ${feature.properties.basin || "N/A"}</p>
                        <p><strong>Flow Rate:</strong> ${feature.properties.flow_rate || "N/A"}</p>
                    </div>
                `
        layer.bindPopup(popupContent)
      },
    })

    layerGroups.rivers.addLayer(riversLayer)
    layerGroups.rivers.addTo(map)

    // Load glaciers
    const glaciersResponse = await fetch("/api/data/glaciers")
    const glaciersData = await glaciersResponse.json()

    const glaciersLayer = L.geoJSON(glaciersData, {
      style: {
        color: "#f3f4f6",
        weight: 2,
        fillOpacity: 0.7,
        fillColor: "#e5e7eb",
      },
      onEachFeature: (feature, layer) => {
        layer.on("click", () => selectFeature(feature, "Glacier"))

        const popupContent = `
                    <div>
                        <h4>${feature.properties.name || "Unnamed Glacier"}</h4>
                        <p><strong>Area:</strong> ${feature.properties.area_km2 || "N/A"} km²</p>
                        <p><strong>Elevation:</strong> ${feature.properties.elevation || "N/A"} m</p>
                        <p><strong>Status:</strong> ${feature.properties.status || "N/A"}</p>
                    </div>
                `
        layer.bindPopup(popupContent)
      },
    })

    layerGroups.glaciers.addLayer(glaciersLayer)

    // Load watersheds
    const watershedsResponse = await fetch("/api/data/watersheds")
    const watershedsData = await watershedsResponse.json()

    const watershedsLayer = L.geoJSON(watershedsData, {
      style: {
        color: "#10b981",
        weight: 2,
        fillOpacity: 0.3,
        fillColor: "#6ee7b7",
      },
      onEachFeature: (feature, layer) => {
        layer.on("click", () => selectFeature(feature, "Watershed"))

        const popupContent = `
                    <div>
                        <h4>${feature.properties.name || "Unnamed Watershed"}</h4>
                        <p><strong>Area:</strong> ${feature.properties.area_km2 || "N/A"} km²</p>
                        <p><strong>Basin:</strong> ${feature.properties.basin || "N/A"}</p>
                        <p><strong>Rivers:</strong> ${feature.properties.river_count || "N/A"}</p>
                    </div>
                `
        layer.bindPopup(popupContent)
      },
    })

    layerGroups.watersheds.addLayer(watershedsLayer)
  } catch (error) {
    console.error("Error loading map data:", error)
  }
}

// Select feature and update info panel
function selectFeature(feature, type) {
  selectedFeature = { feature, type }
  updateInfoPanel()
}

// Update info panel with selected feature
function updateInfoPanel() {
  if (!selectedFeature) return

  const { feature, type } = selectedFeature
  const props = feature.properties

  // Update feature information
  document.getElementById("lakeId").textContent = props.id || "GL-2024-001"
  document.getElementById("lakeName").textContent = props.name || "Rakshasa Tal"
  document.getElementById("lakeElevation").textContent = `${props.elevation || "4,520"} m`
  document.getElementById("lakeArea").textContent = `${props.area_km2 || "0.85"} km²`
  document.getElementById("lakeVolume").textContent = `${props.volume || "12.3"} million m³`

  // Update risk assessment
  const riskLevel = props.risk_level || "Moderate"
  const riskElement = document.querySelector(".risk-level")
  riskElement.className = `risk-level ${riskLevel.toLowerCase().replace(" ", "-")}`
  riskElement.querySelector("span").textContent = `${riskLevel} Risk Level`
}

// Handle map click
function handleMapClick(e) {
  updateCoordinates(e)
}

// Update coordinates display
function updateCoordinates(e) {
  const lat = e.latlng.lat.toFixed(4)
  const lng = e.latlng.lng.toFixed(4)
  document.getElementById("coordinates").textContent = `${lat}° N, ${lng}° E`
}

// Layer control functionality
function initializeLayerControls() {
  // Base layer controls
  document.querySelectorAll('input[name="baseLayer"]').forEach((radio) => {
    radio.addEventListener("change", (e) => {
      // Switch base layer logic would go here
      console.log("Base layer changed to:", e.target.value)
    })
  })

  // Feature layer controls
  const layerCheckboxes = {
    glacialLakesLayer: "lakes",
    riversLayer: "rivers",
    glaciersLayer: "glaciers",
    watershedsLayer: "watersheds",
  }

  Object.entries(layerCheckboxes).forEach(([checkboxId, layerKey]) => {
    const checkbox = document.getElementById(checkboxId)
    if (checkbox) {
      checkbox.addEventListener("change", (e) => {
        const layer = layerGroups[layerKey]
        if (e.target.checked) {
          map.addLayer(layer)
        } else {
          map.removeLayer(layer)
        }
      })
    }
  })
}

// Tab functionality
function initializeTabs() {
  const tabButtons = document.querySelectorAll(".tab-button")
  const tabContents = document.querySelectorAll(".tab-content")

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const targetTab = button.getAttribute("data-tab")

      // Remove active class from all tabs
      tabButtons.forEach((btn) => btn.classList.remove("active"))
      tabContents.forEach((content) => content.classList.remove("active"))

      // Add active class to clicked tab
      button.classList.add("active")
      document.getElementById(targetTab + "Tab").classList.add("active")

      // Initialize charts if analysis tab is selected
      if (targetTab === "analysis") {
        initializeCharts()
      }
    })
  })
}

// Initialize charts
function initializeCharts() {
  // Volume trend chart
  const volumeCtx = document.getElementById("volumeChart")
  if (volumeCtx && !volumeCtx.chart) {
    volumeCtx.chart = new Chart(volumeCtx, {
      type: "line",
      data: {
        labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
        datasets: [
          {
            label: "Volume (million m³)",
            data: [12.1, 12.3, 12.5, 12.2, 12.4, 12.3],
            borderColor: "#3b82f6",
            backgroundColor: "rgba(59, 130, 246, 0.1)",
            tension: 0.4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: false,
          },
        },
      },
    })
  }

  // Risk distribution chart
  const riskCtx = document.getElementById("riskChart")
  if (riskCtx && !riskCtx.chart) {
    riskCtx.chart = new Chart(riskCtx, {
      type: "doughnut",
      data: {
        labels: ["Low Risk", "Moderate Risk", "High Risk", "Very High Risk"],
        datasets: [
          {
            data: [45, 30, 20, 5],
            backgroundColor: ["#10b981", "#f59e0b", "#ef4444", "#dc2626"],
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
      },
    })
  }
}

// Map controls
function initializeMapControls() {
  // Zoom controls
  document.getElementById("zoomInBtn").addEventListener("click", () => {
    map.zoomIn()
  })

  document.getElementById("zoomOutBtn").addEventListener("click", () => {
    map.zoomOut()
  })

  // Home button
  document.getElementById("homeBtn").addEventListener("click", () => {
    map.setView([28.238, 83.9956], 6)
  })

  // Fullscreen button
  document.getElementById("fullscreenBtn").addEventListener("click", () => {
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      document.documentElement.requestFullscreen()
    }
  })
}

// Analysis tools
function initializeAnalysisTools() {
  // Measure distance
  document.getElementById("measureDistanceBtn").addEventListener("click", () => {
    // Implement distance measurement
    console.log("Measure distance tool activated")
  })

  // Measure area
  document.getElementById("measureAreaBtn").addEventListener("click", () => {
    // Implement area measurement
    console.log("Measure area tool activated")
  })

  // Export data
  document.getElementById("exportDataBtn").addEventListener("click", () => {
    // Implement data export
    console.log("Export data tool activated")
  })
}

// Download functionality
function initializeDownloads() {
  // Feature data downloads
  document.querySelectorAll(".download-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const format = e.target.closest(".download-btn").getAttribute("data-format")
      downloadFeatureData(format)
    })
  })

  // Report downloads
  document.querySelectorAll(".report-download-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const reportName = e.target.closest(".report-download-btn").getAttribute("data-report")
      downloadReport(reportName)
    })
  })
}

// Download feature data
function downloadFeatureData(format) {
  if (!selectedFeature) {
    alert("Please select a feature first")
    return
  }

  const filename = `feature_data.${format}`
  const url = `/downloads/reports/${filename}`

  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

// Download report
function downloadReport(reportName) {
  const url = `/downloads/reports/${reportName}`

  const link = document.createElement("a")
  link.href = url
  link.download = reportName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

// Sidebar toggle functionality
function initializeSidebarToggles() {
  const layersToggle = document.getElementById("layersToggle")
  const infoToggle = document.getElementById("infoToggle")
  const layersSidebar = document.getElementById("layersSidebar")
  const infoPanelSidebar = document.getElementById("infoPanelSidebar")

  layersToggle.addEventListener("click", () => {
    layersSidebar.classList.toggle("collapsed")
    const icon = layersToggle.querySelector("i")
    icon.className = layersSidebar.classList.contains("collapsed") ? "fas fa-chevron-right" : "fas fa-chevron-left"
  })

  infoToggle.addEventListener("click", () => {
    infoPanelSidebar.classList.toggle("collapsed")
    const icon = infoToggle.querySelector("i")
    icon.className = infoPanelSidebar.classList.contains("collapsed") ? "fas fa-chevron-left" : "fas fa-chevron-right"
  })
}

// Layer group toggle functionality
function initializeLayerGroupToggles() {
  document.querySelectorAll(".layer-group-header").forEach((header) => {
    header.addEventListener("click", () => {
      const content = header.nextElementSibling
      const icon = header.querySelector(".toggle-icon")

      content.style.display = content.style.display === "none" ? "block" : "none"
      icon.style.transform = content.style.display === "none" ? "rotate(-90deg)" : "rotate(0deg)"
    })
  })
}

// Search functionality
function initializeSearch() {
  const searchInput = document.getElementById("searchInput")

  searchInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      const query = searchInput.value.trim()
      if (query) {
        searchLocation(query)
      }
    }
  })
}

// Search for location
function searchLocation(query) {
  // Simple search implementation
  // In a real application, this would use a geocoding service
  console.log("Searching for:", query)

  // Example: search for specific lakes
  const lakeNames = {
    imja: [86.923, 27.896],
    "tsho rolpa": [86.47, 27.88],
    "rakshasa tal": [81.283, 30.883],
  }

  const coords = lakeNames[query.toLowerCase()]
  if (coords) {
    map.setView(coords, 12)
  } else {
    alert("Location not found")
  }
}

// Initialize everything when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  initializeMap()
  initializeLayerControls()
  initializeTabs()
  initializeMapControls()
  initializeAnalysisTools()
  initializeDownloads()
  initializeSidebarToggles()
  initializeLayerGroupToggles()
  initializeSearch()

  // Set default selected feature
  setTimeout(() => {
    const defaultFeature = {
      properties: {
        id: "GL-2024-001",
        name: "Rakshasa Tal",
        elevation: 4520,
        area_km2: 0.85,
        volume: 12.3,
        risk_level: "Moderate",
      },
    }
    selectFeature(defaultFeature, "Lake")
  }, 1000)
})
