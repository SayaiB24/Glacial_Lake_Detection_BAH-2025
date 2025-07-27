"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Search, Download, Calendar, FileText, Filter } from "lucide-react"
import Link from "next/link"

const reports = [
  {
    id: 1,
    title: "Himalayan Glacial Lake Inventory 2024",
    description:
      "Comprehensive analysis of glacial lakes across the Himalayan region with risk assessment and monitoring recommendations.",
    date: "2024-01-15",
    type: "Annual Report",
    size: "15.2 MB",
    downloads: 1250,
    tags: ["Himalaya", "Risk Assessment", "Annual"],
  },
  {
    id: 2,
    title: "Imja Lake Monitoring Report",
    description:
      "Detailed monitoring report of Imja Lake including bathymetry, volume changes, and flood risk analysis.",
    date: "2024-01-10",
    type: "Lake Report",
    size: "8.7 MB",
    downloads: 890,
    tags: ["Imja Lake", "Monitoring", "High Risk"],
  },
  {
    id: 3,
    title: "Climate Change Impact on Glacial Lakes",
    description:
      "Analysis of climate change effects on glacial lake formation and expansion in the Hindu Kush Himalaya.",
    date: "2023-12-20",
    type: "Research Paper",
    size: "12.4 MB",
    downloads: 2100,
    tags: ["Climate Change", "Research", "HKH"],
  },
  {
    id: 4,
    title: "Tsho Rolpa Emergency Assessment",
    description:
      "Emergency assessment report following recent expansion of Tsho Rolpa glacial lake with immediate recommendations.",
    date: "2023-12-15",
    type: "Emergency Report",
    size: "6.3 MB",
    downloads: 1560,
    tags: ["Tsho Rolpa", "Emergency", "Very High Risk"],
  },
  {
    id: 5,
    title: "Koshi Basin Glacial Lake Survey",
    description:
      "Comprehensive survey of all glacial lakes in the Koshi river basin with detailed risk categorization.",
    date: "2023-11-30",
    type: "Basin Report",
    size: "22.1 MB",
    downloads: 780,
    tags: ["Koshi Basin", "Survey", "Comprehensive"],
  },
  {
    id: 6,
    title: "Remote Sensing Methodology Guide",
    description:
      "Technical guide for using satellite imagery and remote sensing techniques for glacial lake monitoring.",
    date: "2023-11-15",
    type: "Technical Guide",
    size: "18.9 MB",
    downloads: 1890,
    tags: ["Remote Sensing", "Methodology", "Technical"],
  },
]

export default function ReportsPage() {
  const handleDownload = async (reportId: number, title: string) => {
    try {
      const response = await fetch(`/api/downloads/reports/${reportId}`)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.style.display = "none"
      a.href = url
      a.download = `${title.replace(/\s+/g, "_")}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error("Download failed:", error)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
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
                <Link href="/gis-map" className="text-gray-600 hover:text-gray-900">
                  Interactive Map
                </Link>
                <Link href="/reports" className="text-gray-900 font-medium">
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
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Reports & Publications</h1>
          <p className="text-lg text-gray-600">
            Access comprehensive reports, research papers, and technical documentation on glacial lake monitoring and
            analysis.
          </p>
        </div>

        {/* Search and Filter */}
        <div className="mb-8 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input placeholder="Search reports..." className="pl-10" />
          </div>
          <Button variant="outline" className="flex items-center space-x-2 bg-transparent">
            <Filter className="w-4 h-4" />
            <span>Filter</span>
          </Button>
        </div>

        {/* Reports Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {reports.map((report) => (
            <Card key={report.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <CardTitle className="text-xl mb-2">{report.title}</CardTitle>
                  <Badge variant="secondary">{report.type}</Badge>
                </div>
                <p className="text-gray-600">{report.description}</p>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center space-x-4 text-sm text-gray-500">
                    <div className="flex items-center space-x-1">
                      <Calendar className="w-4 h-4" />
                      <span>{new Date(report.date).toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <FileText className="w-4 h-4" />
                      <span>{report.size}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Download className="w-4 h-4" />
                      <span>{report.downloads.toLocaleString()} downloads</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {report.tags.map((tag, index) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>

                  <Button onClick={() => handleDownload(report.id, report.title)} className="w-full">
                    <Download className="w-4 h-4 mr-2" />
                    Download Report
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Statistics */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card className="text-center p-6">
            <CardContent className="p-0">
              <div className="text-3xl font-bold text-blue-600 mb-2">156</div>
              <div className="text-gray-600">Total Reports</div>
            </CardContent>
          </Card>
          <Card className="text-center p-6">
            <CardContent className="p-0">
              <div className="text-3xl font-bold text-blue-600 mb-2">45,000+</div>
              <div className="text-gray-600">Downloads</div>
            </CardContent>
          </Card>
          <Card className="text-center p-6">
            <CardContent className="p-0">
              <div className="text-3xl font-bold text-blue-600 mb-2">12</div>
              <div className="text-gray-600">Research Papers</div>
            </CardContent>
          </Card>
          <Card className="text-center p-6">
            <CardContent className="p-0">
              <div className="text-3xl font-bold text-blue-600 mb-2">24</div>
              <div className="text-gray-600">Technical Guides</div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
