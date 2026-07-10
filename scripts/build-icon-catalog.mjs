// Generates public/icons/catalog.json from the simple-icons package so the
// UI can offer the full icon list without shipping every SVG path.
// Run with: npm run icons
import { writeFileSync, mkdirSync } from "node:fs";
import * as si from "simple-icons";

// Brands that were removed from Simple Icons but that we serve from
// public/icons/<slug>.svg instead of the CDN.
const LOCAL_EXTRAS = [
  { slug: "linkedin", title: "LinkedIn", hex: "0A66C2", local: true },
];

const icons = Object.values(si)
  .filter(
    (i) =>
      i &&
      typeof i === "object" &&
      typeof i.slug === "string" &&
      typeof i.title === "string",
  )
  .map((i) => ({ slug: i.slug, title: i.title, hex: i.hex }));

const bySlug = new Map(icons.map((i) => [i.slug, i]));
for (const extra of LOCAL_EXTRAS) bySlug.set(extra.slug, extra);

const all = [...bySlug.values()].sort((a, b) =>
  a.title.localeCompare(b.title, "en"),
);

mkdirSync("public/icons", { recursive: true });
writeFileSync("public/icons/catalog.json", JSON.stringify(all));
console.log(`Wrote ${all.length} icons to public/icons/catalog.json`);
