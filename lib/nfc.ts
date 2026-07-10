import * as THREE from "three";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { iconSvgUrl } from "./icons";

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
}

export const DEFAULT_NFC_OPTIONS: NfcOptions = {
  iconSlug: "linkedin",
  baseColor: "#ff4fa3",
  topColor: "#ffffff",
  iconScale: 0.72,
  topThickness: 1,
  iconOffsetY: 2.5,
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

function buildIconGeometry(
  svg: string,
  base: THREE.BufferGeometry,
  opts: NfcOptions,
): THREE.BufferGeometry {
  // Sink the icon slightly into the base: coplanar faces z-fight in the
  // preview, and the overlap fuses the two parts when slicing.
  const EMBED = 0.2;

  const loader = new SVGLoader();
  const data = loader.parse(svg);
  const geometries: THREE.BufferGeometry[] = [];

  for (const path of data.paths) {
    const shapes = SVGLoader.createShapes(path);
    for (const shape of shapes) {
      geometries.push(
        new THREE.ExtrudeGeometry(shape, {
          depth: opts.topThickness + EMBED,
          bevelEnabled: false,
          curveSegments: 16,
        }),
      );
    }
  }

  if (geometries.length === 0) throw new Error("Selected icon has no printable paths");

  const merged = mergeGeometries(geometries, false);
  if (!merged) throw new Error("Failed to build icon geometry");

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

export async function buildNfc(
  opts: NfcOptions = DEFAULT_NFC_OPTIONS,
): Promise<{ objects: NfcObject[] }> {
  const base = await getBase();
  const svg = await loadIconSvg(opts.iconSlug);
  const icon = buildIconGeometry(svg, base, opts);

  return {
    objects: [
      { name: "nfc_base", geometry: base, color: opts.baseColor, filament: 1 },
      { name: `nfc_${opts.iconSlug}`, geometry: icon, color: opts.topColor, filament: 2 },
    ],
  };
}
