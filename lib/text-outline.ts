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
    const pts = shape.extractPoints(8);
    return [toRing(pts.shape), ...pts.holes.map(toRing)];
  });

  const unioned = polygonClipping.union(
    [polygons[0]],
    ...polygons.slice(1).map((p) => [p]),
  );

  const toVec2 = (ring: Ring): THREE.Vector2[] => {
    const pts = ring.map(([x, y]) => new THREE.Vector2(x, y));
    // polygon-clipping closes rings by repeating the first point.
    if (pts.length > 1 && pts[0].equals(pts[pts.length - 1])) pts.pop();
    return pts;
  };

  return unioned.map((poly) => {
    const shape = new THREE.Shape(toVec2(poly[0] as Ring));
    for (let i = 1; i < poly.length; i++) {
      shape.holes.push(new THREE.Path(toVec2(poly[i] as Ring)));
    }
    return shape;
  });
}
