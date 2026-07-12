// Web Worker that runs the CSG subtraction for the back-name engrave off the
// main thread — it takes seconds for curved text, which would freeze the UI.
import * as THREE from "three";
import { Brush, Evaluator, SUBTRACTION } from "three-bvh-csg";

interface CarveRequest {
  id: number;
  basePos: Float32Array;
  cutterPos: Float32Array;
}

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<CarveRequest>) => void) | null;
  postMessage: (msg: unknown, transfer?: Transferable[]) => void;
};

function fromPositions(pos: Float32Array): THREE.BufferGeometry {
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geom.computeVertexNormals();
  return geom;
}

console.log("[csg.worker] loaded");

ctx.onmessage = (e) => {
  const { id, basePos, cutterPos } = e.data;
  console.log("[csg.worker] carve start", id, basePos.length, cutterPos.length);
  try {
    const evaluator = new Evaluator();
    evaluator.attributes = ["position", "normal"];
    const base = new Brush(fromPositions(basePos));
    base.updateMatrixWorld();
    const cutter = new Brush(fromPositions(cutterPos));
    cutter.updateMatrixWorld();

    let geom = evaluator.evaluate(base, cutter, SUBTRACTION).geometry;
    if (geom.getIndex()) geom = geom.toNonIndexed();
    const pos = geom.getAttribute("position").array as Float32Array;
    const norm = geom.getAttribute("normal").array as Float32Array;
    console.log("[csg.worker] carve done", id, pos.length);
    ctx.postMessage({ id, pos, norm }, [pos.buffer, norm.buffer]);
  } catch (err) {
    ctx.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
