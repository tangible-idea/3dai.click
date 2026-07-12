"use client";

import {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import {
  Download,
  Search,
  Loader2,
  Maximize2,
  Nfc,
  AlertTriangle,
  LayoutGrid,
  X,
  FlipVertical2,
} from "lucide-react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  buildNfc,
  DEFAULT_NFC_OPTIONS,
  type NfcObject,
  type NfcOptions,
} from "@/lib/nfc";
import { export3mf } from "@/lib/export3mf";
import { loadCatalog, iconSvgUrl, type CatalogIcon } from "@/lib/icons";
import { FONT_OPTIONS } from "@/lib/fonts";

const PRESET_COLORS = [
  "#ffffff",
  "#111111",
  "#ff4fa3",
  "#ef4444",
  "#f97316",
  "#facc15",
  "#22c55e",
  "#2563eb",
  "#8b5cf6",
];

const FEATURED_ICONS: { slug: string; label: string }[] = [
  { slug: "linkedin", label: "LinkedIn" },
  { slug: "instagram", label: "Instagram" },
  { slug: "github", label: "GitHub" },
  { slug: "youtube", label: "YouTube" },
  { slug: "x", label: "X" },
  { slug: "facebook", label: "Facebook" },
  { slug: "tiktok", label: "TikTok" },
  { slug: "spotify", label: "Spotify" },
];

export default function Home() {
  const [opts, setOpts] = useState<NfcOptions>(DEFAULT_NFC_OPTIONS);
  const [objects, setObjects] = useState<NfcObject[] | null>(null);
  const [isGenerating, setIsGenerating] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [catalog, setCatalog] = useState<CatalogIcon[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    group: THREE.Group;
  } | null>(null);
  const framedRef = useRef(false);
  const buildIdRef = useRef(0);

  // --- Icon catalog -------------------------------------------------------
  useEffect(() => {
    loadCatalog()
      .then(setCatalog)
      .catch(() => setError("Failed to load the icon catalog"));
  }, []);

  const selectedIcon = useMemo(
    () => catalog.find((i) => i.slug === opts.iconSlug),
    [catalog, opts.iconSlug],
  );

  // --- three.js preview ---------------------------------------------------
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xeceae5);

    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 2000);
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

    scene.add(new THREE.HemisphereLight(0xffffff, 0xb8b4ab, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(50, -40, 90);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.35);
    fill.position.set(-50, 50, 30);
    scene.add(fill);

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

  const fitView = useCallback(() => {
    const ctx = sceneRef.current;
    if (!ctx) return;
    const { group, camera, controls } = ctx;
    const box = new THREE.Box3().setFromObject(group);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();
    controls.target.copy(center);
    camera.position
      .copy(center)
      .add(new THREE.Vector3(size * 0.9, -size * 0.9, size * 0.9));
    camera.updateProjectionMatrix();
  }, []);

  const flipView = useCallback(() => {
    const ctx = sceneRef.current;
    if (!ctx) return;
    const { camera, controls } = ctx;
    const offset = camera.position.clone().sub(controls.target);
    offset.z = -offset.z;
    camera.position.copy(controls.target).add(offset);
    camera.updateProjectionMatrix();
  }, []);

  // Render the assembled objects into the preview group. The camera is framed
  // once on first build and left alone afterwards so the user's view sticks.
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx) return;
    const { group } = ctx;

    group.clear();
    if (!objects) return;

    for (const o of objects) {
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(o.color),
        metalness: 0.05,
        roughness: 0.65,
      });
      group.add(new THREE.Mesh(o.geometry, mat));
    }

    if (!framedRef.current) {
      fitView();
      framedRef.current = true;
    }
  }, [objects, fitView]);

  // --- model build (debounced, latest-wins) -------------------------------
  useEffect(() => {
    const id = ++buildIdRef.current;
    setIsGenerating(true);
    const timer = setTimeout(async () => {
      try {
        const result = await buildNfc(opts);
        if (buildIdRef.current !== id) return;
        setObjects(result.objects);
        setError(null);
      } catch (err) {
        if (buildIdRef.current !== id) return;
        console.error(err);
        setError(err instanceof Error ? err.message : "Failed to build model");
      } finally {
        if (buildIdRef.current === id) setIsGenerating(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [opts]);

  const download = () => {
    if (!objects) return;
    const bytes = export3mf(objects);
    const blob = new Blob([bytes as BlobPart], { type: "model/3mf" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `nfc-${opts.iconSlug}-${Date.now()}.3mf`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-dvh flex flex-col">
      {/* Header */}
      <header className="flex items-center gap-3 h-14 px-4 sm:px-6 bg-white border-b border-stone-200 shrink-0">
        <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-600 text-white">
          <Nfc size={18} />
        </span>
        <div className="leading-tight">
          <h1 className="font-semibold">NFC Tag Studio</h1>
          <p className="text-xs text-stone-500 hidden sm:block">
            Design a two-color 3D-printable NFC tag and export it as Bambu Studio 3MF
          </p>
        </div>
        <button
          onClick={download}
          disabled={!objects || isGenerating}
          className="ml-auto flex items-center gap-2 rounded-lg bg-indigo-600 enabled:hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-semibold px-4 py-2 transition-colors"
        >
          <Download size={16} /> Download 3MF
        </button>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        {/* Sidebar */}
        <aside className="w-full lg:w-[380px] shrink-0 bg-white lg:border-r border-t lg:border-t-0 border-stone-200 overflow-y-auto nice-scroll order-last lg:order-first">
          <div className="p-4 sm:p-5 space-y-7">
            {/* Icon browser */}
            <section className="space-y-3">
              <SectionTitle>Icon</SectionTitle>

              <div className="flex items-center gap-3 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={iconSvgUrl(opts.iconSlug)}
                  alt=""
                  className="w-7 h-7"
                />
                <div className="leading-tight">
                  <p className="text-sm font-semibold">
                    {selectedIcon?.title ?? opts.iconSlug}
                  </p>
                  <p className="text-xs text-stone-500">selected icon</p>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {FEATURED_ICONS.map((icon) => (
                  <button
                    key={icon.slug}
                    type="button"
                    title={icon.label}
                    onClick={() =>
                      setOpts((o) => ({ ...o, iconSlug: icon.slug }))
                    }
                    className={`flex flex-col items-center gap-1.5 rounded-xl border px-1 py-2.5 transition-all ${
                      opts.iconSlug === icon.slug
                        ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500"
                        : "border-stone-200 bg-white hover:border-stone-300 hover:shadow-sm"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={iconSvgUrl(icon.slug)}
                      alt={icon.label}
                      className="w-6 h-6"
                    />
                    <span className="text-[11px] font-medium text-stone-600 truncate max-w-full">
                      {icon.label}
                    </span>
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm font-medium text-stone-600 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
              >
                <LayoutGrid size={15} />
                Browse all {catalog.length > 0 ? catalog.length.toLocaleString() : ""} icons
              </button>
            </section>

            {/* Back name */}
            <section className="space-y-3">
              <SectionTitle>Name on the back</SectionTitle>

              <input
                value={opts.backText}
                onChange={(e) =>
                  setOpts((o) => ({ ...o, backText: e.target.value }))
                }
                placeholder="e.g. 마크, Mark (optional)"
                maxLength={20}
                className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              />

              {opts.backText.trim() && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    {FONT_OPTIONS.map((font) => (
                      <button
                        key={font.id}
                        type="button"
                        onClick={() =>
                          setOpts((o) => ({ ...o, backFont: font.id }))
                        }
                        className={`flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2 text-left transition-all ${
                          opts.backFont === font.id
                            ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500"
                            : "border-stone-200 bg-white hover:border-stone-300 hover:shadow-sm"
                        }`}
                      >
                        <span
                          className="text-lg leading-snug truncate max-w-full"
                          style={{ fontFamily: `"${font.cssFamily}"` }}
                        >
                          {opts.backText.trim().slice(0, 8) || "가나다"}
                        </span>
                        <span className="text-[11px] text-stone-400">
                          {font.label}
                        </span>
                      </button>
                    ))}
                  </div>

                  <Slider
                    label="Name size"
                    unit="%"
                    min={30}
                    max={90}
                    step={1}
                    value={Math.round(opts.backTextScale * 100)}
                    onChange={(v) =>
                      setOpts((o) => ({ ...o, backTextScale: v / 100 }))
                    }
                  />
                  <Slider
                    label="Name vertical offset"
                    unit="mm"
                    min={-8}
                    max={8}
                    step={0.5}
                    value={opts.backTextOffsetY}
                    onChange={(v) =>
                      setOpts((o) => ({ ...o, backTextOffsetY: v }))
                    }
                  />
                  <p className="text-xs text-stone-400">
                    The name is inlaid flush into the back face — rotate the
                    preview to see it.
                  </p>
                </>
              )}
            </section>

            {/* Colors */}
            <section className="space-y-4">
              <SectionTitle>Colors</SectionTitle>
              <ColorRow
                label="Base"
                value={opts.baseColor}
                onChange={(v) => setOpts((o) => ({ ...o, baseColor: v }))}
              />
              <ColorRow
                label="Icon"
                value={opts.topColor}
                onChange={(v) => setOpts((o) => ({ ...o, topColor: v }))}
              />
            </section>

            {/* Shape */}
            <section className="space-y-4">
              <SectionTitle>Shape</SectionTitle>
              <Slider
                label="Icon size"
                unit="%"
                min={35}
                max={95}
                step={1}
                value={Math.round(opts.iconScale * 100)}
                onChange={(v) => setOpts((o) => ({ ...o, iconScale: v / 100 }))}
              />
              <Slider
                label="Vertical offset"
                unit="mm"
                min={-8}
                max={8}
                step={0.5}
                value={opts.iconOffsetY}
                onChange={(v) => setOpts((o) => ({ ...o, iconOffsetY: v }))}
              />
              <Slider
                label="Icon thickness"
                unit="mm"
                min={0.4}
                max={2}
                step={0.1}
                value={opts.topThickness}
                onChange={(v) => setOpts((o) => ({ ...o, topThickness: v }))}
              />
            </section>
          </div>
        </aside>

        {/* Viewport */}
        <main className="relative flex-1 min-h-[45dvh] bg-[#eceae5]">
          <div ref={mountRef} className="absolute inset-0" />

          <div className="absolute top-3 right-3 flex flex-col gap-2">
            <button
              onClick={fitView}
              title="Fit view"
              className="flex items-center justify-center w-9 h-9 rounded-lg bg-white/80 backdrop-blur border border-stone-200 text-stone-600 hover:text-stone-900 hover:bg-white transition-colors"
            >
              <Maximize2 size={16} />
            </button>
            <button
              onClick={flipView}
              title="Show front / back"
              className="flex items-center justify-center w-9 h-9 rounded-lg bg-white/80 backdrop-blur border border-stone-200 text-stone-600 hover:text-stone-900 hover:bg-white transition-colors"
            >
              <FlipVertical2 size={16} />
            </button>
          </div>

          <div className="absolute bottom-3 left-3 flex items-center gap-2">
            <LegendChip label="Filament 1 · Base" color={opts.baseColor} />
            <LegendChip label="Filament 2 · Icon" color={opts.topColor} />
          </div>

          {isGenerating && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="flex items-center gap-2 rounded-full bg-white/85 backdrop-blur px-4 py-2 text-sm font-medium text-stone-600 shadow-sm">
                <Loader2 size={16} className="animate-spin text-indigo-600" />
                Building model…
              </div>
            </div>
          )}

          {error && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5 shadow-sm max-w-[90%]">
              <AlertTriangle size={16} className="shrink-0" />
              {error}
            </div>
          )}
        </main>
      </div>

      {pickerOpen && (
        <IconPickerModal
          catalog={catalog}
          selected={opts.iconSlug}
          onSelect={(slug) => {
            setOpts((o) => ({ ...o, iconSlug: slug }));
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}

function IconPickerModal({
  catalog,
  selected,
  onSelect,
  onClose,
}: {
  catalog: CatalogIcon[];
  selected: string;
  onSelect: (slug: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter(
      (i) => i.title.toLowerCase().includes(q) || i.slug.includes(q),
    );
  }, [catalog, search]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8 bg-stone-900/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Choose an icon"
        className="flex flex-col w-full max-w-4xl h-[85dvh] rounded-2xl bg-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-stone-200 shrink-0">
          <h2 className="font-semibold">Choose an icon</h2>
          <span className="text-sm text-stone-400">
            {filtered.length.toLocaleString()} of {catalog.length.toLocaleString()}
          </span>
          <button
            type="button"
            onClick={onClose}
            title="Close"
            className="ml-auto flex items-center justify-center w-8 h-8 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-stone-100 shrink-0">
          <div className="relative">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
            />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search icons…"
              className="w-full rounded-xl border border-stone-200 bg-stone-50 pl-9 pr-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:bg-white"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto nice-scroll p-4">
          {catalog.length === 0 ? (
            <p className="p-8 text-sm text-stone-500 text-center">
              Loading icons…
            </p>
          ) : filtered.length === 0 ? (
            <p className="p-8 text-sm text-stone-500 text-center">
              No icons match “{search}”
            </p>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
              {filtered.map((icon) => (
                <button
                  key={icon.slug}
                  type="button"
                  title={icon.title}
                  onClick={() => onSelect(icon.slug)}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border px-1 py-3 transition-all ${
                    selected === icon.slug
                      ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500"
                      : "border-transparent hover:border-stone-200 hover:bg-stone-50"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={iconSvgUrl(icon.slug)}
                    alt={icon.title}
                    loading="lazy"
                    decoding="async"
                    className="w-7 h-7"
                  />
                  <span className="text-[11px] text-stone-500 truncate max-w-full px-1">
                    {icon.title}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-semibold uppercase tracking-widest text-stone-400">
      {children}
    </h2>
  );
}

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <label className="font-medium">{label}</label>
        <span className="text-stone-400 uppercase text-xs self-center">
          {value}
        </span>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {PRESET_COLORS.map((color) => (
          <button
            key={`${label}-${color}`}
            type="button"
            title={color}
            onClick={() => onChange(color)}
            className={`w-7 h-7 rounded-full border transition-all ${
              value.toLowerCase() === color
                ? "ring-2 ring-indigo-500 ring-offset-2 border-stone-300"
                : "border-stone-300 hover:scale-110"
            }`}
            style={{ backgroundColor: color }}
          />
        ))}
        <label
          title="Custom color"
          className="relative w-7 h-7 rounded-full border border-stone-300 cursor-pointer overflow-hidden bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)]"
        >
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer"
          />
        </label>
      </div>
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
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <label className="font-medium">{label}</label>
        <span className="text-stone-500 tabular-nums">
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
        className="w-full h-1.5 bg-stone-200 rounded-full appearance-none cursor-pointer accent-indigo-600"
      />
    </div>
  );
}

function LegendChip({ label, color }: { label: string; color: string }) {
  return (
    <span className="flex items-center gap-2 rounded-full bg-white/80 backdrop-blur border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600">
      <span
        className="w-3.5 h-3.5 rounded-full border border-stone-300"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}
