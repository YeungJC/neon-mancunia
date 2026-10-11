import { useEffect } from "react";
import { beginCharge, nudgeBpm, setBpm, toggleLayer } from "../audio/engine";
import { LAYERS, useStore, type LayerId } from "../store";
import { noteInput } from "./attract";
import { goTo } from "./chapters";
import { poke, reply } from "./dj";

/**
 * Talk back to BEE-9: hold V (or the mic button), speak, let go. ElevenLabs Scribe transcribes it,
 * BEE-9 carries out anything that sounds like a command and answers in her own voice.
 */
let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let stream: MediaStream | null = null;

const setTalk = (talk: Partial<{ state: "idle" | "listening" | "thinking"; heard: string }>) =>
  useStore.getState().set({ talk: { ...useStore.getState().talk, ...talk } });

export async function startTalking() {
  if (recorder || useStore.getState().phase !== "live") return;
  try {
    stream ??= await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch {
    reply("I can't hear you, love. Let the browser use your microphone.");
    return;
  }
  chunks = [];
  recorder = new MediaRecorder(stream);
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.start();
  setTalk({ state: "listening", heard: "" });
  noteInput();
  poke();
}

export async function stopTalking() {
  const rec = recorder;
  if (!rec) return;
  recorder = null;
  const done = new Promise<void>((r) => (rec.onstop = () => r()));
  rec.stop();
  await done;
  const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
  if (blob.size < 2000) {
    setTalk({ state: "idle" });
    return; // a tap, not a sentence
  }
  setTalk({ state: "thinking" });
  let text: string | null = null;
  let error: string | undefined;
  try {
    const r = await fetch("/api/stt", { method: "POST", headers: { "Content-Type": blob.type }, body: blob, signal: AbortSignal.timeout(15000) });
    ({ text, error } = (await r.json()) as { text: string | null; error?: string });
  } catch {
    error = "network";
  }
  setTalk({ state: "idle", heard: text ?? "" });
  if (!text) {
    reply(
      error === "permission"
        ? "My ears need the speech to text permission on the ElevenLabs key."
        : "Didn't catch that, our kid. It's the rain. Say it again.",
    );
    return;
  }
  reply(respond(text));
}

// ── understanding: plain keyword matching, so it's instant and free ──────────────────────────────
const LAYER_WORDS: [LayerId, RegExp][] = [
  ["drums", /\b(drums?|beat|kick|breakbeat)\b/],
  ["bass", /\b(bass|sub)\b/],
  ["lead", /\b(lead|melody|synth|tune)\b/],
  ["greggs", /\b(greggs?|sausage|pastry|steak bake)\b/],
  ["madchester", /\b(madchester|baggy|acid|happy mondays|stone roses)\b/],
];
const OFF = /\b(off|stop|kill|mute|drop out|lose|without|no more)\b/;
const pickOne = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

/** Act on the transcript; return what BEE-9 says back. Exported for tests. */
export function respond(raw: string): string {
  const t = raw.toLowerCase().replace(/[^\w\sç']/g, " ");
  const said: string[] = [];
  const st = useStore.getState();

  // layers: "turn on the drums", "kill the bass", "give me greggs"
  const off = OFF.test(t);
  for (const [id, re] of LAYER_WORDS) {
    if (!re.test(t)) continue;
    const on = st.pending[id] ?? st.layers[id];
    if (on === !off) {
      said.push(`${LAYERS.find((l) => l.id === id)!.label.toLowerCase()} already ${off ? "off" : "on"}`);
      continue;
    }
    toggleLayer(id);
    said.push(`${LAYERS.find((l) => l.id === id)!.label.toLowerCase()} ${off ? "out" : "in"}`);
  }
  if (/\b(everything|all of it|all the layers|full send)\b/.test(t) && !off) {
    for (const l of LAYERS) if (!(st.pending[l.id] ?? st.layers[l.id])) toggleLayer(l.id);
    said.push("everything in");
  }

  // tempo: "faster", "slow it down", "120 bpm"
  const bpm = t.match(/\b(\d{2,3})\s*(bpm|beats)?\b/);
  if (bpm && Number(bpm[1]) >= 60 && Number(bpm[1]) <= 180 && /bpm|beats|tempo|speed|at\b/.test(t)) {
    setBpm(Number(bpm[1]));
    said.push(`${Math.max(70, Math.min(150, Number(bpm[1])))} bpm`);
  } else if (/\b(faster|speed (it )?up|quicker|pick it up)\b/.test(t)) {
    nudgeBpm(10);
    said.push("tempo up");
  } else if (/\b(slower|slow (it )?down|chill)\b/.test(t)) {
    nudgeBpm(-10);
    said.push("tempo down");
  }

  // places
  if (/\b(ha[cç]ienda|club|fac 51)\b/.test(t)) (goTo(2), said.push("off to the Haçienda"));
  else if (/\b(northern quarter|nq|afflecks)\b/.test(t)) (goTo(1), said.push("Northern Quarter it is"));
  else if (/\bpiccadilly\b/.test(t)) (goTo(0), said.push("back to Piccadilly"));

  // the drop
  if (/\b(drop|build|send it|let it go|bang)\b/.test(t) && !/\bdrop out\b/.test(t)) {
    beginCharge();
    said.push("building the drop");
  }

  if (said.length) {
    const sentences = said.map((x) => `${x[0].toUpperCase()}${x.slice(1)}.`);
    return `${sentences.join(" ")} ${pickOne(["Have it.", "Mint.", "Go on then.", "Sorted, our kid.", "Proper."])}`;
  }

  // chat
  if (/\bwonderwall|oasis\b/.test(t)) return "I'm not playing Wonderwall. Not in this city, not in any year.";
  if (/\b(rain|raining|weather|wet)\b/.test(t)) return `It's ${st.weather.tempC} degrees and ${st.weather.rainMm > 0 ? "raining, obviously" : "somehow dry. Suspicious"}. It's Manchester, love.`;
  if (/\b(sun|sunny|summer)\b/.test(t)) return "Sun? In Manchester? Don't be daft.";
  if (/\b(who are you|your name|what are you)\b/.test(t)) return "I'm BEE-9. Manchester's worker bee, upgraded. I run the decks and judge your drops.";
  if (/\b(hello|hiya|hi|hey|alright|eh up)\b/.test(t)) return "Alright, our kid. Tell me what to play.";
  if (/\b(love you|amazing|mint|banger)\b/.test(t)) return "Stop it, you'll make my wings go fuzzy.";
  if (/\b(help|what can|how)\b/.test(t)) return "Say turn on the drums, faster, Greggs, take me to the Haçienda, or drop it.";
  return pickOne([
    "No idea what that means, but I respect the energy.",
    "Sounds like rain to me. Try: turn on the bass.",
    "You what? Say drop it and I'll show you.",
  ]);
}

/** Hold V to talk. */
export function useTalk() {
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "v" || e.repeat || e.metaKey || e.ctrlKey) return;
      if (e.target instanceof Element && e.target.closest("input, textarea, select")) return;
      startTalking();
    };
    const up = (e: KeyboardEvent) => e.key.toLowerCase() === "v" && stopTalking();
    addEventListener("keydown", down);
    addEventListener("keyup", up);
    return () => {
      removeEventListener("keydown", down);
      removeEventListener("keyup", up);
    };
  }, []);
}
