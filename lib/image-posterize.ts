// Quantize an uploaded image into N colors and produce a grid of palette indices.
// Runs in the browser (uses canvas). Used to build the multicolor top layers.

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface PosterizeResult {
  palette: RGB[];
  /** gridW * gridH, row-major. Each cell holds an index into `palette`, or 255 for transparent/empty. */
  grid: Uint8Array;
  gridW: number;
  gridH: number;
}

const EMPTY = 255;

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

interface Box {
  pixels: RGB[];
}

function colorRange(pixels: RGB[]): { channel: "r" | "g" | "b"; range: number } {
  let rMin = 255,
    rMax = 0,
    gMin = 255,
    gMax = 0,
    bMin = 255,
    bMax = 0;
  for (const p of pixels) {
    if (p.r < rMin) rMin = p.r;
    if (p.r > rMax) rMax = p.r;
    if (p.g < gMin) gMin = p.g;
    if (p.g > gMax) gMax = p.g;
    if (p.b < bMin) bMin = p.b;
    if (p.b > bMax) bMax = p.b;
  }
  const rr = rMax - rMin;
  const gr = gMax - gMin;
  const br = bMax - bMin;
  if (rr >= gr && rr >= br) return { channel: "r", range: rr };
  if (gr >= rr && gr >= br) return { channel: "g", range: gr };
  return { channel: "b", range: br };
}

function averageColor(pixels: RGB[]): RGB {
  let r = 0,
    g = 0,
    b = 0;
  for (const p of pixels) {
    r += p.r;
    g += p.g;
    b += p.b;
  }
  const n = pixels.length || 1;
  return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
}

// Median-cut quantization. Simple and dependency-free.
function medianCut(pixels: RGB[], colorCount: number): RGB[] {
  if (pixels.length === 0) return [{ r: 0, g: 0, b: 0 }];
  let boxes: Box[] = [{ pixels }];
  while (boxes.length < colorCount) {
    // Split the box with the largest color range.
    let target = -1;
    let bestRange = -1;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].pixels.length < 2) continue;
      const { range } = colorRange(boxes[i].pixels);
      if (range > bestRange) {
        bestRange = range;
        target = i;
      }
    }
    if (target === -1) break; // nothing left to split

    const box = boxes[target];
    const { channel } = colorRange(box.pixels);
    const sorted = box.pixels.slice().sort((a, b) => a[channel] - b[channel]);
    const mid = Math.floor(sorted.length / 2);
    const a: Box = { pixels: sorted.slice(0, mid) };
    const b: Box = { pixels: sorted.slice(mid) };
    boxes.splice(target, 1, a, b);
  }
  return boxes.map((box) => averageColor(box.pixels));
}

function nearestPaletteIndex(c: RGB, palette: RGB[]): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const dr = c.r - palette[i].r;
    const dg = c.g - palette[i].g;
    const db = c.b - palette[i].b;
    const d = dr * dr + dg * dg + db * db;
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

export async function posterize(
  dataUrl: string,
  colorCount: number,
  gridW: number,
  gridH: number,
): Promise<PosterizeResult> {
  const img = await loadImage(dataUrl);

  const canvas = document.createElement("canvas");
  canvas.width = gridW;
  canvas.height = gridH;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

  // Fit image into the grid preserving aspect ratio, centered, transparent elsewhere.
  const scale = Math.min(gridW / img.width, gridH / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  const dx = (gridW - dw) / 2;
  const dy = (gridH - dh) / 2;
  ctx.clearRect(0, 0, gridW, gridH);
  ctx.drawImage(img, dx, dy, dw, dh);

  const { data } = ctx.getImageData(0, 0, gridW, gridH);

  // Collect opaque pixels for palette derivation.
  const opaque: RGB[] = [];
  const alpha = new Uint8Array(gridW * gridH);
  for (let i = 0; i < gridW * gridH; i++) {
    const a = data[i * 4 + 3];
    alpha[i] = a;
    if (a >= 128) {
      opaque.push({ r: data[i * 4], g: data[i * 4 + 1], b: data[i * 4 + 2] });
    }
  }

  const palette = medianCut(opaque, Math.max(1, colorCount));

  const grid = new Uint8Array(gridW * gridH);
  for (let i = 0; i < gridW * gridH; i++) {
    if (alpha[i] < 128) {
      grid[i] = EMPTY;
      continue;
    }
    const c: RGB = { r: data[i * 4], g: data[i * 4 + 1], b: data[i * 4 + 2] };
    grid[i] = nearestPaletteIndex(c, palette);
  }

  return { palette, grid, gridW, gridH };
}

export const EMPTY_CELL = EMPTY;

export function rgbToHex({ r, g, b }: RGB): string {
  const h = (n: number) => n.toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}
