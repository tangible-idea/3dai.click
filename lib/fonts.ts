// Fonts available for the engraved name on the back of the tag.
// All are OFL-licensed Korean fonts served from /public/fonts and parsed
// client-side with opentype.js to extract printable outlines.
import { parse, type Font } from "opentype.js";

export interface FontOption {
  id: string;
  label: string;
  file: string;
  /** Matches the @font-face family in globals.css for UI previews. */
  cssFamily: string;
}

export const FONT_OPTIONS: FontOption[] = [
  { id: "jua", label: "Jua", file: "/fonts/Jua-Regular.ttf", cssFamily: "Jua" },
  {
    id: "gothica1",
    label: "Gothic A1",
    file: "/fonts/GothicA1-Bold.ttf",
    cssFamily: "Gothic A1",
  },
  {
    id: "plexkr",
    label: "IBM Plex Sans KR",
    file: "/fonts/IBMPlexSansKR-Bold.ttf",
    cssFamily: "IBM Plex Sans KR",
  },
  {
    id: "dohyeon",
    label: "Do Hyeon",
    file: "/fonts/DoHyeon-Regular.ttf",
    cssFamily: "Do Hyeon",
  },
];

export const DEFAULT_FONT_ID = FONT_OPTIONS[0].id;

const fontCache = new Map<string, Promise<Font>>();

export function loadFont(id: string): Promise<Font> {
  const option = FONT_OPTIONS.find((f) => f.id === id) ?? FONT_OPTIONS[0];
  let cached = fontCache.get(option.id);
  if (!cached) {
    cached = fetch(option.file)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load font '${option.label}'`);
        return r.arrayBuffer();
      })
      .then((buf) => parse(buf));
    cached.catch(() => fontCache.delete(option.id));
    fontCache.set(option.id, cached);
  }
  return cached;
}
