"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Search, TrendingUp, AlertTriangle, BarChart3, FileText, Database, BookOpen, Code } from "lucide-react"
import Link from "next/link"
import Image from "next/image"

export default function HomePage() {
  const [lakesCount, setLakesCount] = useState(0)
  const [coverage, setCoverage] = useState(0)
  const [criticalZones, setCriticalZones] = useState(0)
  
  const [searchQuery, setSearchQuery] = useState("")
  const router = useRouter()

  useEffect(() => {
    const animateCounter = (setter: (value: number) => void, target: number, duration: number) => {
      let start = 0
      const increment = target / (duration / 16)
      const timer = setInterval(() => {
        start += increment
        if (start >= target) {
          setter(target)
          clearInterval(timer)
        } else {
          setter(Math.floor(start))
        }
      }, 16)
    }
    
    animateCounter(setLakesCount, 2500, 2000)
    animateCounter(setCoverage, 85000, 2000)
    animateCounter(setCriticalZones, 150, 2000)

  }, [])

  const handleSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchQuery.trim() !== '') {
      router.push(`/gis-map?query=${encodeURIComponent(searchQuery.trim())}`)
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-8">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">❄</span>
                </div>
                <span className="text-xl font-bold text-gray-900">GlacierWatch</span>
              </div>
              <nav className="hidden md:flex space-x-8">
                <Link href="/" className="text-gray-900 font-medium">Home</Link>
                <Link href="/gis-map" className="text-gray-600 hover:text-gray-900">Interactive Map</Link>
                <Link href="/reports" className="text-gray-600 hover:text-gray-900">Reports</Link>
                <Link href="/data" className="text-gray-600 hover:text-gray-900">Data</Link>
                <Link href="/about" className="text-gray-600 hover:text-gray-900">About</Link>
              </nav>
              <Button>Sign In</Button>
            </div>
          </div>
        </div>
      </header>

      <section className="relative h-[45rem] bg-gradient-to-r from-blue-900 to-purple-900 overflow-hidden">
        <div className="absolute inset-0">
          <Image
            src="/assets/homepage3.jpg"
            alt="Mountain landscape"
            width={1920}
            height={1080}
            className="w-full h-full object-cover opacity-60"
          />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full flex items-center justify-center">
            <div className="text-white max-w-4xl text-center">
                <h1 className="text-4xl md:text-5xl font-bold mb-4">Monitor Glacial Lakes in Real-Time</h1>
                <p className="text-xl mb-8 text-blue-100">
                  Advanced geospatial analysis for critical environmental monitoring
                </p>
                <Link href="/gis-map">
                  <Button size="lg" className="bg-orange-500 hover:bg-orange-600 text-white">
                    Explore Interactive Map →
                  </Button>
                </Link>

                <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-8">
                    <Card className="bg-white/90 backdrop-blur-sm rounded-lg shadow-xl">
                        <CardContent className="p-6 text-center">
                            <div className="text-4xl font-bold text-blue-600 mb-2">{lakesCount.toLocaleString()}+</div>
                            <div className="text-gray-600 font-medium">Lakes Monitored</div>
                        </CardContent>
                    </Card>
                    <Card className="bg-white/90 backdrop-blur-sm rounded-lg shadow-xl">
                        <CardContent className="p-6 text-center">
                            <div className="text-4xl font-bold text-blue-600 mb-2">{coverage.toLocaleString()}</div>
                            <div className="text-gray-600 font-medium">km² Coverage</div>
                        </CardContent>
                    </Card>
                    <Card className="bg-white/90 backdrop-blur-sm rounded-lg shadow-xl">
                        <CardContent className="p-6 text-center">
                            <div className="text-4xl font-bold text-blue-600 mb-2">{criticalZones}+</div>
                            <div className="text-gray-600 font-medium">Critical Zones</div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center mb-12 text-gray-900">Major River Basins</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { name: "Indus Basin", image: "/assets/Indus_River_basin_map.svg", lakes: 5335, area: "45,000 km²", lat: 34.5, lng: 74.0, zoom: 7 },
              { name: "Ganga Basin", image: "/assets/ganga.jpg", lakes: 4707, area: "32,000 km²", lat: 27.5, lng: 85.3, zoom: 7 },
              { name: "Brahmaputra Basin", image: "/assets/bhramaputra.png", lakes: 18001, area: "28,000 km²", lat: 27.5, lng: 90.5, zoom: 7 },
            ].map((basin, index) => (
              <Card key={index} className="overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 ease-in-out hover:-translate-y-2 hover:scale-105">
                <div className="relative h-48">
                  <Image src={basin.image || "/placeholder.svg"} alt={basin.name} fill className="object-cover" />
                  <div className="absolute inset-0 bg-black bg-opacity-30 flex items-end">
                    <div className="p-4 text-white">
                      <h3 className="text-xl font-bold">{basin.name}</h3>
                    </div>
                  </div>
                </div>
                <CardContent className="p-6">
                  <div className="flex justify-between mb-4">
                    <div>
                      <div className="text-sm text-gray-600">Lakes</div>
                      <div className="text-2xl font-bold text-blue-600">{basin.lakes}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">Area</div>
                      <div className="text-2xl font-bold text-blue-600">{basin.area}</div>
                    </div>
                  </div>
                  <Link href={`/gis-map?lat=${basin.lat}&lng=${basin.lng}&zoom=${basin.zoom}`}>
                    <Button className="w-full bg-green-600 hover:bg-green-700">View on Map</Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center mb-12 text-gray-900">Key Features</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { icon: TrendingUp, title: "Real-time Monitoring", description: "Continuous tracking of glacial lake changes and movements" },
              { icon: AlertTriangle, title: "Risk Assessment", description: "Advanced analysis of potential flood risks and hazards" },
              { icon: BarChart3, title: "Data Analysis", description: "Comprehensive tools for data visualization and interpretation" },
              { icon: FileText, title: "Report Generation", description: "Automated generation of detailed analysis reports" },
            ].map((feature, index) => (
              <Card key={index} className="text-center p-6 hover:shadow-lg transition-shadow">
                <CardContent className="p-0">
                  <feature.icon className="w-12 h-12 text-blue-600 mx-auto mb-4" />
                  <h3 className="text-xl font-bold mb-2 text-gray-900">{feature.title}</h3>
                  <p className="text-gray-600">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-bold mb-6 text-gray-900">Advanced Data Visualization</h2>
              <p className="text-lg text-gray-600 mb-8">
                Access comprehensive data visualization tools and interactive maps for detailed analysis of glacial lake systems.
              </p>
              <div className="space-y-4 mb-8">
                <div className="flex items-center space-x-3"><div className="w-2 h-2 bg-blue-600 rounded-full"></div><span className="text-gray-700">Multiple Layers</span></div>
                <div className="flex items-center space-x-3"><div className="w-2 h-2 bg-blue-600 rounded-full"></div><span className="text-gray-700">Data Export</span></div>
                <div className="flex items-center space-x-3"><div className="w-2 h-2 bg-blue-600 rounded-full"></div><span className="text-gray-700">Trend Analysis</span></div>
                <div className="flex items-center space-x-3"><div className="w-2 h-2 bg-blue-600 rounded-full"></div><span className="text-gray-700">Reports</span></div>
              </div>
              <Button className="bg-blue-600 hover:bg-blue-700">Try Interactive Tools</Button>
            </div>
            <div className="relative">
              <Image src="/assets/advanced_visualize.jpg" alt="GIS Interface" width={600} height={400} className="rounded-lg shadow-xl" />
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center mb-12 text-gray-900">Resources</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { icon: FileText, title: "Reports", description: "Download detailed analysis reports", link: "/reports" },
              { icon: Database, title: "Datasets", description: "Access raw geospatial data", link: "/data" },
              { icon: BookOpen, title: "Documentation", description: "Technical documentation and guides", link: "/docs" },
              { icon: Code, title: "API Access", description: "Programmatic data access", link: "/api-docs" },
            ].map((resource, index) => (
              <Card key={index} className="text-center p-6 hover:shadow-lg transition-shadow">
                <CardContent className="p-0">
                  <resource.icon className="w-12 h-12 text-blue-600 mx-auto mb-4" />
                  <h3 className="text-xl font-bold mb-2 text-gray-900">{resource.title}</h3>
                  <p className="text-gray-600 mb-4">{resource.description}</p>
                  <Link href={resource.link}><Button variant="outline" size="sm">Learn More →</Button></Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <h3 className="text-lg font-bold mb-4">About GlacierWatch</h3>
              <p className="text-gray-400">Advanced monitoring system for glacial lake analysis and risk assessment.</p>
            </div>
            <div>
              <h3 className="text-lg font-bold mb-4">Quick Links</h3>
              <ul className="space-y-2 text-gray-400">
                <li><Link href="/gis-map" className="hover:text-white">Interactive Map</Link></li>
                <li><Link href="/data" className="hover:text-white">Data Analysis</Link></li>
                <li><Link href="/reports" className="hover:text-white">Reports</Link></li>
                <li><Link href="/docs" className="hover:text-white">Documentation</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="text-lg font-bold mb-4">Resources</h3>
              <ul className="space-y-2 text-gray-400">
                <li><Link href="/api" className="hover:text-white">API Documentation</Link></li>
                <li><Link href="/downloads" className="hover:text-white">Download Data</Link></li>
                <li><Link href="/case-studies" className="hover:text-white">Case Studies</Link></li>
                <li><Link href="/support" className="hover:text-white">Support</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="text-lg font-bold mb-4">Newsletter</h3>
              <p className="text-gray-400 mb-4">Subscribe to our newsletter for updates</p>
              <div className="flex">
                <Input placeholder="Enter your email" className="bg-gray-800 border-gray-700 text-white" />
                <Button className="ml-2 bg-blue-600 hover:bg-blue-700">→</Button>
              </div>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-400">
            <p>© 2024 GlacierWatch. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}