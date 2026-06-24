"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Upload, RefreshCw, Download, Settings, Box } from "lucide-react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  buildClicker,
  DEFAULT_OPTIONS,
  type ClickerObject,
  type ClickerOptions,
} from "@/lib/clicker";
import { export3mf } from "@/lib/export3mf";
import { rgbToHex, type PosterizeResult } from "@/lib/image-posterize";

export default function Home() {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [opts, setOpts] = useState<ClickerOptions>(DEFAULT_OPTIONS);
  const [isGenerating, setIsGenerating] = useState(false);
  const [objects, setObjects] = useState<ClickerObject[] | null>(null);
  const [post, setPost] = useState<PosterizeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    group: THREE.Group;
  } | null>(null);

  // Initialize the three.js preview once.
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
    camera.position.set(60, -60, 60);
    camera.up.set(0, 0, 1);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dir = new THREE.DirectionalLight(0xffffff, 1.0);
    dir.position.set(50, -30, 80);
    scene.add(dir);
    const dir2 = new THREE.DirectionalLight(0xffffff, 0.4);
    dir2.position.set(-40, 40, 20);
    scene.add(dir2);

    const group = new THREE.Group();
    scene.add(group);

    sceneRef.current = { renderer, scene, camera, controls, group };

    let raf = 0;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    const resize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      sceneRef.current = null;
    };
  }, []);

  // Render the assembled objects into the preview group.
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx) return;
    const { group, camera, controls } = ctx;

    group.clear();
    if (!objects) return;

    for (const o of objects) {
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(o.color),
        metalness: 0.1,
        roughness: 0.7,
      });
      group.add(new THREE.Mesh(o.geometry, mat));
    }

    // Frame the camera on the assembled bounding box.
    const box = new THREE.Box3().setFromObject(group);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();
    controls.target.copy(center);
    camera.position.copy(center).add(new THREE.Vector3(size, -size, size));
    camera.updateProjectionMatrix();
  }, [objects]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setSelectedImage(ev.target?.result as string);
      setObjects(null);
      setPost(null);
      setError(null);
    };
    reader.readAsDataURL(file);
  };

  const generate = useCallback(async () => {
    if (!selectedImage) return;
    setIsGenerating(true);
    setError(null);
    try {
      const result = await buildClicker(selectedImage, opts);
      setObjects(result.objects);
      setPost(result.posterize);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to build clicker");
    } finally {
      setIsGenerating(false);
    }
  }, [selectedImage, opts]);

  const download = () => {
    if (!objects) return;
    const bytes = export3mf(objects);
    const blob = new Blob([bytes as BlobPart], {
      type: "model/3mf",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `clicker-${Date.now()}.3mf`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="min-h-screen bg-neutral-900 text-white p-8">
      <div className="max-w-6xl mx-auto space-y-10">
        <header className="text-center space-y-3">
          <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400">
            3DAI.Click
          </h1>
          <p className="text-neutral-400 max-w-xl mx-auto">
            Turn any image into a printable multicolor clicker. Upload an image,
            tune the plate, and download a Bambu Studio 3MF.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          {/* Left: input */}
          <div className="space-y-8">
            <div
              className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer ${
                selectedImage
                  ? "border-emerald-500/50 bg-emerald-900/10"
                  : "border-neutral-700 hover:border-neutral-500 bg-neutral-800/50"
              }`}
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
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={selectedImage}
                    alt="Uploaded"
                    className="object-contain w-full h-full"
                  />
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

            <div className="space-y-5">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Settings size={20} className="text-emerald-400" />
                Clicker Settings
              </h3>

              <Slider
                label="Plate Size"
                unit="mm"
                min={20}
                max={80}
                step={1}
                value={opts.plateSize}
                onChange={(v) => setOpts((o) => ({ ...o, plateSize: v }))}
              />
              <Slider
                label="Base Thickness"
                unit="mm"
                min={14}
                max={30}
                step={0.5}
                value={opts.baseThickness}
                onChange={(v) => setOpts((o) => ({ ...o, baseThickness: v }))}
              />
              <Slider
                label="Image Layer Thickness"
                unit="mm"
                min={0.2}
                max={2}
                step={0.1}
                value={opts.imageThickness}
                onChange={(v) => setOpts((o) => ({ ...o, imageThickness: v }))}
              />
              <Slider
                label="Colors"
                unit=""
                min={2}
                max={8}
                step={1}
                value={opts.colorCount}
                onChange={(v) => setOpts((o) => ({ ...o, colorCount: v }))}
              />
            </div>

            <button
              onClick={generate}
              disabled={!selectedImage || isGenerating}
              className={`w-full py-4 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-2 ${
                !selectedImage
                  ? "bg-neutral-800 text-neutral-500 cursor-not-allowed"
                  : isGenerating
                    ? "bg-emerald-600/50 text-white cursor-wait"
                    : "bg-gradient-to-r from-blue-600 to-emerald-600 hover:from-blue-500 hover:to-emerald-500 text-white shadow-lg shadow-emerald-900/20"
              }`}
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="animate-spin" /> Building clicker...
                </>
              ) : (
                <>
                  <Box size={20} /> Generate Clicker
                </>
              )}
            </button>

            {error && (
              <div className="p-4 bg-red-900/20 border border-red-800 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            )}
          </div>

          {/* Right: preview + export */}
          <div className="bg-neutral-800/30 rounded-2xl p-6 border border-neutral-800 flex flex-col self-start lg:sticky lg:top-8">
            <h3 className="text-lg font-semibold mb-4">Preview & Export</h3>

            <div
              ref={mountRef}
              className="h-[420px] rounded-xl border-2 border-dashed border-neutral-800 bg-neutral-900/50 overflow-hidden relative"
            >
              {!objects && (
                <div className="absolute inset-0 flex items-center justify-center text-neutral-600 pointer-events-none">
                  <p>3D preview appears here</p>
                </div>
              )}
            </div>

            {post && (
              <div className="mt-5 flex items-center gap-2">
                <span className="text-sm text-neutral-400">Palette →</span>
                <div className="flex gap-1.5">
                  {post.palette.map((c, i) => (
                    <div
                      key={i}
                      className="w-7 h-7 rounded-md border border-neutral-700"
                      style={{ backgroundColor: rgbToHex(c) }}
                      title={rgbToHex(c)}
                    />
                  ))}
                </div>
              </div>
            )}

            {objects && (
              <button
                onClick={download}
                className="mt-5 px-4 py-3 rounded-xl font-semibold bg-emerald-600 hover:bg-emerald-500 transition-colors flex items-center justify-center gap-2"
              >
                <Download size={18} /> Download 3MF
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function Slider({
  label,
  unit,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <label>{label}</label>
        <span className="text-emerald-400">
          {value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-2 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
      />
    </div>
  );
}
