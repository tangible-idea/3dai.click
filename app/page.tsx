"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { RefreshCw, Download, Settings, Box } from "lucide-react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  buildNfc,
  DEFAULT_NFC_OPTIONS,
  type NfcObject,
  type NfcOptions,
} from "@/lib/nfc";
import { export3mf } from "@/lib/export3mf";

const ICON_OPTIONS = [
  { slug: "linkedin", label: "LinkedIn" },
  { slug: "instagram", label: "Instagram" },
  { slug: "github", label: "GitHub" },
  { slug: "youtube", label: "YouTube" },
  { slug: "x", label: "X" },
  { slug: "facebook", label: "Facebook" },
  { slug: "tiktok", label: "TikTok" },
  { slug: "discord", label: "Discord" },
];

const COLOR_OPTIONS = [
  { label: "White", value: "#ffffff" },
  { label: "Pink", value: "#ff4fa3" },
  { label: "Black", value: "#111111" },
  { label: "Blue", value: "#2563eb" },
  { label: "Red", value: "#ef4444" },
  { label: "Green", value: "#22c55e" },
  { label: "Purple", value: "#8b5cf6" },
  { label: "Yellow", value: "#facc15" },
];

export default function Home() {
  const [opts, setOpts] = useState<NfcOptions>(DEFAULT_NFC_OPTIONS);
  const [customIcon, setCustomIcon] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [objects, setObjects] = useState<NfcObject[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const generate = useCallback(async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const result = await buildNfc(opts);
      setObjects(result.objects);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to build NFC model");
    } finally {
      setIsGenerating(false);
    }
  }, [opts]);

  useEffect(() => {
    void generate();
  }, [generate]);

  const download = () => {
    if (!objects) return;
    const bytes = export3mf(objects);
    const blob = new Blob([bytes as BlobPart], {
      type: "model/3mf",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `nfc-${opts.iconSlug}-${Date.now()}.3mf`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="min-h-screen bg-neutral-900 text-white p-8">
      <div className="max-w-6xl mx-auto space-y-10">
        <header className="text-center space-y-3">
          <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400">
            NFC 3D Generator
          </h1>
          <p className="text-neutral-400 max-w-xl mx-auto">
            Choose a Simple Icons logo, place it on the NFC base, select colors,
            and download a two-part Bambu Studio 3MF.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          {/* Left: input */}
          <div className="space-y-8">
            <div className="border border-neutral-800 rounded-2xl p-6 bg-neutral-800/40 space-y-5">
              <div>
                <h3 className="text-lg font-semibold">Icon</h3>
                <p className="text-sm text-neutral-500 mt-1">
                  Select from Simple Icons or enter a slug from allsvgicons.com.
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {ICON_OPTIONS.map((icon) => (
                  <button
                    key={icon.slug}
                    type="button"
                    onClick={() => {
                      setCustomIcon("");
                      setOpts((o) => ({ ...o, iconSlug: icon.slug }));
                    }}
                    className={`rounded-xl border px-3 py-4 text-sm font-semibold transition-all ${
                      opts.iconSlug === icon.slug
                        ? "border-emerald-400 bg-emerald-500/15 text-white"
                        : "border-neutral-700 bg-neutral-900/40 text-neutral-300 hover:border-neutral-500"
                    }`}
                  >
                    {icon.label}
                  </button>
                ))}
              </div>

              <div className="space-y-2">
                <label className="text-sm text-neutral-300">Custom icon slug</label>
                <input
                  value={customIcon}
                  onChange={(e) => setCustomIcon(e.target.value)}
                  onBlur={() => {
                    const slug = customIcon.trim().toLowerCase();
                    if (slug) setOpts((o) => ({ ...o, iconSlug: slug }));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const slug = customIcon.trim().toLowerCase();
                      if (slug) setOpts((o) => ({ ...o, iconSlug: slug }));
                    }
                  }}
                  placeholder="e.g. spotify, kakao, notion"
                  className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-white outline-none focus:border-emerald-400"
                />
              </div>
            </div>

            <div className="space-y-5">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Settings size={20} className="text-emerald-400" />
                NFC Settings
              </h3>

              <ColorPicker
                label="Top Icon Color"
                value={opts.topColor}
                onChange={(v) => setOpts((o) => ({ ...o, topColor: v }))}
              />
              <ColorPicker
                label="Base Color"
                value={opts.baseColor}
                onChange={(v) => setOpts((o) => ({ ...o, baseColor: v }))}
              />
              <Slider
                label="Icon Size"
                unit="%"
                min={35}
                max={95}
                step={1}
                value={Math.round(opts.iconScale * 100)}
                onChange={(v) => setOpts((o) => ({ ...o, iconScale: v / 100 }))}
              />
              <Slider
                label="Icon Vertical Offset"
                unit="mm"
                min={-8}
                max={8}
                step={0.5}
                value={opts.iconOffsetY}
                onChange={(v) => setOpts((o) => ({ ...o, iconOffsetY: v }))}
              />
              <Slider
                label="Top Thickness"
                unit="mm"
                min={0.4}
                max={2}
                step={0.1}
                value={opts.topThickness}
                onChange={(v) => setOpts((o) => ({ ...o, topThickness: v }))}
              />
            </div>

            <button
              onClick={generate}
              disabled={isGenerating}
              className={`w-full py-4 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-2 ${
                isGenerating
                  ? "bg-emerald-600/50 text-white cursor-wait"
                  : "bg-gradient-to-r from-blue-600 to-emerald-600 hover:from-blue-500 hover:to-emerald-500 text-white shadow-lg shadow-emerald-900/20"
              }`}
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="animate-spin" /> Building NFC model...
                </>
              ) : (
                <>
                  <Box size={20} /> Generate NFC 3MF
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

            {objects && (
              <div className="mt-5 flex items-center gap-2 text-sm text-neutral-400">
                <span>Filaments →</span>
                <span className="inline-flex items-center gap-2">
                  <span className="w-5 h-5 rounded border border-neutral-700" style={{ backgroundColor: opts.baseColor }} />
                  Base
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="w-5 h-5 rounded border border-neutral-700" style={{ backgroundColor: opts.topColor }} />
                  Top
                </span>
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

function ColorPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex justify-between text-sm">
        <label>{label}</label>
        <span className="text-emerald-400 uppercase">{value}</span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {COLOR_OPTIONS.map((color) => (
          <button
            key={`${label}-${color.value}`}
            type="button"
            onClick={() => onChange(color.value)}
            className={`rounded-xl border p-2 text-xs font-medium transition-all ${
              value.toLowerCase() === color.value
                ? "border-emerald-400 bg-emerald-500/15 text-white"
                : "border-neutral-700 bg-neutral-900/40 text-neutral-300 hover:border-neutral-500"
            }`}
          >
            <span
              className="mx-auto mb-2 block h-7 w-7 rounded-full border border-neutral-600"
              style={{ backgroundColor: color.value }}
            />
            {color.label}
          </button>
        ))}
      </div>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-xl border border-neutral-700 bg-neutral-950 p-1"
      />
    </div>
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
