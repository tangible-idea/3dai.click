// Minimal 3MF writer for Bambu Studio multicolor output.
// Each ClickerObject becomes its own 3MF object with a base material (color)
// and an extruder/filament assignment via Metadata/model_settings.config.

import { zipSync, strToU8 } from "fflate";
import type { BufferGeometry } from "three";
import type { ClickerObject } from "./clicker";

function num(v: number): string {
  // Compact fixed-precision (microns) without exponential notation.
  return (Math.round(v * 1000) / 1000).toString();
}

function hexToDisplayColor(hex: string): string {
  // 3MF displaycolor is #RRGGBBAA.
  const h = hex.replace("#", "");
  return `#${h.length === 6 ? h : "000000"}FF`.toUpperCase();
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

// Weld vertices that land on the same exported (rounded) position so shared
// edges reference the same vertex ids. STL loads, SVG extrusions and CSG
// results are non-indexed (each triangle owns 3 private vertices); exported
// as-is every edge is unshared and slicers flag the whole mesh as open edges.
function weldMesh(geom: BufferGeometry): { pos: number[]; tris: number[] } {
  const posAttr = geom.getAttribute("position");
  const index = geom.getIndex();

  const idByKey = new Map<string, number>();
  const pos: number[] = [];
  const tris: number[] = [];

  const count = index ? index.count : posAttr.count;
  const at = (i: number) => (index ? index.getX(i) : i);
  const vertexId = (i: number): number => {
    const x = round3(posAttr.getX(i));
    const y = round3(posAttr.getY(i));
    const z = round3(posAttr.getZ(i));
    const key = `${x},${y},${z}`;
    let id = idByKey.get(key);
    if (id === undefined) {
      id = pos.length / 3;
      idByKey.set(key, id);
      pos.push(x, y, z);
    }
    return id;
  };

  for (let i = 0; i < count; i += 3) {
    tris.push(vertexId(at(i)), vertexId(at(i + 1)), vertexId(at(i + 2)));
  }

  return { pos, tris: dedupeTris(tris) };
}

// Drop degenerate triangles (repeated vertex) and duplicates over the same 3
// vertices: a same-winding copy is redundant, an opposite-winding pair is a
// zero-thickness flap — both corrupt the edge counts the slicer checks. Runs
// after welding AND at the end of the repair pipeline, whose fan/cap stages
// can produce this garbage themselves.
function dedupeTris(tris: number[]): number[] {
  const byVerts = new Map<string, { a: number; b: number; c: number }[]>();
  for (let i = 0; i < tris.length; i += 3) {
    const a = tris[i];
    const b = tris[i + 1];
    const c = tris[i + 2];
    if (a === b || b === c || c === a) continue;
    const key = [a, b, c].sort((x, y) => x - y).join(",");
    const list = byVerts.get(key);
    if (list) list.push({ a, b, c });
    else byVerts.set(key, [{ a, b, c }]);
  }
  const out: number[] = [];
  byVerts.forEach((list) => {
    const sameWinding = (
      t: { a: number; b: number; c: number },
      u: { a: number; b: number; c: number },
    ) =>
      (t.a === u.a && t.b === u.b) ||
      (t.a === u.b && t.b === u.c) ||
      (t.a === u.c && t.b === u.a);
    // Cancel opposite-winding pairs, then keep one triangle per remaining
    // winding orientation.
    let forward = 0;
    let backward = 0;
    for (const t of list) {
      if (sameWinding(t, list[0])) forward++;
      else backward++;
    }
    if (forward > backward) {
      out.push(list[0].a, list[0].b, list[0].c);
    } else if (backward > forward) {
      const flipped = list.filter((t) => !sameWinding(t, list[0]))[0];
      out.push(flipped.a, flipped.b, flipped.c);
    }
    // Equal counts cancel out completely (zero-thickness flap).
  });
  return out;
}

// CSG output (three-bvh-csg) is not watertight at the cut line, in two ways:
//  - T-junctions: only intersected triangles get split, so the unsplit
//    neighbor keeps a long edge with the new vertices sitting ON it.
//  - Micro-cracks: float error leaves sliver gaps a few µm wide.
// Repair loop per pass: first collapse micro boundary edges (closes cracks and
// near-endpoint T-points), then insert boundary vertices that lie on a longer
// boundary edge and re-triangulate. Repeats because each fix can expose the
// matching fix on the opposite side.
// All tolerances are far below FDM printing resolution (~50µm+), so the
// repairs are invisible in the print; they only make the mesh watertight.
const T_EPS = 0.012; // max distance (mm) from a vertex to the edge it splits
const COLLAPSE_EPS = 0.02; // boundary edges shorter than this are welded shut
const CLUSTER_EPS = 0.015; // boundary vertices closer than this are merged
function repairTJunctions(pos: number[], tris: number[]): number[] {
  // One repair sweep. `wide` opens up the insertion candidates from boundary
  // vertices to all vertices — only safe on a small residue (see below).
  const runPasses = (tEps: number, clusterEps: number, wide: boolean): void => {
  for (let pass = 0; pass < 10; pass++) {
    const edgeCount = new Map<string, number>();
    const edgeKey = (u: number, v: number) => (u < v ? `${u},${v}` : `${v},${u}`);
    for (let i = 0; i < tris.length; i += 3) {
      for (let e = 0; e < 3; e++) {
        const k = edgeKey(tris[i + e], tris[i + ((e + 1) % 3)]);
        edgeCount.set(k, (edgeCount.get(k) ?? 0) + 1);
      }
    }

    const boundaryVerts = new Set<number>();
    const boundaryEdges: [number, number][] = [];
    edgeCount.forEach((c, k) => {
      if (c !== 1) return;
      const [u, v] = k.split(",").map(Number);
      boundaryEdges.push([u, v]);
      boundaryVerts.add(u);
      boundaryVerts.add(v);
    });
    if (boundaryEdges.length === 0) break;
    const candidates: number[] = [];
    boundaryVerts.forEach((v) => candidates.push(v));
    const insertCandidates: number[] = [];
    if (wide) {
      for (let v = 0; v < pos.length / 3; v++) insertCandidates.push(v);
    } else {
      insertCandidates.push(...candidates);
    }

    // --- weld shut micro gaps (union-find over boundary vertices) ----------
    // Merges (a) endpoints of very short boundary edges (sliver cracks) and
    // (b) any two boundary vertices nearly at the same spot but on opposite
    // sides of a crack.
    const parent = new Map<number, number>();
    const find = (x: number): number => {
      let r = x;
      while (parent.get(r) !== undefined && parent.get(r) !== r) r = parent.get(r)!;
      if (r !== x) parent.set(x, r);
      return r;
    };
    const union = (u: number, v: number): boolean => {
      if (parent.get(u) === undefined) parent.set(u, u);
      if (parent.get(v) === undefined) parent.set(v, v);
      const ru = find(u);
      const rv = find(v);
      if (ru === rv) return false;
      parent.set(rv, ru);
      return true;
    };
    const dist2 = (u: number, v: number): number => {
      const dx = pos[u * 3] - pos[v * 3];
      const dy = pos[u * 3 + 1] - pos[v * 3 + 1];
      const dz = pos[u * 3 + 2] - pos[v * 3 + 2];
      return dx * dx + dy * dy + dz * dz;
    };
    let collapsed = false;
    for (const [u, v] of boundaryEdges) {
      if (dist2(u, v) >= COLLAPSE_EPS * COLLAPSE_EPS) continue;
      if (union(u, v)) collapsed = true;
    }
    for (let a = 0; a < candidates.length; a++) {
      for (let b = a + 1; b < candidates.length; b++) {
        if (dist2(candidates[a], candidates[b]) >= clusterEps * clusterEps) continue;
        if (union(candidates[a], candidates[b])) collapsed = true;
      }
    }
    if (collapsed) {
      const remapped: number[] = [];
      const resolve = (x: number) => (parent.get(x) === undefined ? x : find(x));
      for (let i = 0; i < tris.length; i += 3) {
        const a = resolve(tris[i]);
        const b = resolve(tris[i + 1]);
        const c = resolve(tris[i + 2]);
        if (a === b || b === c || c === a) continue;
        remapped.push(a, b, c);
      }
      tris = remapped;
      continue; // boundary changed — recompute before inserting T-points
    }

    // --- T-junction insertion ---
    let changed = false;
    const next: number[] = [];
    for (let i = 0; i < tris.length; i += 3) {
      const corner = [tris[i], tris[i + 1], tris[i + 2]];
      // Per-edge insertions, as t along u->v.
      const inserts: { t: number; w: number }[][] = [[], [], []];
      let has = false;
      for (let e = 0; e < 3; e++) {
        const u = corner[e];
        const v = corner[(e + 1) % 3];
        if (edgeCount.get(edgeKey(u, v)) !== 1) continue;
        const ux = pos[u * 3], uy = pos[u * 3 + 1], uz = pos[u * 3 + 2];
        const dx = pos[v * 3] - ux, dy = pos[v * 3 + 1] - uy, dz = pos[v * 3 + 2] - uz;
        const len2 = dx * dx + dy * dy + dz * dz;
        if (len2 < (3 * tEps) ** 2) continue; // too short to split
        // Cheap AABB reject bounds for candidates near this edge.
        const minX = Math.min(ux, ux + dx) - tEps, maxX = Math.max(ux, ux + dx) + tEps;
        const minY = Math.min(uy, uy + dy) - tEps, maxY = Math.max(uy, uy + dy) + tEps;
        const minZ = Math.min(uz, uz + dz) - tEps, maxZ = Math.max(uz, uz + dz) + tEps;
        for (const w of insertCandidates) {
          if (w === u || w === v) continue;
          const awx = pos[w * 3], awy = pos[w * 3 + 1], awz = pos[w * 3 + 2];
          if (awx < minX || awx > maxX || awy < minY || awy > maxY || awz < minZ || awz > maxZ)
            continue;
          const wx = awx - ux, wy = awy - uy, wz = awz - uz;
          const t = (wx * dx + wy * dy + wz * dz) / len2;
          if (t <= 0 || t >= 1) continue;
          const px = wx - t * dx, py = wy - t * dy, pz = wz - t * dz;
          if (px * px + py * py + pz * pz > tEps * tEps) continue;
          // Keep clear of the endpoints so the split edges stay non-degenerate.
          if (t * t * len2 < tEps * tEps || (1 - t) * (1 - t) * len2 < tEps * tEps) continue;
          inserts[e].push({ t, w });
          has = true;
        }
      }

      if (!has) {
        next.push(corner[0], corner[1], corner[2]);
        continue;
      }
      changed = true;
      for (const list of inserts) list.sort((a, b) => a.t - b.t);

      const splitEdges = inserts.filter((l) => l.length > 0).length;
      if (splitEdges === 1) {
        // Fan from the opposite corner: a -> w1 ... wk -> b, all joined to c.
        const e = inserts.findIndex((l) => l.length > 0);
        const chain = [corner[e], ...inserts[e].map((x) => x.w), corner[(e + 1) % 3]];
        const c = corner[(e + 2) % 3];
        for (let j = 0; j < chain.length - 1; j++) next.push(chain[j], chain[j + 1], c);
      } else {
        // Insertions on 2+ edges: fan from the centroid, which is safely
        // interior so no fan triangle can collapse onto an edge.
        const poly: number[] = [];
        for (let e = 0; e < 3; e++) {
          poly.push(corner[e]);
          for (const x of inserts[e]) poly.push(x.w);
        }
        let cx = 0, cy = 0, cz = 0;
        for (const p of poly) {
          cx += pos[p * 3];
          cy += pos[p * 3 + 1];
          cz += pos[p * 3 + 2];
        }
        const n = poly.length;
        const ci = pos.length / 3;
        pos.push(round3(cx / n), round3(cy / n), round3(cz / n));
        for (let j = 0; j < n; j++) next.push(ci, poly[j], poly[(j + 1) % n]);
      }
    }

    tris = next;
    if (!changed) break;
  }
  };

  runPasses(T_EPS, CLUSTER_EPS, false);
  tris = removeFins(tris);

  // Escalate on the residue only: once just a handful of boundary edges are
  // left, wider tolerances and the full candidate set cannot cascade — they
  // just close the last few defects the strict pass missed by a few microns.
  for (const scale of [2, 4]) {
    const left = countBoundaryEdges(tris);
    if (left === 0 || left > 16) break;
    runPasses(T_EPS * scale, CLUSTER_EPS * scale, true);
    tris = removeFins(tris);
  }

  // The fan/cap stages above can emit degenerate or duplicated triangles;
  // clear those out before probing for membranes so the winding numbers and
  // edge counts are clean, and once more at the very end.
  tris = dedupeTris(tris);
  tris = removeInternalMembranes(pos, tris);
  tris = removeFins(tris);
  return dedupeTris(capSmallHoles(tris));
}

// Generalized winding number of the mesh around a point: ~1 inside the solid,
// ~0 outside (van Oosterom–Strackee solid angle per triangle).
function windingNumber(
  pos: number[],
  tris: number[],
  px: number,
  py: number,
  pz: number,
): number {
  let sum = 0;
  for (let i = 0; i < tris.length; i += 3) {
    const ax = pos[tris[i] * 3] - px, ay = pos[tris[i] * 3 + 1] - py, az = pos[tris[i] * 3 + 2] - pz;
    const bx = pos[tris[i + 1] * 3] - px, by = pos[tris[i + 1] * 3 + 1] - py, bz = pos[tris[i + 1] * 3 + 2] - pz;
    const cx = pos[tris[i + 2] * 3] - px, cy = pos[tris[i + 2] * 3 + 1] - py, cz = pos[tris[i + 2] * 3 + 2] - pz;
    const la = Math.sqrt(ax * ax + ay * ay + az * az);
    const lb = Math.sqrt(bx * bx + by * by + bz * bz);
    const lc = Math.sqrt(cx * cx + cy * cy + cz * cz);
    const det =
      ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
    const denom =
      la * lb * lc +
      (ax * bx + ay * by + az * bz) * lc +
      (bx * cx + by * cy + bz * cz) * la +
      (cx * ax + cy * ay + cz * az) * lb;
    sum += 2 * Math.atan2(det, denom);
  }
  return sum / (4 * Math.PI);
}

// CSG leaves patches of the cutter surface INSIDE the solid (internal
// membranes). Their rim edges are shared by 3+ triangles — the slicer's
// "non-manifold edges". A membrane triangle has solid on BOTH sides, a real
// surface triangle has outside on one side; probe each suspicious triangle
// (those touching an over-shared edge) with the winding number just off both
// faces and drop the ones buried in the solid.
const MEMBRANE_PROBE = 3e-3; // mm off the face; smaller than any real wall
function removeInternalMembranes(pos: number[], tris: number[]): number[] {
  for (let round = 0; round < 6; round++) {
    const edgeCount = new Map<string, number>();
    const edgeKey = (u: number, v: number) => (u < v ? `${u},${v}` : `${v},${u}`);
    for (let i = 0; i < tris.length; i += 3) {
      for (let e = 0; e < 3; e++) {
        const k = edgeKey(tris[i + e], tris[i + ((e + 1) % 3)]);
        edgeCount.set(k, (edgeCount.get(k) ?? 0) + 1);
      }
    }
    let hasOverShared = false;
    edgeCount.forEach((c) => {
      if (c > 2) hasOverShared = true;
    });
    if (!hasOverShared) break;

    const next: number[] = [];
    let removed = false;
    for (let i = 0; i < tris.length; i += 3) {
      let suspicious = false;
      for (let e = 0; e < 3; e++) {
        if (edgeCount.get(edgeKey(tris[i + e], tris[i + ((e + 1) % 3)]))! > 2) suspicious = true;
      }
      if (suspicious) {
        const a = tris[i] * 3, b = tris[i + 1] * 3, c = tris[i + 2] * 3;
        const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
        const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (nl > 1e-12) {
          nx /= nl;
          ny /= nl;
          nz /= nl;
          const mx = (pos[a] + pos[b] + pos[c]) / 3;
          const my = (pos[a + 1] + pos[b + 1] + pos[c + 1]) / 3;
          const mz = (pos[a + 2] + pos[b + 2] + pos[c + 2]) / 3;
          const wFront = windingNumber(
            pos, tris,
            mx + nx * MEMBRANE_PROBE, my + ny * MEMBRANE_PROBE, mz + nz * MEMBRANE_PROBE,
          );
          const wBack = windingNumber(
            pos, tris,
            mx - nx * MEMBRANE_PROBE, my - ny * MEMBRANE_PROBE, mz - nz * MEMBRANE_PROBE,
          );
          // Buried in the solid (or fully floating outside): not real surface.
          if (Math.min(wFront, wBack) > 0.4 || Math.max(wFront, wBack) < 0.4) {
            removed = true;
            continue;
          }
        }
      }
      next.push(tris[i], tris[i + 1], tris[i + 2]);
    }
    tris = next;
    if (!removed) break;
  }
  return tris;
}

function countBoundaryEdges(tris: number[]): number {
  const edgeCount = new Map<string, number>();
  const edgeKey = (u: number, v: number) => (u < v ? `${u},${v}` : `${v},${u}`);
  for (let i = 0; i < tris.length; i += 3) {
    for (let e = 0; e < 3; e++) {
      const k = edgeKey(tris[i + e], tris[i + ((e + 1) % 3)]);
      edgeCount.set(k, (edgeCount.get(k) ?? 0) + 1);
    }
  }
  let n = 0;
  edgeCount.forEach((c) => {
    if (c === 1) n++;
  });
  return n;
}

// Remove "fin" triangles: leftovers from CSG that sit on an edge shared by 3+
// triangles while another of their edges is a boundary. A healthy triangle
// has all edges shared by exactly 2, so this only ever deletes garbage; each
// deletion fixes an over-shared edge and a boundary edge at once.
function removeFins(tris: number[]): number[] {
  for (let round = 0; round < 8; round++) {
    const edgeCount = new Map<string, number>();
    const edgeKey = (u: number, v: number) => (u < v ? `${u},${v}` : `${v},${u}`);
    for (let i = 0; i < tris.length; i += 3) {
      for (let e = 0; e < 3; e++) {
        const k = edgeKey(tris[i + e], tris[i + ((e + 1) % 3)]);
        edgeCount.set(k, (edgeCount.get(k) ?? 0) + 1);
      }
    }
    const next: number[] = [];
    let removed = false;
    for (let i = 0; i < tris.length; i += 3) {
      let open = false;
      let over = false;
      for (let e = 0; e < 3; e++) {
        const n = edgeCount.get(edgeKey(tris[i + e], tris[i + ((e + 1) % 3)]))!;
        if (n === 1) open = true;
        else if (n > 2) over = true;
      }
      if (open && over) {
        removed = true;
        continue;
      }
      next.push(tris[i], tris[i + 1], tris[i + 2]);
    }
    tris = next;
    if (!removed) break;
  }
  return tris;
}

// Cap the degenerate sliver holes CSG occasionally leaves once welding and
// T-insertion are done: follow the remaining directed boundary edges into
// small loops and fan-fill them. Caps are wound opposite to the loop so they
// match the winding of the surrounding triangles.
const MAX_CAP_LOOP = 32;
function capSmallHoles(tris: number[]): number[] {
  const undirected = new Map<string, number>();
  const edgeKey = (u: number, v: number) => (u < v ? `${u},${v}` : `${v},${u}`);
  for (let i = 0; i < tris.length; i += 3) {
    for (let e = 0; e < 3; e++) {
      const k = edgeKey(tris[i + e], tris[i + ((e + 1) % 3)]);
      undirected.set(k, (undirected.get(k) ?? 0) + 1);
    }
  }

  const outgoing = new Map<number, number[]>();
  for (let i = 0; i < tris.length; i += 3) {
    for (let e = 0; e < 3; e++) {
      const u = tris[i + e];
      const v = tris[i + ((e + 1) % 3)];
      if (undirected.get(edgeKey(u, v)) !== 1) continue;
      const list = outgoing.get(u);
      if (list) list.push(v);
      else outgoing.set(u, [v]);
    }
  }
  if (outgoing.size === 0) return tris;

  const dirKey = (u: number, v: number) => `${u}>${v}`;
  const used = new Set<string>();
  const caps: number[] = [];
  outgoing.forEach((firsts, start) => {
    for (const first of firsts) {
      if (used.has(dirKey(start, first))) continue;
      const loop: number[] = [start];
      const path: string[] = [dirKey(start, first)];
      let cur = first;
      let closed = false;
      for (let step = 0; step < MAX_CAP_LOOP; step++) {
        if (cur === start) {
          closed = true;
          break;
        }
        loop.push(cur);
        const outs = (outgoing.get(cur) ?? []).filter(
          (n) => !used.has(dirKey(cur, n)) && path.indexOf(dirKey(cur, n)) === -1,
        );
        if (outs.length === 0) break;
        path.push(dirKey(cur, outs[0]));
        cur = outs[0];
      }
      if (!closed || loop.length < 3) continue;
      for (const k of path) used.add(k);
      for (let i = 1; i < loop.length - 1; i++) caps.push(loop[0], loop[i + 1], loop[i]);
    }
  });

  return caps.length ? tris.concat(caps) : tris;
}

function meshXml(geom: BufferGeometry): string {
  const { pos, tris: welded } = weldMesh(geom);
  const tris = repairTJunctions(pos, welded);

  const verts: string[] = [];
  for (let i = 0; i < pos.length; i += 3) {
    verts.push(`<vertex x="${num(pos[i])}" y="${num(pos[i + 1])}" z="${num(pos[i + 2])}"/>`);
  }
  const triXml: string[] = [];
  for (let i = 0; i < tris.length; i += 3) {
    triXml.push(`<triangle v1="${tris[i]}" v2="${tris[i + 1]}" v3="${tris[i + 2]}"/>`);
  }

  return `<mesh><vertices>${verts.join("")}</vertices><triangles>${triXml.join("")}</triangles></mesh>`;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`;

export function export3mf(objects: ClickerObject[]): Uint8Array {
  // Base material group (id=1): one entry per object, in order.
  const bases = objects
    .map((o) => `<base name="${o.name}" displaycolor="${hexToDisplayColor(o.color)}"/>`)
    .join("");

  // Mesh objects start at id=2 (id=1 is the basematerials group). They are
  // wrapped as components inside a single assembly object so Bambu Studio
  // imports them as ONE multi-part print object (not separate objects).
  const objXml: string[] = [];
  const components: string[] = [];
  objects.forEach((o, i) => {
    const id = i + 2;
    objXml.push(
      `<object id="${id}" type="model" pid="1" pindex="${i}">${meshXml(o.geometry)}</object>`,
    );
    components.push(`<component objectid="${id}"/>`);
  });

  const assemblyId = objects.length + 2;
  objXml.push(
    `<object id="${assemblyId}" type="model"><components>${components.join("")}</components></object>`,
  );

  // The BambuStudio:3mfVersion metadata is required: without it Bambu Studio
  // treats the file as a generic 3MF and ignores Metadata/model_settings.config
  // (so every part falls back to filament 1 = single color).
  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021">
<metadata name="Application">BambuStudio-02.00.00.00</metadata>
<metadata name="BambuStudio:3mfVersion">1</metadata>
<resources>
<basematerials id="1">${bases}</basematerials>
${objXml.join("\n")}
</resources>
<build>
<item objectid="${assemblyId}"/>
</build>
</model>`;

  // Bambu Studio: the assembly object holds each mesh as a part with its own
  // filament/extruder assignment.
  const settings = `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <object id="${assemblyId}">
    <metadata key="name" value="nfc"/>
    <metadata key="extruder" value="1"/>
${objects
  .map(
    (o, i) =>
      `    <part id="${i + 2}" subtype="normal_part">
      <metadata key="name" value="${o.name}"/>
      <metadata key="extruder" value="${o.filament}"/>
    </part>`,
  )
  .join("\n")}
  </object>
</config>`;

  return zipSync(
    {
      "[Content_Types].xml": strToU8(CONTENT_TYPES),
      "_rels/.rels": strToU8(RELS),
      "3D/3dmodel.model": strToU8(model),
      "Metadata/model_settings.config": strToU8(settings),
    },
    { level: 6 },
  );
}
