// Generates public/icons/catalog.json: the 8 featured brand logos plus the
// Font Awesome Free solid icon set (stars, hearts, arrows, ...).
// Run with: npm run icons
import { writeFileSync, mkdirSync } from "node:fs";
import * as si from "simple-icons";

// Must match FA_VERSION in lib/icons.ts (jsDelivr CDN URLs).
const FA_VERSION = "6.7.2";

// Brands that were removed from Simple Icons but that we serve from
// public/icons/<slug>.svg instead of the CDN.
const LOCAL_EXTRAS = [
  { slug: "linkedin", title: "LinkedIn", hex: "0A66C2", local: true },
];

// The featured brand logos kept from Simple Icons (see FEATURED_ICONS in
// app/page.tsx); everything else in the catalog is Font Awesome.
const BRAND_SLUGS = new Set([
  "instagram",
  "github",
  "youtube",
  "x",
  "facebook",
  "tiktok",
  "spotify",
]);

const brands = Object.values(si)
  .filter(
    (i) =>
      i &&
      typeof i === "object" &&
      typeof i.slug === "string" &&
      BRAND_SLUGS.has(i.slug),
  )
  .map((i) => ({ slug: i.slug, title: i.title, hex: i.hex }));

// Font Awesome Free ships no metadata JSON on the CDN, so list the solid
// SVGs through the jsDelivr file-listing API instead.
const listing = await fetch(
  `https://data.jsdelivr.com/v1/packages/npm/@fortawesome/fontawesome-free@${FA_VERSION}?structure=flat`,
).then((r) => {
  if (!r.ok) throw new Error(`jsDelivr listing failed: ${r.status}`);
  return r.json();
});

const titleCase = (slug) =>
  slug
    .split("-")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");

const fa = listing.files
  .map((f) => /^\/svgs\/solid\/(.+)\.svg$/.exec(f.name)?.[1])
  .filter(Boolean)
  .map((name) => ({
    // The fa- prefix routes iconSvgUrl() to the Font Awesome CDN.
    slug: `fa-${name}`,
    title: titleCase(name),
    hex: "1F2937",
  }));

const all = [...LOCAL_EXTRAS, ...brands, ...fa].sort((a, b) =>
  a.title.localeCompare(b.title, "en"),
);

mkdirSync("public/icons", { recursive: true });
writeFileSync("public/icons/catalog.json", JSON.stringify(all));
console.log(
  `Wrote ${all.length} icons (${brands.length + LOCAL_EXTRAS.length} brands + ${fa.length} Font Awesome) to public/icons/catalog.json`,
);
