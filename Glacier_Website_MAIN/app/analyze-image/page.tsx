"use client"

import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, X, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { gsap } from 'gsap';

// Leaflet touches `window` at import time, so it must not be server-rendered.
const MaskMap = dynamic(() => import('@/components/MaskMap'), {
    ssr: false,
    loading: () => <div className="w-full h-[28rem] rounded-md border grid place-items-center text-slate-500">Loading map…</div>,
});

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
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [threshold, setThreshold] = useState(0.5);
    const [mcPasses, setMcPasses] = useState(0);
    const [method, setMethod] = useState<'indices' | 'model'>('indices');
    const [ndwiThreshold, setNdwiThreshold] = useState(0.15);
    const [minElevation, setMinElevation] = useState(3500);
    const [serviceStatus, setServiceStatus] = useState<'checking' | 'ready' | 'down'>('checking');

    // Surface up-front whether the Python model service is reachable, rather
    // than only failing once the user has uploaded a large scene.
    useEffect(() => {
        let cancelled = false;
        fetch('/api/segment')
            .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
            .then(({ ok, body }) => {
                if (!cancelled) setServiceStatus(ok && body?.status === 'ready' ? 'ready' : 'down');
            })
            .catch(() => {
                if (!cancelled) setServiceStatus('down');
            });
        return () => { cancelled = true; };
    }, []);

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

    const handleProcessImage = async () => {
        if (!file) {
            setErrorMessage('Please upload an 8-band GeoTIFF first.');
            return;
        }
        setIsProcessing(true);
        setErrorMessage(null);
        setAnalysisResult(null);
        setStatusMessage('Uploading scene and running the segmentation model…');

        try {
            const form = new FormData();
            form.append('file', file);
            form.append('method', method);
            form.append('threshold', String(threshold));
            form.append('mc_passes', String(mcPasses));
            form.append('ndwi_threshold', String(ndwiThreshold));
            form.append('min_elevation_m', String(minElevation));

            const response = await fetch('/api/segment', { method: 'POST', body: form });
            const payload = await response.json();

            if (!response.ok) {
                const detail = [payload?.details, payload?.hint].filter(Boolean).join(' — ');
                throw new Error(`${payload?.error ?? payload?.detail ?? `HTTP ${response.status}`}${detail ? ` (${detail})` : ''}`);
            }

            setAnalysisResult(payload);
            setStatusMessage(null);
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Segmentation failed.');
            setStatusMessage(null);
        } finally {
            setIsProcessing(false);
        }
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
                        <p className="mt-3 text-xs text-center text-slate-500">
                            Expects an 8-band stack: 4 LISS-3 optical bands, DEM, slope, aspect, NDWI.
                        </p>

                        <div className="mt-6">
                            <span className="text-sm text-slate-600 font-medium">Detection method</span>
                            <div className="mt-2 grid grid-cols-2 gap-3">
                                <button type="button" onClick={() => setMethod('indices')}
                                    className={`rounded-md border p-3 text-left transition-colors ${method === 'indices' ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:bg-slate-50'}`}>
                                    <div className="font-semibold text-sm text-slate-800">Spectral indices</div>
                                    <div className="text-xs text-slate-500 mt-1">NDWI, MNDWI and AWEI with terrain filters. Works on any supported stack.</div>
                                </button>
                                <button type="button" onClick={() => setMethod('model')}
                                    className={`rounded-md border p-3 text-left transition-colors ${method === 'model' ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:bg-slate-50'}`}>
                                    <div className="font-semibold text-sm text-slate-800">Hybrid model</div>
                                    <div className="text-xs text-slate-500 mt-1">GLNet + Attention U-Net. Needs a stack with DEM, slope and aspect.</div>
                                </button>
                            </div>
                        </div>

                        {method === 'indices' ? (
                            <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                                <label className="block">
                                    <span className="text-slate-600">NDWI threshold: <span className="font-mono">{ndwiThreshold.toFixed(2)}</span></span>
                                    <input type="range" min={0.0} max={0.5} step={0.05} value={ndwiThreshold}
                                        onChange={(e) => setNdwiThreshold(parseFloat(e.target.value))} className="w-full mt-1" />
                                </label>
                                <label className="block">
                                    <span className="text-slate-600">Min elevation: <span className="font-mono">{minElevation === 0 ? 'off' : `${minElevation} m`}</span></span>
                                    <input type="range" min={0} max={5000} step={250} value={minElevation}
                                        onChange={(e) => setMinElevation(parseInt(e.target.value, 10))} className="w-full mt-1" />
                                    <span className="text-[10px] text-slate-400">Excludes valley water; needs a DEM band.</span>
                                </label>
                            </div>
                        ) : (
                            <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                                <label className="block">
                                    <span className="text-slate-600">Threshold: <span className="font-mono">{threshold.toFixed(2)}</span></span>
                                    <input type="range" min={0.05} max={0.95} step={0.05} value={threshold}
                                        onChange={(e) => setThreshold(parseFloat(e.target.value))} className="w-full mt-1" />
                                </label>
                                <label className="block">
                                    <span className="text-slate-600">Uncertainty passes: <span className="font-mono">{mcPasses === 0 ? 'off' : mcPasses}</span></span>
                                    <input type="range" min={0} max={30} step={2} value={mcPasses}
                                        onChange={(e) => setMcPasses(parseInt(e.target.value, 10))} className="w-full mt-1" />
                                </label>
                            </div>
                        )}

                        {serviceStatus === 'down' && (
                            <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                                <strong>Model service is not running.</strong> Start it with:
                                <code className="block mt-1 font-mono text-xs bg-amber-100 px-2 py-1 rounded">
                                    .venv\Scripts\python.exe -m uvicorn serve:app --app-dir src --port 8000
                                </code>
                            </div>
                        )}

                        <div className="mt-6 text-center">
                            <Button onClick={handleProcessImage} disabled={!file || isProcessing} className="bg-blue-600 text-white hover:bg-blue-700 font-bold py-3 px-8 rounded-md text-lg h-auto transition-transform hover:scale-105 disabled:bg-gray-400 disabled:scale-100">
                                {isProcessing ? 'Processing…' : 'Detect Glacial Lakes'}
                            </Button>
                        </div>

                        {statusMessage && <p className="mt-4 text-center text-sm text-slate-600">{statusMessage}</p>}
                        {errorMessage && (
                            <div className="mt-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
                                {errorMessage}
                            </div>
                        )}
                    </div>

                    {analysisResult && (
                        <div id="results-section" className="space-y-8">
                            <h3 className="text-3xl font-bold text-blue-900 mb-6 text-center">Analysis Results</h3>

                            <Card className="bg-white/60 backdrop-blur-md border border-blue-200/50">
                                <CardHeader><CardTitle className="text-center text-blue-800">Detected Lake Masks</CardTitle></CardHeader>
                                <CardContent>
                                    <MaskMap
                                        polygons={analysisResult.polygons}
                                        bounds={analysisResult.stats?.bounds}
                                        className="w-full h-[28rem] rounded-md border"
                                    />
                                    <p className="mt-2 text-xs text-slate-500 text-center">
                                        Polygons are model output, georeferenced to the uploaded scene. Click one for its area.
                                    </p>
                                </CardContent>
                            </Card>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {[
                                    { label: 'Lakes detected', value: analysisResult.stats.lakeCount },
                                    { label: 'Total area', value: `${analysisResult.stats.totalAreaHa.toFixed(2)} ha` },
                                    { label: 'Scene coverage', value: `${analysisResult.stats.coveragePercent.toFixed(2)}%` },
                                    { label: 'Processing time', value: `${analysisResult.stats.processingSeconds.toFixed(1)} s` },
                                ].map((s) => (
                                    <Card key={s.label} className="bg-white/60 backdrop-blur-md border border-blue-200/50">
                                        <CardContent className="p-4 text-center">
                                            <div className="text-2xl font-bold text-blue-700">{s.value}</div>
                                            <div className="text-xs text-slate-500 mt-1">{s.label}</div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>

                            <Card className="bg-white/60 backdrop-blur-md border border-blue-200/50 p-6 max-w-2xl mx-auto">
                                <CardHeader><CardTitle className="text-center text-blue-800">Run Details</CardTitle></CardHeader>
                                <CardContent className="text-sm text-slate-700">
                                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-xs">
                                        <div className="flex justify-between"><span>Method</span><span>{analysisResult.stats.method}</span></div>
                                        <div className="flex justify-between"><span>Band layout</span><span>{analysisResult.stats.bandLayout}</span></div>
                                        <div className="flex justify-between"><span>Raster</span><span>{analysisResult.stats.rasterSize?.join(' × ')}</span></div>
                                        <div className="flex justify-between"><span>CRS</span><span>{analysisResult.stats.crs ?? 'none'}</span></div>
                                        <div className="flex justify-between"><span>Threshold</span><span>{analysisResult.stats.threshold}</span></div>
                                        <div className="flex justify-between"><span>Device</span><span>{analysisResult.stats.device}</span></div>
                                        <div className="flex justify-between"><span>Lake pixels</span><span>{analysisResult.stats.lakePixels?.toLocaleString()}</span></div>
                                        <div className="flex justify-between"><span>MC passes</span><span>{analysisResult.stats.mcPasses || 'off'}</span></div>
                                        {analysisResult.stats.meanUncertaintyOverLakes != null && (
                                            <div className="flex justify-between col-span-2">
                                                <span>Mean uncertainty over detected lakes</span>
                                                <span>{analysisResult.stats.meanUncertaintyOverLakes}</span>
                                            </div>
                                        )}
                                    </div>

                                    <div className="pt-4 mt-4 border-t border-blue-200">
                                        <button onClick={() => setIsDetailsOpen(!isDetailsOpen)} className="text-sm text-blue-600 hover:underline w-full flex justify-center items-center">
                                            Individual lake areas {isDetailsOpen ? <ChevronUp className="ml-2 w-4 h-4" /> : <ChevronDown className="ml-2 w-4 h-4" />}
                                        </button>
                                        {isDetailsOpen && (
                                            <div className="text-left mt-2 space-y-1 max-h-64 overflow-y-auto">
                                                {analysisResult.polygons.features.length === 0 && (
                                                    <p className="text-slate-500 text-center py-2">No lakes detected above the threshold.</p>
                                                )}
                                                {analysisResult.polygons.features.map((f: any) => (
                                                    <p key={f.properties.lake_id} className="flex justify-between py-1 px-2 rounded-md hover:bg-blue-100/50">
                                                        <span>{f.properties.lake_id}</span>
                                                        <span className="font-semibold">{f.properties.area_ha.toFixed(3)} ha</span>
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
