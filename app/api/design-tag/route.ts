import { NextRequest, NextResponse } from "next/server";
import { FILAMENT_GROUPS, filamentByName } from "@/lib/filaments";
import { poeChat, poeModel, type PoeMode } from "@/lib/poe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The exact filament names the model may pick from, grouped by material.
const PALETTE = FILAMENT_GROUPS.map(
  (g) => `${g.type}: ${g.filaments.map((f) => f.name).join(", ")}`,
).join("\n");

const SYSTEM = `You configure a two-color, 3D-printed NFC tag from a short description. Choose real filament colors and a fitting icon.

Return ONLY a JSON object, no markdown or prose:
{"baseColor": "<name>", "iconColor": "<name>", "icon": "<keyword>", "name": "<text>"}

Rules:
- baseColor = the plate/background filament. iconColor = the icon (and engraved text) filament.
- Both MUST be EXACT names from the palette below. They MUST strongly contrast (one clearly light, one clearly dark) so the icon stays legible after printing.
- icon = ONE lowercase English keyword for the icon concept (e.g. "coffee", "heart", "camera", "music", "paw", "linkedin"). If the description implies a known brand, use that brand's name.
- name = a short text to engrave on the back (max 12 characters), or "" if none is implied.

Palette (use these exact names):
${PALETTE}`;

// WCAG relative luminance, for the contrast safety net.
function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const toLin = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const r = toLin(parseInt(h.slice(0, 2), 16) / 255);
  const g = toLin(parseInt(h.slice(2, 4), 16) / 255);
  const b = toLin(parseInt(h.slice(4, 6), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function extractJson(text: string): Record<string, unknown> | null {
  if (!text) return null;
  let s = text.trim();
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) s = fenced[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const key = process.env.POE_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "AI is not configured (missing POE_API_KEY)." },
      { status: 500 },
    );
  }

  let prompt = "";
  let mode: PoeMode = "fast";
  try {
    const body = await req.json();
    prompt = String(body?.prompt ?? "").trim();
    if (body?.mode === "detail") mode = "detail";
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!prompt) {
    return NextResponse.json(
      { error: "Describe the tag you want." },
      { status: 400 },
    );
  }
  if (prompt.length > 300) prompt = prompt.slice(0, 300);

  let content: string;
  try {
    content = await poeChat({
      apiKey: key,
      model: poeModel(mode),
      system: SYSTEM,
      user: `Describe the tag: ${prompt}`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generation failed." },
      { status: 502 },
    );
  }

  const parsed = extractJson(content);
  if (!parsed) {
    return NextResponse.json(
      { error: "The model returned an unexpected response. Try again." },
      { status: 422 },
    );
  }

  // Resolve colors to real SKUs, falling back to a safe high-contrast pair.
  const base =
    filamentByName(String(parsed.baseColor ?? "")) ??
    filamentByName("Charcoal")!;
  let top =
    filamentByName(String(parsed.iconColor ?? "")) ??
    filamentByName("Jade White")!;

  // Contrast safety net: if the two are too close, force black/white.
  if (Math.abs(luminance(base.hex) - luminance(top.hex)) < 0.3) {
    top =
      luminance(base.hex) > 0.5
        ? filamentByName("Charcoal")!
        : filamentByName("Jade White")!;
  }

  const icon = String(parsed.icon ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, "")
    .trim()
    .slice(0, 40);
  const name =
    typeof parsed.name === "string" ? parsed.name.trim().slice(0, 20) : "";

  return NextResponse.json({
    icon,
    name,
    baseColor: base.hex,
    baseColorName: `${base.type} · ${base.name}`,
    topColor: top.hex,
    topColorName: `${top.type} · ${top.name}`,
  });
}
