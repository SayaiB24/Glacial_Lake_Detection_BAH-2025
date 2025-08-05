"use client"

import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, X, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import Image from 'next/image';
import { gsap } from 'gsap'; // Import GSAP

// Main Page Component
export default function AnalyzeImagePage() {
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [analysisResult, setAnalysisResult] = useState<any | null>(null);
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const [lightboxImage, setLightboxImage] = useState<string | null>(null);

    // --- GSAP ANIMATIONS ---
    useEffect(() => {
        gsap.fromTo("#main-title", { y: -50, opacity: 0 }, { duration: 1, y: 0, opacity: 1, ease: 'power3.out' });
        gsap.fromTo("#subtitle", { y: -30, opacity: 0 }, { duration: 1, y: 0, opacity: 1, delay: 0.3, ease: 'power3.out' });
        gsap.fromTo("#upload-tool", { y: 50, opacity: 0 }, { duration: 1, y: 0, opacity: 1, delay: 0.6, ease: 'power3.out' });
    }, []);

    // Animation for results section when it appears
    useEffect(() => {
        if (analysisResult) {
            gsap.fromTo("#results-section", { y: 50, opacity: 0 }, { duration: 0.8, y: 0, opacity: 1, ease: 'power3.out', stagger: 0.2 });
        }
    }, [analysisResult]);


    const onDrop = useCallback((acceptedFiles: File[]) => {
        if (acceptedFiles.length > 0) {
            const selectedFile = acceptedFiles[0];
            setFile(selectedFile);
            const reader = new FileReader();
            reader.onloadend = () => {
                setPreview(reader.result as string);
            };
            reader.readAsDataURL(selectedFile);
        }
    }, []);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'image/tiff': ['.tif', '.tiff'] },
        multiple: false,
    });

    const handleProcessImage = () => {
        if (!file) {
            alert('Please upload a GeoTIFF file first.');
            return;
        }
        setIsProcessing(true);
        setTimeout(() => {
            setAnalysisResult({
                processedImageUrl: 'https://placehold.co/600x400/1e293b/64ffda?text=Processed+Image',
                lakeCount: 3,
                totalArea: 2.14,
                individualLakes: [
                    { name: 'Lake 1', area: 0.89 },
                    { name: 'Lake 2', area: 0.75 },
                    { name: 'Lake 3', area: 0.50 }
                ]
            });
            setIsProcessing(false);
        }, 2000);
    };

    return (
        <div className="min-h-screen bg-[#0a192f] text-[#ccd6f6] font-sans">
            {/* AnimatedBackground component removed */}

            <header className="fixed top-0 left-0 w-full z-10 bg-opacity-80 backdrop-blur-md bg-[#0a192f] shadow-lg">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center h-20">
                        <Link href="/" className="flex items-center space-x-3">
                            <svg className="h-8 w-8 text-[#64ffda]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-4.243-4.243l3.275-3.275a4.5 4.5 0 00-6.336 4.486c.046.58.298 1.193.766 1.743m0 0l-6.837 5.63" /></svg>
                            <h1 className="text-2xl font-bold text-white">GlacierWatch</h1>
                        </Link>
                         <nav className="hidden md:flex space-x-8 items-center">
                           <Link href="/" className="text-gray-300 hover:text-[#64ffda] transition-colors">Home</Link>
                           <Link href="/gis-map" className="text-gray-300 hover:text-[#64ffda] transition-colors">Interactive Map</Link>
                           <span className="font-semibold text-[#64ffda]">GeoTIFF Analysis</span>
                         </nav>
                    </div>
                </div>
            </header>

            <main className="pt-32 pb-12">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    
                    <div className="text-center mb-12">
                        <h2 id="main-title" className="text-4xl md:text-5xl font-extrabold tracking-tight text-white opacity-0">Analyze by GeoTIFF Upload</h2>
                        <p id="subtitle" className="mt-4 text-lg text-gray-400 opacity-0">A dedicated tool for experts to analyze their own satellite data.</p>
                    </div>

                    <div id="upload-tool" className="glass-container rounded-lg p-8 mb-12 max-w-2xl mx-auto opacity-0">
                        <div {...getRootProps()} className={`cursor-pointer border-2 border-dashed border-[#1e3a8a] rounded-lg p-8 text-center transition-colors ${isDragActive ? 'bg-[#1e3a8a]/50' : 'hover:bg-[#1e3a8a]/30'}`}>
                            <input {...getInputProps()} />
                            <Upload className="mx-auto h-12 w-12 text-[#64ffda]" />
                            <p className="mt-4 text-[#94a3b8]">
                                {file ? `Selected: ${file.name}` : 'Click to upload or drag & drop a GeoTIFF file'}
                            </p>
                        </div>
                        <div className="mt-8 text-center">
                            <Button onClick={handleProcessImage} disabled={!file || isProcessing} className="bg-[#64ffda] text-[#0a192f] hover:bg-[#a7ffde] font-bold py-3 px-8 rounded-md text-lg h-auto transition-transform hover:scale-105 disabled:bg-gray-500 disabled:scale-100">
                                {isProcessing ? 'Processing...' : 'Process Image'}
                            </Button>
                        </div>
                    </div>

                    {analysisResult && (
                        <div id="results-section">
                            <h3 className="text-3xl font-bold text-white mb-6 text-center">Analysis Results</h3>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                                <Card className="glass-container">
                                    <CardHeader><CardTitle className="text-center text-white">Original Image</CardTitle></CardHeader>
                                    <CardContent>
                                        <Image onClick={() => setLightboxImage(preview)} width={600} height={400} src={preview || "https://placehold.co/600x400/1e293b/ffffff?text=Original+Image"} alt="Original uploaded" className="rounded-md w-full cursor-zoom-in transition-transform hover:scale-102" />
                                    </CardContent>
                                </Card>
                                 <Card className="glass-container">
                                    <CardHeader><CardTitle className="text-center text-white">Processed Image (Masked)</CardTitle></CardHeader>
                                    <CardContent>
                                         <Image onClick={() => setLightboxImage(analysisResult.processedImageUrl)} width={600} height={400} src={analysisResult.processedImageUrl} alt="Processed lakes" className="rounded-md w-full cursor-zoom-in transition-transform hover:scale-102" />
                                    </CardContent>
                                </Card>
                            </div>

                            <Card className="glass-container p-6 max-w-md mx-auto">
                                <CardHeader><CardTitle className="text-center text-white">Key Statistics</CardTitle></CardHeader>
                                <CardContent className="space-y-3 text-lg text-center">
                                    <p>Detected Lakes: <span className="font-bold text-[#64ffda]">{analysisResult.lakeCount}</span></p>
                                    <p>Total Lake Area: <span className="font-bold text-[#64ffda]">{analysisResult.totalArea} km²</span></p>
                                    
                                    <div className="pt-4 border-t border-white/10">
                                        <button onClick={() => setIsDetailsOpen(!isDetailsOpen)} className="text-sm text-[#64ffda] hover:underline focus:outline-none w-full flex justify-center items-center">
                                            View Individual Lake Areas {isDetailsOpen ? <ChevronUp className="ml-2"/> : <ChevronDown className="ml-2"/>}
                                        </button>
                                        {isDetailsOpen && (
                                            <div className="text-left text-base mt-2 space-y-1">
                                                {analysisResult.individualLakes.map((lake: any) => (
                                                    <p key={lake.name} className="flex justify-between py-1 px-2 rounded-md hover:bg-white/5">
                                                        <span>{lake.name}:</span>
                                                        <span className="font-semibold">{lake.area.toFixed(2)} km²</span>
                                                    </p>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    )}
                </div>
            </main>

            {lightboxImage && <Lightbox src={lightboxImage} onClose={() => setLightboxImage(null)} />}
        </div>
    );
}


// A simple lightbox component for zooming images
const Lightbox = ({ src, onClose }: { src: string, onClose: () => void }) => {
    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center" onClick={onClose}>
            <div className="absolute top-4 right-4 flex gap-4">
                <Button onClick={onClose} variant="outline" size="icon" className="bg-black/50 border-white/50 hover:bg-black/70"><X /></Button>
            </div>
            <div className="relative w-full h-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                <Image
                    src={src}
                    alt="Zoomed preview"
                    width={1200}
                    height={800}
                    className="max-w-[95vw] max-h-[95vh] object-contain"
                />
            </div>
        </div>
    );
}

// Custom styles like 'glass-container' would need to be defined in your globals.css
// e.g., in globals.css:
// .glass-container {
//     background: rgba(23, 42, 77, 0.6);
//     backdrop-filter: blur(10px);
//     border: 1px solid rgba(255, 255, 255, 0.1);
// }