// Shared server-side helper for Poe's OpenAI-compatible API.
// https://creator.poe.com/docs/external-applications/openai-compatible-api
const POE_URL = "https://api.poe.com/v1/chat/completions";

export type PoeMode = "fast" | "detail";

// "fast" trades polish for speed; "detail" uses a stronger, slower model.
// Both are env-overridable.
export function poeModel(mode: PoeMode): string {
  if (mode === "detail") {
    return (
      process.env.POE_MODEL_DETAIL ||
      process.env.POE_MODEL ||
      "Claude-Sonnet-4.6"
    );
  }
  return process.env.POE_MODEL_FAST || "Gemini-3.6-Flash";
}

// Single-turn chat completion. Throws on transport or API errors; returns the
// assistant message text otherwise.
export async function poeChat(opts: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  temperature?: number;
}): Promise<string> {
  let res: Response;
  try {
    res = await fetch(POE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify({
        model: opts.model,
        temperature: opts.temperature ?? 0.4,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
      }),
    });
  } catch {
    throw new Error("Could not reach the Poe API.");
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Poe API error (${res.status}). ${detail.slice(0, 200)}`.trim());
  }

  const data = await res.json().catch(() => null);
  return (data?.choices?.[0]?.message?.content as string) ?? "";
}
