/**
 * Gemma 4 (via the Gemini API) understands anything you say to BEE-9 that the instant keyword path
 * didn't: "it's too loud", "calm it down", "give it some welly". It calls one function with the
 * commands to run plus BEE-9's in-character reply. Server-side so the key stays secret.
 */
const MODEL = "gemma-4-26b-a4b-it"; // mixture-of-experts: ~4B active parameters, quick for a live set

export type GemmaCommand = { action: string; layer?: string; place?: string; value?: number };
export type IntentRequest = {
  text: string;
  /** BEE-9's last few lines, so Gemma doesn't repeat itself. */
  recent?: string[];
  state: { volume: number; bpm: number; layers: string[]; place: string; muted: boolean };
};
export type IntentResponse = { commands: GemmaCommand[]; reply: string | null; error?: string };

const ACTIONS = [
  "layer_on", "layer_off", "all_layers_on", "all_layers_off",
  "volume_set", "volume_change", "mute", "unmute",
  "bpm_set", "bpm_change", "filter", "go_to", "next", "previous", "drop",
];

const SYSTEM = `You control NEON MANCUNIA, a live music instrument shaped like a rainy neon Manchester in 2087.
You are BEE-9, a cyber worker-bee DJ with a Mancunian voice ("our kid", "mint", "proper", "eh up").
The player talks to you mid-set. Work out what they want and call apply_commands exactly once.

Controls (use these actions):
- layer_on / layer_off with layer = drums | bass | lead | madchester | greggs
- all_layers_on / all_layers_off
- volume_set value 0-100 (percent) · volume_change value -60..60 (percent points) · mute · unmute
- bpm_set value 70-150 · bpm_change value -40..40
- filter value 0-100 (100 = fully open, ~30 = muffled)
- go_to place = piccadilly | northern_quarter | hacienda · next · previous
- drop (builds and drops the beat)

Read intent, not keywords: "too loud" = volume_change -20. "can't hear it" = volume_change +20 (and unmute if muted).
"calm down"/"chill" = bpm_change -10 and volume_change -10. "more energy"/"give it some welly" = bpm_change +10 plus drums on.
"too much going on" = turn off a couple of layers. "it's dead in here" = more layers on. Only use what's needed.
Only turn OFF layers listed as on, and only turn ON layers that aren't already on.
If they're just chatting, return no commands and a fun reply.
reply: ONE spoken line, max 16 words, Mancunian, saying what you did. No emojis, no quotes.
Vary it every time: never open with "Right you are", and don't reuse the openings of your recent lines.`;

const TOOL = {
  functionDeclarations: [
    {
      name: "apply_commands",
      description: "Apply the player's request to the live set and give BEE-9's spoken reply.",
      parameters: {
        type: "OBJECT",
        properties: {
          commands: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                action: { type: "STRING", enum: ACTIONS },
                layer: { type: "STRING", enum: ["drums", "bass", "lead", "madchester", "greggs"] },
                place: { type: "STRING", enum: ["piccadilly", "northern_quarter", "hacienda"] },
                value: { type: "NUMBER" },
              },
              required: ["action"],
            },
          },
          reply: { type: "STRING" },
        },
        required: ["commands", "reply"],
      },
    },
  ],
};

function describe(r: IntentRequest) {
  const s = r.state;
  return [
    `Player said: "${r.text.slice(0, 300)}"`,
    `Now: volume ${Math.round(s.volume * 100)}%${s.muted ? " (muted)" : ""}, ${s.bpm} BPM, place: ${s.place}.`,
    `Layers: ${["drums", "bass", "lead", "madchester", "greggs"].map((l) => `${l} ${s.layers.includes(l) ? "ON" : "off"}`).join(", ")}.`,
    r.recent?.length ? `Your recent lines (don't repeat their wording): ${r.recent.slice(-4).join(" | ")}` : "",
  ].join("\n");
}

/** Pull the function call out; fall back to JSON in plain text if the model answered that way. */
function extract(data: unknown): { commands: GemmaCommand[]; reply: string | null } | null {
  type Part = { functionCall?: { name: string; args?: { commands?: GemmaCommand[]; reply?: string } }; text?: string };
  const parts = ((data as { candidates?: { content?: { parts?: Part[] } }[] }).candidates?.[0]?.content?.parts ?? []) as Part[];
  const call = parts.find((p) => p.functionCall?.name === "apply_commands")?.functionCall;
  if (call) return { commands: Array.isArray(call.args?.commands) ? call.args!.commands : [], reply: call.args?.reply ?? null };
  const text = parts.map((p) => p.text ?? "").join("");
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (json) {
    try {
      const o = JSON.parse(json) as { commands?: GemmaCommand[]; reply?: string };
      return { commands: Array.isArray(o.commands) ? o.commands : [], reply: o.reply ?? null };
    } catch {
      /* not JSON */
    }
  }
  return text.trim() ? { commands: [], reply: text.trim() } : null;
}

export async function handleIntent(r: IntentRequest): Promise<IntentResponse> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { commands: [], reply: null, error: "no-key" };
  if (typeof r?.text !== "string" || !r.text.trim()) return { commands: [], reply: null, error: "empty" };
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: "user", parts: [{ text: describe(r) }] }],
        tools: [TOOL],
        toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["apply_commands"] } },
        generationConfig: { temperature: 0.9, maxOutputTokens: 400, thinkingConfig: { thinkingLevel: "minimal" } },
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      console.warn(`[gemma] ${res.status}: ${detail}`);
      return { commands: [], reply: null, error: `http-${res.status}` };
    }
    const out = extract(await res.json());
    return out ? { ...out, commands: out.commands.slice(0, 8) } : { commands: [], reply: null, error: "empty-response" };
  } catch (e) {
    console.warn("[gemma]", (e as Error).message);
    return { commands: [], reply: null, error: "network" };
  }
}
