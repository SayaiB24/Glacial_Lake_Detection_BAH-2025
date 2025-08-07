"use client"

import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, Calendar as CalendarIcon, X } from 'lucide-react';
import Image from 'next/image';
import { gsap } from 'gsap';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';

// Register Chart.js components
ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend, Filler);


// --- Snowfall Background Animation ---
const AnimatedBackground = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = window.innerWidth;
    let height = window.innerHeight;

    canvas.width = width;
    canvas.height = height;

    // Create 150 snowflakes for good density
    let snowflakes = Array.from({ length: 150 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: Math.random() * 3 + 2, // radius between 2 and 5
      speedY: Math.random() * 1.2 + 0.5,
      speedX: Math.random() * 0.6 - 0.3,
      opacity: Math.random() * 0.5 + 0.5, // opacity between 0.5 and 1
    }));

    let animationFrameId: number;

    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      // Glow effect for flakes
      ctx.shadowColor = 'rgba(5, 5, 5, 0.9)';
      ctx.shadowBlur = 8;

      ctx.fillStyle = 'white';
      ctx.beginPath();
      snowflakes.forEach(flake => {
        ctx.globalAlpha = flake.opacity;
        ctx.moveTo(flake.x, flake.y);
        ctx.arc(flake.x, flake.y, flake.radius, 0, Math.PI * 2);
      });
      ctx.fill();

      snowflakes.forEach(flake => {
        flake.y += flake.speedY;
        flake.x += flake.speedX;

        if (flake.y > height + flake.radius) {
          flake.y = -flake.radius;
          flake.x = Math.random() * width;
        }
        if (flake.x > width + flake.radius) {
          flake.x = -flake.radius;
        }
        if (flake.x < -flake.radius) {
          flake.x = width + flake.radius;
        }
      });

      ctx.globalAlpha = 1; // reset alpha

      animationFrameId = requestAnimationFrame(draw);
    };

    draw();

    const handleResize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
      // Reset flakes for new size
      snowflakes = Array.from({ length: 150 }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: Math.random() * 3 + 2,
        speedY: Math.random() * 1.2 + 0.5,
        speedX: Math.random() * 0.6 - 0.3,
        opacity: Math.random() * 0.5 + 0.5,
      }));
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


// A reusable file input component for the blue theme
const FileInput = ({ label, onFileSelect, onDateChange, selectedFile, date, }: { label: string; onFileSelect: (file: File) => void; onDateChange: (date: string) => void; selectedFile: File | null; date: string; }) => {
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      onFileSelect(acceptedFiles[0]);
    }
  }, [onFileSelect]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/tiff': ['.tif', '.tiff'], 'image/png': ['.png'], 'image/jpeg': ['.jpg', '.jpeg'] },
    multiple: false,
  });

  return (
    <Card className="glass-container-blue text-center border-blue-200 shadow-sm bg-white/60">
      <CardHeader>
        <CardTitle className="text-blue-800 text-lg">{label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div {...getRootProps()} className={`file-input-label-blue transition-colors p-6 ${isDragActive ? 'bg-blue-100' : 'hover:bg-blue-50'}`}>
          <input {...getInputProps()} />
          <Upload className="mx-auto h-8 w-8 text-slate-500 mb-2" />
          <p className="text-slate-600">{selectedFile ? selectedFile.name : 'Drag & drop or click to upload'}</p>
        </div>
        <div className="relative">
          <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
          <input type="date" value={date} onChange={e => onDateChange(e.target.value)} className="date-input-blue pl-10" />
        </div>
      </CardContent>
    </Card>
  );
};


// Main Page Component
export default function TimeSeriesPage() {
  const [file1, setFile1] = useState<File | null>(null);
  const [file2, setFile2] = useState<File | null>(null);
  const [date1, setDate1] = useState('');
  const [date2, setDate2] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any | null>(null);
  const [chartType, setChartType] = useState<'bar' | 'line'>('bar');

  // GSAP Animations
  useEffect(() => {
    gsap.fromTo("#main-title", { y: -50, opacity: 0 }, { duration: 1, y: 0, opacity: 1, ease: 'power3.out' });
    gsap.fromTo("#subtitle", { y: -30, opacity: 0 }, { duration: 1, y: 0, opacity: 1, delay: 0.3, ease: 'power3.out' });
    gsap.fromTo("#upload-tool", { y: 50, opacity: 0 }, { duration: 1, y: 0, opacity: 1, delay: 0.6, ease: 'power3.out' });
  }, []);

  useEffect(() => {
    if (analysisResult) {
      gsap.fromTo("#results-section > *", { y: 50, opacity: 0 }, { duration: 0.8, y: 0, opacity: 1, ease: 'power3.out', stagger: 0.2 });
    }
  }, [analysisResult]);

  const handleProcessImages = async () => {
    if (!file1 || !file2) {
      alert('Please upload both images.');
      return;
    }
    setIsProcessing(true);
    setAnalysisResult(null); // Clear previous results before starting

    const formData = new FormData();
    formData.append('image1', file1);
    formData.append('image2', file2);
    formData.append('date1', date1);
    formData.append('date2', date2);

    try {
      const response = await fetch('/api/compare-images', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Analysis failed on the server. Please try again.');
      }

      const result = await response.json();

      setAnalysisResult(result);

    } catch (error: any) {
      console.error("Processing error:", error);
      alert(error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const chartData = {
    labels: [analysisResult?.stats.date1, analysisResult?.stats.date2],
    datasets: [{
      label: 'Lake Area (km²)',
      data: [analysisResult?.stats.area1, analysisResult?.stats.area2],
      backgroundColor: chartType === 'bar' ? ['rgba(147, 197, 253, 0.7)', 'rgba(59, 130, 246, 0.7)'] : 'rgba(59, 130, 246, 0.2)',
      borderColor: '#1d4ed8',
      borderWidth: 2,
      fill: chartType === 'line',
      tension: 0.4
    }]
  };

  const chartOptions = {
    scales: {
      y: { beginAtZero: true, grid: { color: 'rgba(30, 64, 175, 0.1)' }, ticks: { color: '#1e3a8a' } },
      x: { grid: { color: 'rgba(30, 64, 175, 0.1)' }, ticks: { color: '#1e3a8a' } }
    },
    plugins: { legend: { labels: { color: '#1e3a8a' } } }
  };

  return (
    <div className="min-h-screen bg-blue-50 text-slate-800 font-sans">
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
              <span className="font-semibold text-blue-600">Image Comparison</span>
            </nav>
          </div>
        </div>
      </header>

      <main className="pt-32 pb-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

          <div className="text-center mb-12">
            <h2 id="main-title" className="text-4xl md:text-5xl font-extrabold tracking-tight text-blue-900 opacity-0">Image Comparison Analysis</h2>
            <p id="subtitle" className="mt-4 text-lg text-slate-500 opacity-0">Upload two satellite images to detect and compare changes in glacial lakes.</p>
          </div>

          <div id="upload-tool" className="glass-container-blue rounded-lg p-8 mb-12 opacity-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
              <FileInput
                label="Image 1 (e.g., Older Year)"
                onFileSelect={setFile1}
                onDateChange={setDate1}
                selectedFile={file1}
                date={date1}
              />
              <FileInput
                label="Image 2 (e.g., Newer Year)"
                onFileSelect={setFile2}
                onDateChange={setDate2}
                selectedFile={file2}
                date={date2}
              />
            </div>
            <div className="mt-8 text-center">
              <Button onClick={handleProcessImages} disabled={!file1 || !file2 || isProcessing} className="btn-analyze-blue font-bold py-3 px-8 rounded-md text-lg h-auto disabled:bg-gray-400 disabled:scale-100">
                {isProcessing ? 'Processing...' : 'Process Images'}
              </Button>
            </div>
          </div>

          {analysisResult && (
            <div id="results-section" className="space-y-8">
              <h3 className="text-3xl font-bold text-blue-900 text-center">Analysis Results</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <Card className="glass-container-blue"><CardHeader><CardTitle className="text-center">Image 1: Mapped Lakes</CardTitle></CardHeader><CardContent><Image src={analysisResult.image1Url} alt="Mapped lakes from image 1" width={600} height={400} className="rounded-md w-full" /></CardContent></Card>
                <Card className="glass-container-blue"><CardHeader><CardTitle className="text-center">Image 2: Mapped Lakes</CardTitle></CardHeader><CardContent><Image src={analysisResult.image2Url} alt="Mapped lakes from image 2" width={600} height={400} className="rounded-md w-full" /></CardContent></Card>
              </div>

              <Card className="glass-container-blue p-6">
                <CardHeader><CardTitle>Lake Area Statistics</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-lg">
                  <p>Lake Area ({analysisResult.stats.date1}): <span className="font-bold text-blue-600">{analysisResult.stats.area1.toFixed(2)} km²</span></p>
                  <p>Lake Area ({analysisResult.stats.date2}): <span className="font-bold text-blue-600">{analysisResult.stats.area2.toFixed(2)} km²</span></p>
                  <hr className="border-blue-200 my-2" />
                  <p>Change in Area: <span className={`font-bold ${analysisResult.stats.change >= 0 ? 'text-red-600' : 'text-green-600'}`}>{analysisResult.stats.change.toFixed(2)} km² ({analysisResult.stats.percentChange.toFixed(1)}%)</span></p>
                </CardContent>
              </Card>

              <Card className="glass-container-blue p-4">
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <CardTitle>Area Comparison Graph</CardTitle>
                    <div className="flex space-x-2">
                      <Button onClick={() => setChartType('bar')} className={`graph-toggle-btn-blue ${chartType === 'bar' ? 'active' : ''}`}>Bar Chart</Button>
                      <Button onClick={() => setChartType('line')} className={`graph-toggle-btn-blue ${chartType === 'line' ? 'active' : ''}`}>Line Chart</Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {chartType === 'bar' ? <Bar data={chartData} options={chartOptions as any} /> : <Line data={chartData} options={chartOptions as any} />}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
