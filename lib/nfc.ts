import * as THREE from "three";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Font } from "opentype.js";
import { iconSvgUrl } from "./icons";
import { loadFont, DEFAULT_FONT_ID } from "./fonts";
import { textToShapes } from "./text-outline";

export interface NfcObject {
  name: string;
  geometry: THREE.BufferGeometry;
  color: string;
  filament: number;
}

export interface NfcOptions {
  iconSlug: string;
  baseColor: string;
  topColor: string;
  iconScale: number;
  topThickness: number;
  iconOffsetY: number;
  /** Name engraved flush into the back face (empty = none). */
  backText: string;
  backFont: string;
  /** Text width as a fraction of the base width. */
  backTextScale: number;
  backTextOffsetY: number;
}

export const DEFAULT_NFC_OPTIONS: NfcOptions = {
  iconSlug: "linkedin",
  baseColor: "#ff4fa3",
  topColor: "#ffffff",
  iconScale: 0.72,
  topThickness: 1,
  iconOffsetY: 2.5,
  backText: "",
  backFont: DEFAULT_FONT_ID,
  backTextScale: 0.6,
  backTextOffsetY: 2.5,
};

let cachedNfcBase: THREE.BufferGeometry | null = null;

function normalize(geom: THREE.BufferGeometry): THREE.BufferGeometry {
  geom.computeBoundingBox();
  const bb = geom.boundingBox!;
  const cx = (bb.min.x + bb.max.x) / 2;
  const cy = (bb.min.y + bb.max.y) / 2;
  geom.translate(-cx, -cy, -bb.min.z);
  geom.computeVertexNormals();
  return geom;
}

async function loadStl(url: string): Promise<THREE.BufferGeometry> {
  const loader = new STLLoader();
  const buf = await fetch(url).then((r) => {
    if (!r.ok) throw new Error(`Failed to load ${url}: ${r.status}`);
    return r.arrayBuffer();
  });
  return normalize(loader.parse(buf));
}

async function getBase(): Promise<THREE.BufferGeometry> {
  if (!cachedNfcBase) cachedNfcBase = await loadStl("/models/nfc_base.stl");
  return cachedNfcBase.clone();
}

const svgCache = new Map<string, Promise<string>>();

function loadIconSvg(slug: string): Promise<string> {
  let cached = svgCache.get(slug);
  if (!cached) {
    cached = fetch(iconSvgUrl(slug))
      .then((r) => {
        if (!r.ok) throw new Error(`Icon '${slug}' could not be loaded (${r.status})`);
        return r.text();
      })
      .then((svg) => {
        if (!svg.includes("<svg")) throw new Error(`Icon '${slug}' did not return SVG data`);
        return svg;
      });
    cached.catch(() => svgCache.delete(slug));
    svgCache.set(slug, cached);
  }
  return cached;
}

// Parse an SVG document and extrude every filled shape to the given depth.
function extrudeSvg(svg: string, depth: number): THREE.BufferGeometry {
  const loader = new SVGLoader();
  const data = loader.parse(svg);
  const geometries: THREE.BufferGeometry[] = [];

  for (const path of data.paths) {
    const shapes = SVGLoader.createShapes(path);
    for (const shape of shapes) {
      geometries.push(
        new THREE.ExtrudeGeometry(shape, {
          depth,
          bevelEnabled: false,
          curveSegments: 16,
        }),
      );
    }
  }

  if (geometries.length === 0) throw new Error("No printable outlines found");

  const merged = mergeGeometries(geometries, false);
  if (!merged) throw new Error("Failed to merge outlines into a solid");
  return merged;
}

function buildIconGeometry(
  svg: string,
  base: THREE.BufferGeometry,
  opts: NfcOptions,
): THREE.BufferGeometry {
  // Sink the icon slightly into the base: coplanar faces z-fight in the
  // preview, and the overlap fuses the two parts when slicing.
  const EMBED = 0.2;
  const merged = extrudeSvg(svg, opts.topThickness + EMBED);

  base.computeBoundingBox();
  const baseBox = base.boundingBox!;
  const baseW = baseBox.max.x - baseBox.min.x;
  const baseH = baseBox.max.y - baseBox.min.y;
  const topZ = baseBox.max.z;

  merged.computeBoundingBox();
  const iconBox = merged.boundingBox!;
  const iconW = iconBox.max.x - iconBox.min.x;
  const iconH = iconBox.max.y - iconBox.min.y;
  const scale = (Math.min(baseW, baseH) * opts.iconScale) / Math.max(iconW, iconH);

  // Mirror Y (SVG y-axis points down) AND Z so the determinant stays
  // positive: a single negative axis flips triangle winding, turning the
  // mesh inside-out (top faces get culled and only side walls show).
  merged.scale(scale, -scale, -1);
  normalize(merged);
  // Positive iconOffsetY moves the icon "down" (toward the keyring tail side)
  // in the preview, compensating for the tail offsetting the base bbox center.
  merged.translate(0, -opts.iconOffsetY, topZ - EMBED);
  merged.computeVertexNormals();
  return merged;
}

// Depth of the name inlay on the back face (3 layers at 0.2mm).
const TEXT_DEPTH = 0.6;

let cachedWatermark: THREE.BufferGeometry | null = null;

async function getWatermark(): Promise<THREE.BufferGeometry> {
  if (!cachedWatermark)
    cachedWatermark = await loadStl("/models/tmtt_watermark.stl");
  return cachedWatermark.clone();
}

// Brand watermark inlaid into the back face when no name is engraved. Sized
// and placed with the same options as the name so the existing sliders apply.
async function buildWatermarkGeometry(
  base: THREE.BufferGeometry,
  opts: NfcOptions,
): Promise<THREE.BufferGeometry> {
  const wm = await getWatermark();

  base.computeBoundingBox();
  const baseBox = base.boundingBox!;
  const baseW = baseBox.max.x - baseBox.min.x;
  const baseH = baseBox.max.y - baseBox.min.y;

  wm.computeBoundingBox();
  const wmBox = wm.boundingBox!;
  const wmW = wmBox.max.x - wmBox.min.x;
  const wmH = wmBox.max.y - wmBox.min.y;
  const wmD = wmBox.max.z - wmBox.min.z;

  // Fit to the requested width but never taller than half the base, and
  // flatten to the same inlay depth as the name.
  const scale = Math.min((baseW * opts.backTextScale) / wmW, (baseH * 0.5) / wmH);
  wm.scale(scale, scale, TEXT_DEPTH / wmD);
  normalize(wm);
  wm.translate(0, -opts.backTextOffsetY, 0);
  wm.computeVertexNormals();
  return wm;
}

function buildBackTextGeometry(
  font: Font,
  base: THREE.BufferGeometry,
  opts: NfcOptions,
): THREE.BufferGeometry {
  const shapes = textToShapes(font, opts.backText.trim());
  if (shapes.length === 0) throw new Error("The name has no printable outlines");
  const merged = mergeGeometries(
    shapes.map(
      (shape) =>
        new THREE.ExtrudeGeometry(shape, {
          depth: TEXT_DEPTH,
          bevelEnabled: false,
        }),
    ),
    false,
  );
  if (!merged) throw new Error("Failed to build the name geometry");

  base.computeBoundingBox();
  const baseBox = base.boundingBox!;
  const baseW = baseBox.max.x - baseBox.min.x;
  const baseH = baseBox.max.y - baseBox.min.y;

  merged.computeBoundingBox();
  const textBox = merged.boundingBox!;
  const textW = textBox.max.x - textBox.min.x;
  const textH = textBox.max.y - textBox.min.y;
  // Fit to the requested width but never taller than half the base.
  const scale = Math.min(
    (baseW * opts.backTextScale) / textW,
    (baseH * 0.5) / textH,
  );

  // Mirror X in addition to the SVG y-flip (determinant stays positive, so
  // winding is preserved): the text must read correctly from the back (-z).
  merged.scale(-scale, -scale, 1);
  normalize(merged);
  merged.translate(0, -opts.backTextOffsetY, 0);
  merged.computeVertexNormals();
  return merged;
}

// Carve the text volume out of the base so the name part sits flush in the
// back face — clean two-color bottom for the slicer, no hidden overlap.
// The subtraction takes seconds for curved text, so it runs in a worker.
let csgWorker: Worker | null = null;
let carveId = 0;
const pendingCarves = new Map<
  number,
  { resolve: (g: THREE.BufferGeometry) => void; reject: (e: Error) => void }
>();

function getCsgWorker(): Worker {
  if (!csgWorker) {
    csgWorker = new Worker(new URL("./csg.worker.ts", import.meta.url));
    csgWorker.onmessage = (
      e: MessageEvent<{ id: number; pos?: Float32Array; norm?: Float32Array; error?: string }>,
    ) => {
      const { id, pos, norm, error } = e.data;
      const pending = pendingCarves.get(id);
      if (!pending) return;
      pendingCarves.delete(id);
      if (error || !pos || !norm) {
        pending.reject(new Error(error ?? "Engraving failed"));
        return;
      }
      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geom.setAttribute("normal", new THREE.BufferAttribute(norm, 3));
      pending.resolve(geom);
    };
    csgWorker.onerror = (event) => {
      console.error("CSG worker error:", event);
      pendingCarves.forEach((pending) => {
        pending.reject(new Error(`Engraving worker failed: ${event.message ?? "unknown error"}`));
      });
      pendingCarves.clear();
      csgWorker?.terminate();
      csgWorker = null;
    };
  }
  return csgWorker;
}

function carve(
  base: THREE.BufferGeometry,
  cutter: THREE.BufferGeometry,
): Promise<THREE.BufferGeometry> {
  // Kill an in-flight job before starting a new one so rapid edits don't
  // queue up multi-second CSG runs; the superseded build is discarded by
  // the caller's latest-wins guard.
  if (pendingCarves.size > 0 && csgWorker) {
    csgWorker.terminate();
    csgWorker = null;
    pendingCarves.forEach((pending) => {
      pending.reject(new Error("Superseded by a newer build"));
    });
    pendingCarves.clear();
  }

  const id = ++carveId;
  const basePos = (base.getAttribute("position").array as Float32Array).slice();
  const cutterPos = (cutter.getAttribute("position").array as Float32Array).slice();

  return new Promise((resolve, reject) => {
    pendingCarves.set(id, { resolve, reject });
    getCsgWorker().postMessage({ id, basePos, cutterPos }, [
      basePos.buffer,
      cutterPos.buffer,
    ]);
  });
}

export async function buildNfc(
  opts: NfcOptions = DEFAULT_NFC_OPTIONS,
): Promise<{ objects: NfcObject[] }> {
  const base = await getBase();
  const svg = await loadIconSvg(opts.iconSlug);
  const icon = buildIconGeometry(svg, base, opts);

  const objects: NfcObject[] = [
    { name: "nfc_base", geometry: base, color: opts.baseColor, filament: 1 },
    { name: `nfc_${opts.iconSlug}`, geometry: icon, color: opts.topColor, filament: 2 },
  ];

  // The back face always carries an inlay: the engraved name when one is
  // set, otherwise the brand watermark.
  const hasName = opts.backText.trim().length > 0;
  const inlay = hasName
    ? buildBackTextGeometry(await loadFont(opts.backFont), base, opts)
    : await buildWatermarkGeometry(base, opts);

  // The inlay sits flush on the back face (z 0..TEXT_DEPTH). Used directly as
  // the CSG cutter, its bottom face is exactly coplanar with the base bottom
  // — coplanar faces make the subtraction numerically filthy (slivers,
  // cracks, T-junctions the slicer reports as open edges). Stretch the
  // cutter to poke through the bottom so every cut face is clearly inside
  // or outside the base; the carved recess itself is unchanged.
  const cutter = inlay.clone();
  cutter.scale(1, 1, (TEXT_DEPTH + 0.4) / TEXT_DEPTH);
  cutter.translate(0, 0, -0.4);
  objects[0].geometry = await carve(base, cutter);
  objects.push({
    name: hasName ? "nfc_name" : "nfc_watermark",
    geometry: inlay,
    color: opts.topColor,
    filament: 2,
  });

  return { objects };
}
