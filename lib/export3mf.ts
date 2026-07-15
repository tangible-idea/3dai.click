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

function meshXml(geom: BufferGeometry): string {
  const pos = geom.getAttribute("position");
  const index = geom.getIndex();

  // Weld vertices that land on the same exported (rounded) position so shared
  // edges reference the same vertex ids. STL loads, SVG extrusions and CSG
  // results are non-indexed (each triangle owns 3 private vertices); exported
  // as-is every edge is unshared and slicers flag the whole mesh as open edges.
  const idByKey = new Map<string, number>();
  const verts: string[] = [];
  const vertexId = (i: number): number => {
    const x = num(pos.getX(i));
    const y = num(pos.getY(i));
    const z = num(pos.getZ(i));
    const key = `${x},${y},${z}`;
    let id = idByKey.get(key);
    if (id === undefined) {
      id = verts.length;
      idByKey.set(key, id);
      verts.push(`<vertex x="${x}" y="${y}" z="${z}"/>`);
    }
    return id;
  };

  const tris: string[] = [];
  const count = index ? index.count : pos.count;
  const at = (i: number) => (index ? index.getX(i) : i);
  for (let i = 0; i < count; i += 3) {
    const a = vertexId(at(i));
    const b = vertexId(at(i + 1));
    const c = vertexId(at(i + 2));
    // Triangles collapsed by the weld would themselves create open edges.
    if (a === b || b === c || c === a) continue;
    tris.push(`<triangle v1="${a}" v2="${b}" v3="${c}"/>`);
  }

  return `<mesh><vertices>${verts.join("")}</vertices><triangles>${tris.join("")}</triangles></mesh>`;
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
