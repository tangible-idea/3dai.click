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

  const verts: string[] = [];
  for (let i = 0; i < pos.count; i++) {
    verts.push(
      `<vertex x="${num(pos.getX(i))}" y="${num(pos.getY(i))}" z="${num(pos.getZ(i))}"/>`,
    );
  }

  const tris: string[] = [];
  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      tris.push(
        `<triangle v1="${index.getX(i)}" v2="${index.getX(i + 1)}" v3="${index.getX(i + 2)}"/>`,
      );
    }
  } else {
    for (let i = 0; i < pos.count; i += 3) {
      tris.push(`<triangle v1="${i}" v2="${i + 1}" v3="${i + 2}"/>`);
    }
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

  // Objects start at id=2 (id=1 is the basematerials group).
  const objXml: string[] = [];
  const buildItems: string[] = [];
  objects.forEach((o, i) => {
    const id = i + 2;
    objXml.push(
      `<object id="${id}" type="model" pid="1" pindex="${i}">${meshXml(o.geometry)}</object>`,
    );
    buildItems.push(`<item objectid="${id}"/>`);
  });

  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
<resources>
<basematerials id="1">${bases}</basematerials>
${objXml.join("\n")}
</resources>
<build>
${buildItems.join("\n")}
</build>
</model>`;

  // Bambu Studio: per-object filament assignment.
  const settings = `<?xml version="1.0" encoding="UTF-8"?>
<config>
${objects
  .map(
    (o, i) =>
      `  <object id="${i + 2}">
    <metadata key="name" value="${o.name}"/>
    <metadata key="extruder" value="${o.filament}"/>
  </object>`,
  )
  .join("\n")}
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
