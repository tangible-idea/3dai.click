// Bambu Lab filament color catalog for print-ready color selection.
// Colors are grouped by material type; each swatch carries the official
// color name and its Bambu-published hex value.

export type FilamentType =
  | "PLA Matte"
  | "PLA Basic"
  | "PLA Pure"
  | "Generic";

export type Filament = {
  name: string;
  hex: string; // uppercase #RRGGBB
  type: FilamentType;
};

export const PLA_MATTE: Filament[] = [
  { name: "Ivory White", hex: "#FFFFFF", type: "PLA Matte" },
  { name: "Bone White", hex: "#CBC6B8", type: "PLA Matte" },
  { name: "Desert Tan", hex: "#E8DBB7", type: "PLA Matte" },
  { name: "Latte Brown", hex: "#D3B7A7", type: "PLA Matte" },
  { name: "Caramel", hex: "#AE835B", type: "PLA Matte" },
  { name: "Terracotta", hex: "#B15533", type: "PLA Matte" },
  { name: "Dark Brown", hex: "#7D6556", type: "PLA Matte" },
  { name: "Dark Chocolate", hex: "#4D3324", type: "PLA Matte" },
  { name: "Lilac Purple", hex: "#AE96D4", type: "PLA Matte" },
  { name: "Sakura Pink", hex: "#E8AFCF", type: "PLA Matte" },
  { name: "Mandarin Orange", hex: "#F99963", type: "PLA Matte" },
  { name: "Lemon Yellow", hex: "#F7D959", type: "PLA Matte" },
  { name: "Plum", hex: "#950051", type: "PLA Matte" },
  { name: "Scarlet Red", hex: "#DE4343", type: "PLA Matte" },
  { name: "Dark Red", hex: "#BB3D43", type: "PLA Matte" },
  { name: "Dark Green", hex: "#68724D", type: "PLA Matte" },
  { name: "Grass Green", hex: "#61C680", type: "PLA Matte" },
  { name: "Apple Green", hex: "#C2E189", type: "PLA Matte" },
  { name: "Ice Blue", hex: "#A3D8E1", type: "PLA Matte" },
  { name: "Sky Blue", hex: "#56B7E6", type: "PLA Matte" },
  { name: "Marine Blue", hex: "#0078BF", type: "PLA Matte" },
  { name: "Dark Blue", hex: "#042F56", type: "PLA Matte" },
  { name: "Ash Gray", hex: "#9B9EA0", type: "PLA Matte" },
  { name: "Nardo Gray", hex: "#757575", type: "PLA Matte" },
  { name: "Charcoal", hex: "#000000", type: "PLA Matte" },
];

export const PLA_BASIC: Filament[] = [
  { name: "Jade White", hex: "#FFFFFF", type: "PLA Basic" },
  { name: "Magenta", hex: "#EC008C", type: "PLA Basic" },
  { name: "Gold", hex: "#E4BD68", type: "PLA Basic" },
  { name: "Mistletoe Green", hex: "#3F8E43", type: "PLA Basic" },
  { name: "Red", hex: "#C12E1F", type: "PLA Basic" },
  { name: "Purple", hex: "#5E43B7", type: "PLA Basic" },
  { name: "Beige", hex: "#F7E6DE", type: "PLA Basic" },
  { name: "Pink", hex: "#F55A74", type: "PLA Basic" },
  { name: "Sunflower Yellow", hex: "#FEC600", type: "PLA Basic" },
  { name: "Bronze", hex: "#847D48", type: "PLA Basic" },
  { name: "Turquoise", hex: "#00B1B7", type: "PLA Basic" },
  { name: "Indigo Purple", hex: "#482960", type: "PLA Basic" },
  { name: "Light Gray", hex: "#D1D3D5", type: "PLA Basic" },
  { name: "Hot Pink", hex: "#F5547C", type: "PLA Basic" },
  { name: "Yellow", hex: "#F4EE2A", type: "PLA Basic" },
  { name: "Cocoa Brown", hex: "#6F5034", type: "PLA Basic" },
  { name: "Cyan", hex: "#0086D6", type: "PLA Basic" },
  { name: "Blue Grey", hex: "#5B6579", type: "PLA Basic" },
  { name: "Silver", hex: "#A6A9AA", type: "PLA Basic" },
  { name: "Orange", hex: "#FF6A13", type: "PLA Basic" },
  { name: "Bright Green", hex: "#BECF00", type: "PLA Basic" },
  { name: "Brown", hex: "#9D432C", type: "PLA Basic" },
  { name: "Blue", hex: "#0A2989", type: "PLA Basic" },
  { name: "Dark Gray", hex: "#545454", type: "PLA Basic" },
  { name: "Gray", hex: "#8E9089", type: "PLA Basic" },
  { name: "Pumpkin Orange", hex: "#FF9016", type: "PLA Basic" },
  { name: "Bambu Green", hex: "#00AE42", type: "PLA Basic" },
  { name: "Maroon Red", hex: "#9D2235", type: "PLA Basic" },
  { name: "Cobalt Blue", hex: "#0056B8", type: "PLA Basic" },
  { name: "Black", hex: "#000000", type: "PLA Basic" },
];

export const PLA_PURE: Filament[] = [
  { name: "Pure White", hex: "#FFFFFF", type: "PLA Pure" },
  { name: "Absolute Black", hex: "#000000", type: "PLA Pure" },
  { name: "Baby Blue", hex: "#A4DBE8", type: "PLA Pure" },
  { name: "Milky Pink", hex: "#F7CED7", type: "PLA Pure" },
  { name: "Apricot", hex: "#FFB673", type: "PLA Pure" },
];

// Generic recommended colors — vendor-neutral everyday palette for users who
// aren't printing with a specific Bambu spool.
export const GENERIC: Filament[] = [
  { name: "White", hex: "#FFFFFF", type: "Generic" },
  { name: "Light Gray", hex: "#C8C8C8", type: "Generic" },
  { name: "Gray", hex: "#808080", type: "Generic" },
  { name: "Dark Gray", hex: "#404040", type: "Generic" },
  { name: "Black", hex: "#000000", type: "Generic" },
  { name: "Red", hex: "#E5322A", type: "Generic" },
  { name: "Orange", hex: "#F57C00", type: "Generic" },
  { name: "Yellow", hex: "#FFD400", type: "Generic" },
  { name: "Green", hex: "#43A047", type: "Generic" },
  { name: "Teal", hex: "#009688", type: "Generic" },
  { name: "Sky Blue", hex: "#29B6F6", type: "Generic" },
  { name: "Blue", hex: "#1E88E5", type: "Generic" },
  { name: "Navy", hex: "#1A237E", type: "Generic" },
  { name: "Purple", hex: "#8E24AA", type: "Generic" },
  { name: "Pink", hex: "#EC407A", type: "Generic" },
  { name: "Brown", hex: "#6D4C41", type: "Generic" },
  { name: "Beige", hex: "#E8D6B3", type: "Generic" },
  { name: "Gold", hex: "#D4AF37", type: "Generic" },
  { name: "Silver", hex: "#B0B4B8", type: "Generic" },
];

export const FILAMENT_GROUPS: { type: FilamentType; filaments: Filament[] }[] = [
  { type: "PLA Matte", filaments: PLA_MATTE },
  { type: "PLA Basic", filaments: PLA_BASIC },
  { type: "PLA Pure", filaments: PLA_PURE },
  { type: "Generic", filaments: GENERIC },
];

const ALL_FILAMENTS = [...PLA_MATTE, ...PLA_BASIC, ...PLA_PURE, ...GENERIC];

// Look up the display label ("Type · Name") for a hex value. Since several
// filaments share a hex (e.g. Ivory White / Jade White both #FFFFFF), the
// first match wins — good enough for a display hint.
export function filamentLabel(hex: string): string | null {
  const target = hex.toUpperCase();
  const match = ALL_FILAMENTS.find((f) => f.hex === target);
  return match ? `${match.type} · ${match.name}` : null;
}
