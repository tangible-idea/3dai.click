import * as THREE from "three";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

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

async function loadSimpleIcon(slug: string): Promise<string> {
  const url = `https://cdn.simpleicons.org/${encodeURIComponent(slug)}/111111`;
  const svg = await fetch(url).then((r) => {
    if (!r.ok) throw new Error(`Failed to load icon '${slug}' from Simple Icons`);
    return r.text();
  });
  if (!svg.includes("<svg")) throw new Error(`Icon '${slug}' did not return SVG data`);
  return svg;
}

function buildIconGeometry(
  svg: string,
  base: THREE.BufferGeometry,
  opts: NfcOptions,
): THREE.BufferGeometry {
  const loader = new SVGLoader();
  const data = loader.parse(svg);
  const geometries: THREE.BufferGeometry[] = [];

  for (const path of data.paths) {
    const shapes = SVGLoader.createShapes(path);
    for (const shape of shapes) {
      geometries.push(
        new THREE.ExtrudeGeometry(shape, {
          depth: opts.topThickness,
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

  merged.scale(scale, -scale, 1);
  normalize(merged);
  // Positive iconOffsetY moves the icon "down" (toward the keyring tail side)
  // in the preview, compensating for the tail offsetting the base bbox center.
  merged.translate(0, -opts.iconOffsetY, topZ);
  merged.computeVertexNormals();
  return merged;
}

export async function buildNfc(
  opts: NfcOptions = DEFAULT_NFC_OPTIONS,
): Promise<{ objects: NfcObject[] }> {
  const base = await getBase();
  const svg = await loadSimpleIcon(opts.iconSlug);
  const icon = buildIconGeometry(svg, base, opts);

  return {
    objects: [
      { name: "nfc_base", geometry: base, color: opts.baseColor, filament: 1 },
      { name: `nfc_${opts.iconSlug}`, geometry: icon, color: opts.topColor, filament: 2 },
    ],
  };
}
