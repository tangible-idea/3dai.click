import { NextRequest, NextResponse } from "next/server";

// AI icon generation via Poe's OpenAI-compatible API. The key stays server-side.
// https://creator.poe.com/docs/external-applications/openai-compatible-api
const POE_URL = "https://api.poe.com/v1/chat/completions";
const DEFAULT_MODEL = "Claude-Sonnet-4.6";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The SVG is extruded into a solid relief (SVGLoader.createShapes only turns
// FILLED regions into geometry — strokes are ignored). So the model must return
// a bold, single-color, fill-only silhouette.
const SYSTEM_PROMPT = `You design a single monochrome icon and output it as raw SVG markup. The SVG will be extruded into a solid 3D-printed relief.

Hard requirements:
- Output ONLY the SVG markup. No markdown fences, no prose, no explanation.
- Root element: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">.
- Use FILLED shapes only (<path>, <circle>, <rect>, <polygon>, <ellipse>) with a solid fill. NEVER rely on stroke — strokes are NOT extruded and vanish. Turn every outline/line into a filled shape that has real width.
- One flat color only (use fill="#000000"). No gradients, no opacity, no stroke, no filters, no <image>, no <text>, no CSS/<style>, no scripts.
- Bold, simple, high-contrast silhouette that stays legible at ~20mm. Merge into as few paths as possible.
- Keep all geometry inside the viewBox with a small margin.`;

// Pull the <svg>…</svg> block out of the model reply and strip anything unsafe
// or non-extrudable. Returns null when there is no usable drawing.
function extractSvg(text: string): string | null {
  if (!text) return null;
  let s = text.trim();
  const fenced = s.match(/```(?:svg|xml|html)?\s*([\s\S]*?)```/i);
  if (fenced) s = fenced[1].trim();

  const start = s.indexOf("<svg");
  const end = s.lastIndexOf("</svg>");
  if (start === -1 || end === -1 || end < start) return null;
  let svg = s.slice(start, end + "</svg>".length);

  // Defensive scrub — the SVG is only ever rendered via an <img> data URL and
  // parsed by SVGLoader (neither executes scripts), but strip them anyway.
  svg = svg
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "");

  // Must contain at least one drawable shape.
  if (!/<(path|circle|rect|polygon|ellipse)\b/i.test(svg)) return null;
  if (svg.length > 40_000) return null;
  return svg;
}

export async function POST(req: NextRequest) {
  const key = process.env.POE_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "AI generation is not configured (missing POE_API_KEY)." },
      { status: 500 },
    );
  }

  let prompt = "";
  try {
    const body = await req.json();
    prompt = String(body?.prompt ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!prompt) {
    return NextResponse.json(
      { error: "Describe the icon you want." },
      { status: 400 },
    );
  }
  if (prompt.length > 300) prompt = prompt.slice(0, 300);

  const model = process.env.POE_MODEL || DEFAULT_MODEL;

  let res: Response;
  try {
    res = await fetch(POE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Design an icon: ${prompt}` },
        ],
      }),
    });
  } catch {
    return NextResponse.json(
      { error: "Could not reach the Poe API." },
      { status: 502 },
    );
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return NextResponse.json(
      { error: `Poe API error (${res.status}). ${detail.slice(0, 200)}`.trim() },
      { status: 502 },
    );
  }

  const data = await res.json().catch(() => null);
  const content: string = data?.choices?.[0]?.message?.content ?? "";
  const svg = extractSvg(content);
  if (!svg) {
    return NextResponse.json(
      { error: "The model did not return a usable icon. Try rephrasing." },
      { status: 422 },
    );
  }

  return NextResponse.json({ svg });
}
