import * as THREE from "three";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import polygonClipping from "polygon-clipping";
import type { Font } from "opentype.js";

type Ring = [number, number][];

// Convert a text string into clean, non-overlapping outline shapes.
// Hangul glyphs are typically drawn as overlapping component strokes; the 2D
// union removes those self-intersections, which would otherwise make the
// engrave CSG step pathologically slow (17s -> ~2s for a two-syllable name).
export function textToShapes(
  font: Font,
  text: string,
  fontSize = 72,
): THREE.Shape[] {
  const path = font.getPath(text, 0, 0, fontSize);

  const shapePath = new THREE.ShapePath();
  for (const c of path.commands) {
    switch (c.type) {
      case "M":
        shapePath.moveTo(c.x!, c.y!);
        break;
      case "L":
        shapePath.lineTo(c.x!, c.y!);
        break;
      case "Q":
        shapePath.quadraticCurveTo(c.x1!, c.y1!, c.x!, c.y!);
        break;
      case "C":
        shapePath.bezierCurveTo(c.x1!, c.y1!, c.x2!, c.y2!, c.x!, c.y!);
        break;
      case "Z":
        shapePath.currentPath?.closePath();
        break;
    }
  }

  // createShapes needs the SVG fill style to resolve holes by winding.
  (shapePath as unknown as { userData: object }).userData = {
    style: { fill: "#000", fillOpacity: 1, fillRule: "nonzero" },
  };
  const rawShapes = SVGLoader.createShapes(shapePath);
  if (rawShapes.length === 0) return [];

  const toRing = (points: THREE.Vector2[]): Ring =>
    points.map((v) => [v.x, v.y]);
  const polygons = rawShapes.map((shape) => {
    const pts = shape.extractPoints(5);
    return [toRing(pts.shape), ...pts.holes.map(toRing)];
  });

  const unioned = polygonClipping.union(
    [polygons[0]],
    ...polygons.slice(1).map((p) => [p]),
  );

  // Every extra outline point multiplies the cost of the engrave CSG, so
  // decimate points that barely deviate from the line through their
  // neighbours. Tolerance is in font units (72pt em): ~0.24 units ends up
  // well under 0.1mm on a printed tag.
  const tolerance = fontSize / 300;
  const simplifyRing = (pts: THREE.Vector2[]): THREE.Vector2[] => {
    let ring = pts;
    for (let pass = 0; pass < 10; pass++) {
      const kept: THREE.Vector2[] = [];
      const n = ring.length;
      let removed = 0;
      let prevRemoved = false;
      for (let i = 0; i < n; i++) {
        const prev = ring[(i - 1 + n) % n];
        const next = ring[(i + 1) % n];
        const dx = next.x - prev.x;
        const dy = next.y - prev.y;
        const len = Math.hypot(dx, dy);
        const dist =
          len === 0
            ? Math.hypot(ring[i].x - prev.x, ring[i].y - prev.y)
            : Math.abs(
                dy * ring[i].x - dx * ring[i].y + next.x * prev.y - next.y * prev.x,
              ) / len;
        // Never remove two consecutive points in one pass: the second test
        // would measure against an already-removed neighbour.
        if (dist < tolerance && !prevRemoved && n - removed > 4) {
          removed++;
          prevRemoved = true;
        } else {
          kept.push(ring[i]);
          prevRemoved = false;
        }
      }
      ring = kept;
      if (removed === 0) break;
    }
    return ring;
  };

  const toVec2 = (ring: Ring): THREE.Vector2[] => {
    const pts = ring.map(([x, y]) => new THREE.Vector2(x, y));
    // polygon-clipping closes rings by repeating the first point.
    if (pts.length > 1 && pts[0].equals(pts[pts.length - 1])) pts.pop();
    return simplifyRing(pts);
  };

  return unioned.map((poly) => {
    const shape = new THREE.Shape(toVec2(poly[0] as Ring));
    for (let i = 1; i < poly.length; i++) {
      shape.holes.push(new THREE.Path(toVec2(poly[i] as Ring)));
    }
    return shape;
  });
}
