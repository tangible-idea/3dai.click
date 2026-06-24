// Assemble the clicker model from an uploaded image + the two STL parts.
// All work happens client-side with three.js + three-bvh-csg.

import * as THREE from "three";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { Brush, Evaluator, SUBTRACTION } from "three-bvh-csg";
import {
  posterize,
  EMPTY_CELL,
  rgbToHex,
  type PosterizeResult,
} from "./image-posterize";

export interface ClickerObject {
  name: string;
  geometry: THREE.BufferGeometry;
  /** "#rrggbb" display color (also drives the slicer filament color). */
  color: string;
  /** 1-based filament / extruder index for Bambu multicolor. */
  filament: number;
}

export interface ClickerOptions {
  /** Square plate side length (mm). */
  plateSize: number;
  /** Plate thickness (mm). Must be >= clicker_base height to keep a closed bottom. */
  baseThickness: number;
  /** Thickness of the multicolor image layer on top (mm). */
  imageThickness: number;
  /** Number of colors to posterize the image into. */
  colorCount: number;
  /** Grid resolution used for the image layer (cells per side). */
  gridResolution: number;
}

export const DEFAULT_OPTIONS: ClickerOptions = {
  plateSize: 40,
  baseThickness: 16,
  imageThickness: 0.8,
  colorCount: 4,
  gridResolution: 96,
};

const BODY_COLOR = "#9aa0a6";
const INPUT_COLOR = "#3b3b3b";

let cachedBase: THREE.BufferGeometry | null = null;
let cachedInput: THREE.BufferGeometry | null = null;

/** Center geometry on XY and drop its minimum Z to 0. */
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

async function getParts(): Promise<{
  base: THREE.BufferGeometry;
  input: THREE.BufferGeometry;
}> {
  if (!cachedBase) cachedBase = await loadStl("/models/clicker_base.stl");
  if (!cachedInput) cachedInput = await loadStl("/models/clicker_input.stl");
  return { base: cachedBase.clone(), input: cachedInput.clone() };
}

/**
 * Build the body: a square plate with the clicker_base shape subtracted from
 * the top (the mechanism pocket).
 */
function buildBody(
  plateGeom: THREE.BufferGeometry,
  baseGeom: THREE.BufferGeometry,
  baseThickness: number,
): THREE.BufferGeometry {
  baseGeom.computeBoundingBox();
  const baseHeight = baseGeom.boundingBox!.max.z; // minZ already 0 after normalize
  // Sink the pocket so its opening is flush with the plate top.
  baseGeom.translate(0, 0, baseThickness - baseHeight);

  const plateBrush = new Brush(plateGeom);
  plateBrush.updateMatrixWorld();
  const baseBrush = new Brush(baseGeom);
  baseBrush.updateMatrixWorld();

  const evaluator = new Evaluator();
  evaluator.useGroups = false;
  // Only carry position + normal: the Box has uv but the STL doesn't, and the
  // evaluator requires every listed attribute on both operands.
  evaluator.attributes = ["position", "normal"];
  const result = evaluator.evaluate(plateBrush, baseBrush, SUBTRACTION);
  const geom = result.geometry.clone();
  geom.computeVertexNormals();
  return geom;
}

/**
 * Build an extruded mesh for all cells of `paletteIndex` using greedy
 * horizontal run-merging to keep triangle counts manageable.
 */
function buildColorLayer(
  post: PosterizeResult,
  paletteIndex: number,
  imageSize: number,
  z0: number,
  z1: number,
): THREE.BufferGeometry | null {
  const { grid, gridW, gridH } = post;
  const cell = imageSize / gridW;
  const half = imageSize / 2;

  const positions: number[] = [];
  const indices: number[] = [];

  const addBox = (gx0: number, gx1: number, gy: number) => {
    // World X spans grid columns [gx0, gx1]; flip Y so the image is upright.
    const x0 = -half + gx0 * cell;
    const x1 = -half + (gx1 + 1) * cell;
    const y1 = half - gy * cell;
    const y0 = half - (gy + 1) * cell;

    const base = positions.length / 3;
    // 8 corners: bottom 0-3, top 4-7
    positions.push(
      x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0,
      x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1,
    );
    const f = (a: number, b: number, c: number, d: number) => {
      indices.push(base + a, base + b, base + c, base + a, base + c, base + d);
    };
    f(4, 5, 6, 7); // top
    f(3, 2, 1, 0); // bottom
    f(0, 1, 5, 4); // -Y
    f(1, 2, 6, 5); // +X
    f(2, 3, 7, 6); // +Y
    f(3, 0, 4, 7); // -X
  };

  for (let gy = 0; gy < gridH; gy++) {
    let runStart = -1;
    for (let gx = 0; gx < gridW; gx++) {
      const on = grid[gy * gridW + gx] === paletteIndex;
      if (on && runStart === -1) {
        runStart = gx;
      } else if (!on && runStart !== -1) {
        addBox(runStart, gx - 1, gy);
        runStart = -1;
      }
    }
    if (runStart !== -1) addBox(runStart, gridW - 1, gy);
  }

  if (indices.length === 0) return null;

  const geom = new THREE.BufferGeometry();
  geom.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

export async function buildClicker(
  imageDataUrl: string,
  opts: ClickerOptions = DEFAULT_OPTIONS,
): Promise<{ objects: ClickerObject[]; posterize: PosterizeResult }> {
  const { base, input } = await getParts();

  const plate = new THREE.BoxGeometry(
    opts.plateSize,
    opts.plateSize,
    opts.baseThickness,
  );
  // BoxGeometry is centered on origin; lift so it sits on z=0.
  plate.translate(0, 0, opts.baseThickness / 2);

  const objects: ClickerObject[] = [];

  // 1) Body = plate - clicker_base pocket.
  const body = buildBody(plate, base, opts.baseThickness);
  objects.push({ name: "body", geometry: body, color: BODY_COLOR, filament: 1 });

  // 2) Multicolor image layers on the top face.
  const post = await posterize(
    imageDataUrl,
    opts.colorCount,
    opts.gridResolution,
    opts.gridResolution,
  );
  const z0 = opts.baseThickness;
  const z1 = opts.baseThickness + opts.imageThickness;
  let filament = 2;
  for (let i = 0; i < post.palette.length; i++) {
    const geom = buildColorLayer(post, i, opts.plateSize, z0, z1);
    if (!geom) continue;
    objects.push({
      name: `image_color_${i + 1}`,
      geometry: geom,
      color: rgbToHex(post.palette[i]),
      filament: filament++,
    });
  }

  // 3) clicker_input on top of the image layer.
  input.translate(0, 0, z1);
  objects.push({
    name: "input",
    geometry: input,
    color: INPUT_COLOR,
    filament: filament,
  });

  return { objects, posterize: post };
}

export { EMPTY_CELL };
