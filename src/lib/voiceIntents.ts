import type { LayerId } from "../store";

/**
 * Turns what you said to BEE-9 into intents. Pure (no audio, no state) so it's unit-tested in
 * tests/voiceIntents.test.ts; lib/talk.ts carries the intents out.
 */
export type Intent =
  | { kind: "layer"; id: LayerId; on: boolean }
  | { kind: "allLayers"; on: boolean }
  | { kind: "bpm"; set?: number; delta?: number }
  | { kind: "volume"; set?: number; delta?: number }
  | { kind: "mute"; on: boolean }
  | { kind: "filter"; open: number }
  | { kind: "go"; chapter: 0 | 1 | 2 }
  | { kind: "step"; dir: 1 | -1 }
  | { kind: "drop" };

export type Chat = "wonderwall" | "weather" | "sun" | "who" | "hello" | "praise" | "help";

const LAYER_WORDS: [LayerId, RegExp][] = [
  ["drums", /\b(drums?|beat|kick|breakbeat|percussion)\b/],
  ["bass", /\b(bass|sub|bassline)\b/],
  ["lead", /\b(lead|melody|synth|tune)\b/],
  ["greggs", /\b(greggs?|sausage rolls?|pastry|steak bake)\b/],
  ["madchester", /\b(madchester|baggy|acid|happy mondays|stone roses)\b/],
];

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100,
};

/** "a hundred and twenty" → "120", "twenty five" → "25", "ten" → "10", "50%" → "50 percent" */
function normalise(raw: string) {
  let t = ` ${raw.toLowerCase().replace(/%/g, " percent").replace(/[^\w\sç']/g, " ")} `.replace(/\s+/g, " ");
  t = t.replace(/\b(a|one) hundred( and)? (\w+)\b/g, (m, _a, _b, w) => (NUMBER_WORDS[w] ? ` ${100 + NUMBER_WORDS[w]} ` : m));
  t = t.replace(/\b(a|one) hundred\b/g, " 100 ");
  t = t.replace(/\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety) (one|two|three|four|five|six|seven|eight|nine)\b/g, (_m, a, b) => ` ${NUMBER_WORDS[a] + NUMBER_WORDS[b]} `);
  t = t.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\b/g, (w) => ` ${NUMBER_WORDS[w]} `);
  return t.replace(/\s+/g, " ");
}

const has = (t: string, re: RegExp) => re.test(t);

const OFF = /\b(off|stop|kill|mute|lose|without|no more|cut|remove|get rid of|ditch|take out|drop out)\b/;
const TEMPO = /\b(bpm|b p m|tempo|speed|pace|beats per minute|faster|slower|quicker)\b/;
const VOLUME = /\b(volume|louder|quieter|softer|loudness)\b/;
const VOLUME_PHRASE = /\b(turn (it|this|that|the music) (up|down)|turn up the music|turn down the music|pump it up|crank it( up)?|make it (louder|quieter))\b/;

export function parseCommand(raw: string): { intents: Intent[]; chat?: Chat } {
  const t = normalise(raw);
  const intents: Intent[] = [];
  const amountBy = t.match(/\bby (\d+)/);
  const amountTo = t.match(/\b(?:to|at) (\d+)/);

  // ── layers: "turn on the drums", "kill the bass", "bring back the lead" ─────────────────────
  const named = LAYER_WORDS.filter(([, re]) => has(t, re));
  // layers are on/off, so "turn down the bass" means off; "turn on" / "bring back" always means on
  const layerOff = (has(t, OFF) || has(t, /\b(down|quieter|less)\b/)) && !has(t, /\b(turn (it )?on|bring)\b/);
  for (const [id] of named) intents.push({ kind: "layer", id, on: !layerOff });
  if (has(t, /\b(everything|all of it|all the layers|all layers|full send|the lot)\b/)) intents.push({ kind: "allLayers", on: !has(t, OFF) });
  else if (has(t, /\bstop the music\b|\bstop it all\b|\bsilence everything\b/)) intents.push({ kind: "allLayers", on: false });

  // ── volume: "turn it up", "louder", "volume to 50 percent", "mute" (a named layer means the layer, not volume)
  if (!named.length) {
    if (has(t, /\bunmute\b|\bsound (back )?on\b/)) intents.push({ kind: "mute", on: false });
    else if (has(t, /\bmute\b|\bsound off\b|\bshush\b/)) intents.push({ kind: "mute", on: true });
    else if (has(t, VOLUME) || has(t, VOLUME_PHRASE)) {
      const down = has(t, /\b(down|quieter|softer|lower|decrease|reduce)\b/);
      const up = has(t, /\b(up|louder|increase|raise|higher|boost|crank|pump)\b/);
      const to = t.match(/\bto (\d{1,3})\b/)?.[1];
      const pct = t.match(/\b(\d{1,3}) percent\b/)?.[1];
      if (has(t, /\b(max|maximum|full)\b/)) intents.push({ kind: "volume", set: 1 });
      else if (to) intents.push({ kind: "volume", set: Math.min(100, Number(to)) / 100 }); // "volume to 50"
      else if ((amountBy || pct) && (up || down)) {
        const step = Number(amountBy?.[1] ?? pct) / 100; // "down by 20", "up 10 percent"
        intents.push({ kind: "volume", delta: down ? -step : step });
      } else if (pct) intents.push({ kind: "volume", set: Math.min(100, Number(pct)) / 100 }); // "volume 50 percent"
      else intents.push({ kind: "volume", delta: down ? -0.15 : 0.15 });
    }
  }

  // ── tempo: "increase the bpm", "bpm up by 20", "set the tempo to 128", "speed it up" ─────────
  const plainBpm = t.match(/\b(\d{2,3}) ?bpm\b|\bbpm (?:of )?(\d{2,3})\b/);
  if (has(t, TEMPO) || plainBpm || has(t, /\b(speed (it )?up|slow (it )?down)\b/)) {
    const target = plainBpm?.[1] ?? plainBpm?.[2] ?? (amountTo && !amountBy ? amountTo[1] : undefined);
    if (target && Number(target) >= 40) intents.push({ kind: "bpm", set: Number(target) });
    else {
      const step = amountBy ? Number(amountBy[1]) : 10;
      const down = has(t, /\b(slow|slower|down|decrease|lower|reduce|drop|less|chill)\b/);
      const up = has(t, /\b(speed|faster|quicker|up|increase|raise|higher|more|bump)\b/);
      if (down || up) intents.push({ kind: "bpm", delta: down ? -step : step });
    }
  }

  // ── filter ────────────────────────────────────────────────────────────────────────────────
  if (has(t, /\b(muffle|muffled|underwater|close the filter|filter (it )?down)\b/)) intents.push({ kind: "filter", open: 0.3 });
  else if (has(t, /\b(unmuffle|open (it|the filter) up|clear it up|filter (it )?up)\b/)) intents.push({ kind: "filter", open: 1 });

  // ── places and moving along the street ────────────────────────────────────────────────────
  if (has(t, /\b(ha[cç]ienda|club|fac 51)\b/)) intents.push({ kind: "go", chapter: 2 });
  else if (has(t, /\b(northern quarter|nq|afflecks)\b/)) intents.push({ kind: "go", chapter: 1 });
  else if (has(t, /\bpiccadilly\b/)) intents.push({ kind: "go", chapter: 0 });
  else if (!named.length && has(t, /\b(next|move on|keep going|go forward|onwards)\b/)) intents.push({ kind: "step", dir: 1 });
  else if (!named.length && has(t, /\b(go back|previous|back up|reverse)\b/)) intents.push({ kind: "step", dir: -1 });

  // ── the drop (not "drop the bpm", not "drop out the bass") ─────────────────────────────────
  const aboutLevels = intents.some((i) => i.kind === "bpm" || i.kind === "volume" || i.kind === "layer");
  if (!aboutLevels && has(t, /\b(drop it|drop the beat|do the drop|send it|let it go|bang|build it up|build|drop)\b/)) intents.push({ kind: "drop" });

  if (intents.length) return { intents };

  // ── chat ──────────────────────────────────────────────────────────────────────────────────
  const chat: [Chat, RegExp][] = [
    ["wonderwall", /\b(wonderwall|oasis)\b/],
    ["weather", /\b(rain|raining|weather|wet)\b/],
    ["sun", /\b(sun|sunny|summer)\b/],
    ["who", /\b(who are you|your name|what are you)\b/],
    ["hello", /\b(hello|hiya|hi|hey|alright|eh up)\b/],
    ["praise", /\b(love you|amazing|mint|banger|class)\b/],
    ["help", /\b(help|what can|how do)\b/],
  ];
  return { intents, chat: chat.find(([, re]) => has(t, re))?.[0] };
}

/** Gemma's function-call commands → Intents, validated and clamped (never trust model output blindly). */
export type GemmaCommand = { action: string; layer?: string; place?: string; value?: number };
const LAYER_IDS: LayerId[] = ["drums", "bass", "lead", "madchester", "greggs"];
const PLACES = { piccadilly: 0, northern_quarter: 1, hacienda: 2 } as const;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function fromGemma(commands: GemmaCommand[]): Intent[] {
  const out: Intent[] = [];
  for (const c of commands.slice(0, 8)) {
    const layer = LAYER_IDS.find((id) => id === c.layer);
    const v = num(c.value);
    switch (c.action) {
      case "layer_on":
      case "layer_off":
        if (layer) out.push({ kind: "layer", id: layer, on: c.action === "layer_on" });
        break;
      case "all_layers_on":
      case "all_layers_off":
        out.push({ kind: "allLayers", on: c.action === "all_layers_on" });
        break;
      case "volume_set":
        if (v !== undefined) out.push({ kind: "volume", set: clamp(v > 1 ? v / 100 : v, 0, 1) });
        break;
      case "volume_change":
        out.push({ kind: "volume", delta: clamp((v ?? 15) / (Math.abs(v ?? 15) > 1 ? 100 : 1), -0.6, 0.6) });
        break;
      case "mute":
      case "unmute":
        out.push({ kind: "mute", on: c.action === "mute" });
        break;
      case "bpm_set":
        if (v !== undefined) out.push({ kind: "bpm", set: clamp(Math.round(v), 70, 150) });
        break;
      case "bpm_change":
        out.push({ kind: "bpm", delta: clamp(Math.round(v ?? 10), -40, 40) });
        break;
      case "filter":
        out.push({ kind: "filter", open: clamp((v ?? 100) > 1 ? (v ?? 100) / 100 : (v ?? 1), 0.08, 1) });
        break;
      case "go_to":
        if (c.place && c.place in PLACES) out.push({ kind: "go", chapter: PLACES[c.place as keyof typeof PLACES] });
        break;
      case "next":
      case "previous":
        out.push({ kind: "step", dir: c.action === "next" ? 1 : -1 });
        break;
      case "drop":
        out.push({ kind: "drop" });
        break;
    }
  }
  return out;
}
