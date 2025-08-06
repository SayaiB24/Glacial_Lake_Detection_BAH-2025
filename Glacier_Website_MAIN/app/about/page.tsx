"use client"

import Link from 'next/link';
import Image from 'next/image';
import { Users, Cpu, Satellite } from 'lucide-react';

// Main Page Component
export default function AboutPage() {
    return (
        <div className="min-h-screen bg-slate-50 text-slate-800 font-sans">
            {/* --- UPDATED HEADER --- */}
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
                                <Link href="/" className="text-gray-600 hover:text-gray-900">Home</Link>
                                <Link href="/gis-map" className="text-gray-600 hover:text-gray-900">Interactive Map</Link>
                                <Link href="/reports" className="text-gray-600 hover:text-gray-900">Reports</Link>
                                <Link href="/about" className="text-gray-900 font-medium">About</Link>
                            </nav>
                        </div>
                    </div>
                </div>
            </header>

            <main>
                <section className="relative bg-gradient-to-r from-blue-50 via-sky-100 to-cyan-100 pt-16 pb-16 px-8 overflow-hidden">
                    {/* SVG Pattern Background */}
                    <div className="absolute inset-0 w-full h-full z-0">
                        <svg className="w-full h-full" viewBox="0 0 1440 800" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
                            <defs>
                                <pattern id="dots" patternUnits="userSpaceOnUse" width="40" height="40" patternTransform="rotate(45)">
                                    <circle cx="10" cy="10" r="2" fill="#3B82F6" opacity="0.1" />
                                </pattern>
                            </defs>
                            <rect width="1440" height="800" fill="url(#dots)" />
                        </svg>
                    </div>

                    {/* Content Container */}
                    <div className="max-w-7xl mx-auto relative z-10 grid md:grid-cols-2 gap-12 items-center">
                        {/* Text Content */}
                        <div className="p-8 bg-white bg-opacity-80 rounded-xl shadow-lg backdrop-blur-lg hover:scale-[1.02] transform transition duration-300 ease-in-out">
                            <h2 className="text-4xl font-extrabold text-blue-900 mb-4">About GlacierWatch</h2>
                            <p className="text-slate-600 mb-6 text-lg">
                                We are dedicated to monitoring the Earth's cryosphere by leveraging cutting-edge AI and satellite technology. Our mission is to provide critical, real-time data on glacial lakes to mitigate risks and support climate research worldwide.
                            </p>
                            <div className="space-y-6">
                                {/* Card for each feature */}
                                <div className="flex items-center space-x-4 p-4 bg-gradient-to-tr from-blue-100 to-cyan-100 rounded-lg shadow-md hover:shadow-xl transition-shadow duration-300">
                                    <div className="p-3 bg-white rounded-full shadow-lg hover:scale-110 transform transition duration-300">
                                        <Cpu className="w-6 h-6 text-blue-600" />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-semibold text-slate-800">Advanced AI Models</h3>
                                        <p className="text-slate-500 text-sm">Our proprietary algorithms analyze satellite imagery to detect and map glacial lakes with high precision.</p>
                                    </div>
                                </div>

                                <div className="flex items-center space-x-4 p-4 bg-gradient-to-tr from-blue-100 to-cyan-100 rounded-lg shadow-md hover:shadow-xl transition-shadow duration-300">
                                    <div className="p-3 bg-white rounded-full shadow-lg hover:scale-110 transform transition duration-300">
                                        <Satellite className="w-6 h-6 text-cyan-600" />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-semibold text-slate-800">Continuous Monitoring</h3>
                                        <p className="text-slate-500 text-sm">We utilize the latest satellite data to provide timely risk alerts and track changes over time.</p>
                                    </div>
                                </div>

                                <div className="flex items-center space-x-4 p-4 bg-gradient-to-tr from-blue-100 to-cyan-100 rounded-lg shadow-md hover:shadow-xl transition-shadow duration-300">
                                    <div className="p-3 bg-white rounded-full shadow-lg hover:scale-110 transform transition duration-300">
                                        <Users className="w-6 h-6 text-blue-800" />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-semibold text-slate-800">Expert-Led Team</h3>
                                        <p className="text-slate-500 text-sm">Our work is driven by a passionate team of climatologists, AI engineers, and geospatial analysts.</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Image with Overlay & Hover Effect */}
                        <div className="relative p-4">
                            <div className="absolute inset-0 bg-gradient-to-br from-cyan-400 to-blue-600 rounded-xl shadow-lg transform hover:scale-105 transition-transform duration-300"></div>
                            <Image 
                                src="/assets/homepage3.jpg" // Replace with a high-quality image of a glacier or lake
                                alt="Glacial landscape" 
                                width={800}
                                height={600}
                                className="relative rounded-xl shadow-xl object-cover w-full h-full hover:opacity-90 transition-opacity duration-300" 
                            />
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
}