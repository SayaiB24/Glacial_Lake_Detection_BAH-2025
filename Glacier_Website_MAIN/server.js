const express = require("express")
const path = require("path")
const cors = require("cors")
const fs = require("fs")

const app = express()
const PORT = process.env.PORT || 3000

// Middleware
app.use(cors())
app.use(express.json())
app.use(express.static("public"))

// Serve static files from public directory
app.use(express.static(path.join(__dirname, "public")))

// API Routes for GeoJSON data
app.get("/api/data/lakes", (req, res) => {
  try {
    const lakesData = fs.readFileSync(path.join(__dirname, "data", "lakes.geojson"), "utf8")
    res.json(JSON.parse(lakesData))
  } catch (error) {
    console.error("Error reading lakes data:", error)
    res.status(500).json({ error: "Failed to load lakes data" })
  }
})

app.get("/api/data/rivers", (req, res) => {
  try {
    const riversData = fs.readFileSync(path.join(__dirname, "data", "rivers.geojson"), "utf8")
    res.json(JSON.parse(riversData))
  } catch (error) {
    console.error("Error reading rivers data:", error)
    res.status(500).json({ error: "Failed to load rivers data" })
  }
})

app.get("/api/data/glaciers", (req, res) => {
  try {
    const glaciersData = fs.readFileSync(path.join(__dirname, "data", "glaciers.geojson"), "utf8")
    res.json(JSON.parse(glaciersData))
  } catch (error) {
    console.error("Error reading glaciers data:", error)
    res.status(500).json({ error: "Failed to load glaciers data" })
  }
})

app.get("/api/data/watersheds", (req, res) => {
  try {
    const watershedsData = fs.readFileSync(path.join(__dirname, "data", "watersheds.geojson"), "utf8")
    res.json(JSON.parse(watershedsData))
  } catch (error) {
    console.error("Error reading watersheds data:", error)
    res.status(500).json({ error: "Failed to load watersheds data" })
  }
})

// Download routes for reports
app.get("/downloads/reports/:filename", (req, res) => {
  const filename = req.params.filename
  const filePath = path.join(__dirname, "reports", filename)

  if (fs.existsSync(filePath)) {
    res.download(filePath)
  } else {
    // Generate a sample PDF for demo purposes
    res.setHeader("Content-Type", "application/pdf")
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`)
    res.send(generateSamplePDF(filename))
  }
})

// Generate sample PDF content
function generateSamplePDF(filename) {
  const pdfContent = `%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj

2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj

3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 4 0 R
>>
endobj

4 0 obj
<<
/Length 100
>>
stream
BT
/F1 12 Tf
72 720 Td
(GlacierWatch Report: ${filename}) Tj
0 -20 Td
(Generated on ${new Date().toISOString()}) Tj
ET
endstream
endobj

xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000206 00000 n 
trailer
<<
/Size 5
/Root 1 0 R
>>
startxref
350
%%EOF`

  return Buffer.from(pdfContent)
}

// Routes
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"))
})

app.get("/map", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "map.html"))
})

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
