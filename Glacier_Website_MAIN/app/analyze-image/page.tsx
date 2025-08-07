"use client"

import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, X, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import Image from 'next/image';
import { gsap } from 'gsap';

// --- Snowfall + Particle Background ---
const AnimatedBackground = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        let animationFrameId: number;

        // Snowflake particles
        let snowflakes = Array.from({ length: 100 }, () => ({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            radius: Math.random() * 2 + 1,
            speedY: Math.random() * 1 + 0.5,
            speedX: Math.random() * 0.5 - 0.25,
        }));

        const draw = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Draw snowflakes
            ctx.fillStyle = 'rgba(20, 2, 2, 0.9)';
            snowflakes.forEach(flake => {
                ctx.beginPath();
                ctx.arc(flake.x, flake.y, flake.radius, 0, Math.PI * 2);
                ctx.fill();

                flake.y += flake.speedY;
                flake.x += flake.speedX;

                if (flake.y > canvas.height) {
                    flake.y = 0;
                    flake.x = Math.random() * canvas.width;
                }
                if (flake.x < 0 || flake.x > canvas.width) {
                    flake.speedX *= -1;
                }
            });

            animationFrameId = requestAnimationFrame(draw);
        };

        draw();

        const handleResize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };

        window.addEventListener('resize', handleResize);

        return () => {
            cancelAnimationFrame(animationFrameId);
            window.removeEventListener('resize', handleResize);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            className="fixed top-0 left-0 w-full h-full -z-10 pointer-events-none"
        />
    );
};


// --- Main Component ---
export default function AnalyzeImagePage() {
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [analysisResult, setAnalysisResult] = useState<any | null>(null);
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const [lightboxImage, setLightboxImage] = useState<string | null>(null);

    // GSAP animations
    useEffect(() => {
        gsap.fromTo("#main-title", { y: -50, opacity: 0 }, { duration: 1, y: 0, opacity: 1 });
        gsap.fromTo("#subtitle", { y: -30, opacity: 0 }, { duration: 1, y: 0, opacity: 1, delay: 0.3 });
        gsap.fromTo("#upload-tool", { y: 50, opacity: 0 }, { duration: 1, y: 0, opacity: 1, delay: 0.6 });
    }, []);

    useEffect(() => {
        if (analysisResult) {
            gsap.fromTo("#results-section > *", { y: 50, opacity: 0 }, { duration: 0.8, y: 0, opacity: 1, stagger: 0.2 });
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
                processedImageUrl: 'https://placehold.co/600x400/3b82f6/ffffff?text=Processed+Image',
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
        <div className="min-h-screen relative text-slate-800 font-sans overflow-x-hidden">
            <AnimatedBackground />

            <header className="fixed top-0 left-0 w-full z-10 bg-opacity-80 backdrop-blur-md bg-white/80 shadow-md">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center h-20">
                        <Link href="/" className="flex items-center space-x-3">
                            <svg className="h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-4.243-4.243l3.275-3.275a4.5 4.5 0 00-6.336 4.486c.046.58.298 1.193.766 1.743m0 0l-6.837 5.63" /></svg>
                            <h1 className="text-2xl font-bold text-blue-800">GlacierWatch</h1>
                        </Link>
                        <nav className="hidden md:flex space-x-8 items-center">
                            <Link href="/" className="text-slate-600 hover:text-blue-600 transition-colors">Home</Link>
                            <Link href="/gis-map" className="text-slate-600 hover:text-blue-600 transition-colors">Interactive Map</Link>
                            <span className="font-semibold text-blue-600">GeoTIFF Analysis</span>
                        </nav>
                    </div>
                </div>
            </header>

            <main className="pt-32 pb-12">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

                    <div className="text-center mb-12">
                        <h2 id="main-title" className="text-4xl md:text-5xl font-extrabold tracking-tight text-blue-900 opacity-0">Analyze by GeoTIFF Upload</h2>
                        <p id="subtitle" className="mt-4 text-lg text-slate-500 opacity-0">A dedicated tool for experts to analyze their own satellite data.</p>
                    </div>

                    <div id="upload-tool" className="bg-white/60 backdrop-blur-md border border-blue-200/50 rounded-lg p-8 mb-12 max-w-2xl mx-auto opacity-0">
                        <div {...getRootProps()} className={`cursor-pointer border-2 border-dashed border-blue-400 rounded-lg p-8 text-center transition-colors ${isDragActive ? 'bg-blue-100' : 'hover:bg-blue-50'}`}>
                            <input {...getInputProps()} />
                            <Upload className="mx-auto h-12 w-12 text-slate-500" />
                            <p className="mt-4 text-slate-600">
                                {file ? `Selected: ${file.name}` : 'Click to upload or drag & drop a GeoTIFF file'}
                            </p>
                        </div>
                        <div className="mt-8 text-center">
                            <Button onClick={handleProcessImage} disabled={!file || isProcessing} className="bg-blue-600 text-white hover:bg-blue-700 font-bold py-3 px-8 rounded-md text-lg h-auto transition-transform hover:scale-105 disabled:bg-gray-400 disabled:scale-100">
                                {isProcessing ? 'Processing...' : 'Process Image'}
                            </Button>
                        </div>
                    </div>

                    {analysisResult && (
                        <div id="results-section" className="space-y-8">
                            <h3 className="text-3xl font-bold text-blue-900 mb-6 text-center">Analysis Results</h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                                <Card className="bg-white/60 backdrop-blur-md border border-blue-200/50">
                                    <CardHeader><CardTitle className="text-center text-blue-800">Original Image</CardTitle></CardHeader>
                                    <CardContent>
                                        <Image onClick={() => setLightboxImage(preview!)} width={600} height={400} src={preview || "https://placehold.co/600x400/e0e7ff/374151?text=Original+Image"} alt="Original uploaded" className="rounded-md w-full cursor-zoom-in transition-transform hover:scale-105" />
                                    </CardContent>
                                </Card>
                                <Card className="bg-white/60 backdrop-blur-md border border-blue-200/50">
                                    <CardHeader><CardTitle className="text-center text-blue-800">Processed Image (Masked)</CardTitle></CardHeader>
                                    <CardContent>
                                        <Image onClick={() => setLightboxImage(analysisResult.processedImageUrl)} width={600} height={400} src={analysisResult.processedImageUrl} alt="Processed lakes" className="rounded-md w-full cursor-zoom-in transition-transform hover:scale-105" />
                                    </CardContent>
                                </Card>
                            </div>

                            <Card className="bg-white/60 backdrop-blur-md border border-blue-200/50 p-6 max-w-md mx-auto">
                                <CardHeader><CardTitle className="text-center text-blue-800">Key Statistics</CardTitle></CardHeader>
                                <CardContent className="space-y-3 text-lg text-center text-slate-700">
                                    <p>Detected Lakes: <span className="font-bold text-blue-600">{analysisResult.lakeCount}</span></p>
                                    <p>Total Lake Area: <span className="font-bold text-blue-600">{analysisResult.totalArea.toFixed(2)} km²</span></p>
                                    <div className="pt-4 border-t border-blue-200">
                                        <button onClick={() => setIsDetailsOpen(!isDetailsOpen)} className="text-sm text-blue-600 hover:underline w-full flex justify-center items-center">
                                            View Individual Lake Areas {isDetailsOpen ? <ChevronUp className="ml-2" /> : <ChevronDown className="ml-2" />}
                                        </button>
                                        {isDetailsOpen && (
                                            <div className="text-left text-base mt-2 space-y-1">
                                                {analysisResult.individualLakes.map((lake: any) => (
                                                    <p key={lake.name} className="flex justify-between py-1 px-2 rounded-md hover:bg-blue-100/50">
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


// --- Lightbox Component ---
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
