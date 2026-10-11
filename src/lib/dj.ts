import * as Tone from "tone";
import { speak, speakWithBrowser } from "../audio/voice";
import { DISTRICTS, LAYERS, useStore } from "../store";
import { STATIC_FOR, STATIC_LINES, staticFile, TEMPLATES, trackName, type DJEvent, type SetState } from "./lines";

const recent: string[] = [];
let busy = false;
let lastAt = 0;
/** Flips off after the first failed live TTS call (no key / no wifi) so we stop trying. */
let liveTTS = true;

/** Events that matter get through the cooldown; ambient chatter waits its turn. */
const PRIORITY: Partial<Record<DJEvent, true>> = { firstDrop: true, drop: true, bottled: true, greggs: true };
const COOLDOWN_MS = 18000;
/** Share of lines that use live details (and therefore live ElevenLabs quota). */
const TEMPLATE_CHANCE = 0.35;

function setState(): SetState {
  const s = useStore.getState();
  return {
    district: DISTRICTS[s.district].name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()),
    weather: s.weather,
    drops: s.drops,
    bpm: s.bpm,
    scale: s.scaleName,
    layers: LAYERS.filter((l) => s.layers[l.id]).map((l) => l.label.toLowerCase()),
  };
}

const b64ToBuf = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;

async function liveVoice(text: string): Promise<ArrayBuffer | null> {
  try {
    const r = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(4000),
    });
    const { audio } = (await r.json()) as { audio: string | null };
    if (audio) return b64ToBuf(audio);
  } catch {
    /* fall through */
  }
  liveTTS = false;
  return null;
}

async function preRendered(i: number): Promise<ArrayBuffer | null> {
  try {
    const r = await fetch(staticFile(i));
    if (r.ok && r.headers.get("content-type")?.includes("audio")) return await r.arrayBuffer();
  } catch {
    /* not generated yet */
  }
  return null;
}

async function say(text: string, audio: ArrayBuffer | null) {
  recent.push(text);
  useStore.getState().set({ djLine: text });
  if (audio) await speak(audio).catch(() => speakWithBrowser(text));
  else speakWithBrowser(text);
}

const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

export async function heckle(event: DJEvent) {
  const now = Date.now();
  if (busy || useStore.getState().djSpeaking) return;
  if (!PRIORITY[event] && now - lastAt < COOLDOWN_MS) return;
  busy = true;
  lastAt = now;
  try {
    if (liveTTS && Math.random() < TEMPLATE_CHANCE) {
      const text = pick(TEMPLATES[event])(setState());
      const audio = await liveVoice(text);
      if (audio) return await say(text, audio);
    }
    const pool = STATIC_FOR[event];
    const fresh = pool.filter((i) => !recent.includes(STATIC_LINES[i]));
    const i = pick(fresh.length ? fresh : pool);
    await say(STATIC_LINES[i], await preRendered(i));
  } finally {
    busy = false;
  }
}

export const nameTrack = () => trackName();

let idleTimer = 0;
export function poke() {
  window.clearTimeout(idleTimer);
  idleTimer = window.setTimeout(() => heckle("idle"), 25000);
}

/** Ambient commentary every 8 bars (the cooldown keeps it from nagging). */
export function startDJ() {
  Tone.getTransport().scheduleRepeat(() => Tone.getDraw().schedule(() => heckle("tick"), Tone.now()), "8m", "4m");
  poke();
  setTimeout(() => heckle("district"), 2500);
}
