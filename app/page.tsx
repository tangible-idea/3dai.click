"use client";

import { useState, useRef, useEffect } from "react";
import { Upload, RefreshCw, Download, Settings, Layers, Hexagon, PenTool } from "lucide-react";
import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";

type StyleOption = "cartoon" | "lowpoly" | "stainedglass";

export default function Home() {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedStyle, setSelectedStyle] = useState<StyleOption>("cartoon");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedSvg, setGeneratedSvg] = useState<string | null>(null);
  const [thickness, setThickness] = useState(2);
  const [error, setError] = useState<string | null>(null);
  const [isStlGenerating, setIsStlGenerating] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setSelectedImage(event.target?.result as string);
        setGeneratedSvg(null); // Reset generated SVG when new image is uploaded
      };
      reader.readAsDataURL(file);
    }
  };

  const generateSvg = async () => {
    if (!selectedImage) return;

    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch("/api/generate-svg", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image: selectedImage,
          style: selectedStyle,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate SVG");
      }

      setGeneratedSvg(data.svg);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred");
    } finally {
      setIsGenerating(false);
    }
  };

  const generateAndDownloadStl = async () => {
    if (!generatedSvg) return;
    setIsStlGenerating(true);

    try {
      // Create a Three.js scene to process the SVG
      const loader = new SVGLoader();
      const svgData = loader.parse(generatedSvg);
      
      const group = new THREE.Group();
      
      svgData.paths.forEach((path) => {
        const shapes = path.toShapes(true);
        
        shapes.forEach((shape) => {
          const geometry = new THREE.ExtrudeGeometry(shape, {
            depth: thickness * 5, // Scale thickness for better 3D effect
            bevelEnabled: false,
          });
          
          const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
          const mesh = new THREE.Mesh(geometry, material);
          
          // Center the mesh? Maybe later. For now just add.
          // We might need to flip Y because SVG coordinates are top-down
          mesh.scale.y = -1; 
          
          group.add(mesh);
        });
      });

      // Export to STL
      const exporter = new STLExporter();
      const result = exporter.parse(group, { binary: true });
      
      // Trigger download
      // Cast result to any to avoid TypeScript error with DataView<ArrayBufferLike> vs BlobPart
      const blob = new Blob([result as any], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `3dai-${selectedStyle}-${Date.now()}.stl`;
      link.click();
      URL.revokeObjectURL(url);
      
    } catch (err) {
      console.error(err);
      setError("Failed to generate STL: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsStlGenerating(false);
    }
  };

  return (
    <main className="min-h-screen bg-neutral-900 text-white p-8">
      <div className="max-w-6xl mx-auto space-y-12">
        <header className="text-center space-y-4">
          <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400">
            3DAI.Click
          </h1>
          <p className="text-neutral-400 max-w-xl mx-auto">
            Convert your images into 3D printable frames using AI.
            Upload an image, choose a style, and download the STL.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Left Column: Input */}
          <div className="space-y-8">
            {/* Image Upload */}
            <div 
              className={`
                border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer
                ${selectedImage ? 'border-emerald-500/50 bg-emerald-900/10' : 'border-neutral-700 hover:border-neutral-500 bg-neutral-800/50'}
              `}
              onClick={() => fileInputRef.current?.click()}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleImageUpload} 
                accept="image/*" 
                className="hidden" 
              />
              
              {selectedImage ? (
                <div className="relative aspect-video w-full max-h-64 mx-auto overflow-hidden rounded-lg">
                  <img src={selectedImage} alt="Uploaded" className="object-contain w-full h-full" />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                    <span className="flex items-center gap-2 text-white font-medium">
                      <RefreshCw size={20} /> Change Image
                    </span>
                  </div>
                </div>
              ) : (
                <div className="py-12 space-y-4">
                  <div className="mx-auto w-16 h-16 rounded-full bg-neutral-800 flex items-center justify-center">
                    <Upload className="text-neutral-400" size={32} />
                  </div>
                  <div>
                    <p className="text-lg font-medium">Click to upload image</p>
                    <p className="text-sm text-neutral-500">JPG, PNG supported</p>
                  </div>
                </div>
              )}
            </div>

            {/* Style Selection */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Settings size={20} className="text-emerald-400" />
                Select Style
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StyleButton 
                  active={selectedStyle === "cartoon"} 
                  onClick={() => setSelectedStyle("cartoon")}
                  icon={<PenTool size={24} />}
                  label="Cartoon / Line"
                />
                <StyleButton 
                  active={selectedStyle === "lowpoly"} 
                  onClick={() => setSelectedStyle("lowpoly")}
                  icon={<Hexagon size={24} />}
                  label="Low Poly"
                />
                <StyleButton 
                  active={selectedStyle === "stainedglass"} 
                  onClick={() => setSelectedStyle("stainedglass")}
                  icon={<Layers size={24} />}
                  label="Stained Glass"
                />
              </div>
            </div>

            {/* Generate Button */}
            <button
              onClick={generateSvg}
              disabled={!selectedImage || isGenerating}
              className={`
                w-full py-4 rounded-xl font-bold text-lg transition-all
                flex items-center justify-center gap-2
                ${!selectedImage 
                  ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed' 
                  : isGenerating
                    ? 'bg-emerald-600/50 text-white cursor-wait'
                    : 'bg-gradient-to-r from-blue-600 to-emerald-600 hover:from-blue-500 hover:to-emerald-500 text-white shadow-lg shadow-emerald-900/20'
                }
              `}
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="animate-spin" /> Generating SVG...
                </>
              ) : (
                <>
                  Generate Frame
                </>
              )}
            </button>
            
            {error && (
              <div className="p-4 bg-red-900/20 border border-red-800 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            )}
          </div>

          {/* Right Column: Preview & Output */}
          <div className="bg-neutral-800/30 rounded-2xl p-8 border border-neutral-800 flex flex-col h-full">
            <h3 className="text-lg font-semibold mb-6">Preview & Export</h3>
            
            <div className="flex-grow flex items-center justify-center bg-neutral-900/50 rounded-xl border-2 border-dashed border-neutral-800 min-h-[400px] overflow-hidden relative">
              {generatedSvg ? (
                <div 
                  className="w-full h-full p-4 svg-container"
                  dangerouslySetInnerHTML={{ __html: generatedSvg }}
                  style={{
                    // Apply some basic styling to make sure SVG is visible
                    filter: 'invert(1)', // Invert colors for dark mode if SVG is black
                  }}
                />
              ) : (
                <div className="text-neutral-600 text-center">
                  <p>Generated SVG will appear here</p>
                </div>
              )}
            </div>

            {/* Controls for STL */}
            {generatedSvg && (
              <div className="mt-8 space-y-6 animate-in fade-in slide-in-from-bottom-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <label>Frame Thickness</label>
                    <span className="text-emerald-400">{thickness}mm</span>
                  </div>
                  <input 
                    type="range" 
                    min="1" 
                    max="10" 
                    step="0.5" 
                    value={thickness} 
                    onChange={(e) => setThickness(parseFloat(e.target.value))}
                    className="w-full h-2 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={generateSvg}
                    className="px-4 py-3 rounded-xl font-semibold bg-neutral-700 hover:bg-neutral-600 transition-colors flex items-center justify-center gap-2"
                  >
                    <RefreshCw size={18} /> Regenerate
                  </button>
                  <button
                    onClick={generateAndDownloadStl}
                    disabled={isStlGenerating}
                    className="px-4 py-3 rounded-xl font-semibold bg-emerald-600 hover:bg-emerald-500 transition-colors flex items-center justify-center gap-2"
                  >
                    {isStlGenerating ? <RefreshCw className="animate-spin" size={18} /> : <Download size={18} />}
                    Download STL
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function StyleButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button
      onClick={onClick}
      className={`
        p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-3
        ${active 
          ? 'border-emerald-500 bg-emerald-900/20 text-emerald-400' 
          : 'border-neutral-700 hover:border-neutral-600 bg-neutral-800 text-neutral-400'
        }
      `}
    >
      {icon}
      <span className="font-medium text-sm">{label}</span>
    </button>
  );
}
