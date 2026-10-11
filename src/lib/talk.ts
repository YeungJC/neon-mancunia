import { useEffect } from "react";
import { beginCharge, setBpm, setFilterOpen, setMuted, setVolume, toggleLayer } from "../audio/engine";
import { LAYERS, useStore, type LayerId } from "../store";
import { noteInput } from "./attract";
import { goTo, next, prev } from "./chapters";
import { fromGemma, parseCommand, type Chat, type GemmaCommand, type Intent } from "./voiceIntents";
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
  setTalk({ state: text ? "thinking" : "idle", heard: text ?? "" });
  if (!text) {
    reply(
      error === "permission"
        ? "My ears need the speech to text permission on the ElevenLabs key."
        : "Didn't catch that, our kid. It's the rain. Say it again.",
    );
    return;
  }
  reply(await understand(text));
}

// ── carrying out what you said (the understanding lives in voiceIntents.ts) ────────────────────
const pickOne = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
const label = (id: LayerId) => LAYERS.find((l) => l.id === id)!.label.toLowerCase();

/** Same banner the layers use, so every voice change is visible as well as heard. */
function flash(text: string, color = "#ffffff") {
  const st = useStore.getState();
  st.set({ banner: { text, color, big: false, n: (st.banner?.n ?? 0) + 1 } });
}

/** Carry out intents (from keywords or Gemma); returns the short phrases describing what happened. */
function execute(intents: Intent[]): string[] {
  const st = useStore.getState();
  const said: string[] = [];
  const isOn = (id: LayerId) => useStore.getState().pending[id] ?? useStore.getState().layers[id];

  for (const it of intents) {
    switch (it.kind) {
      case "layer":
        if (isOn(it.id) === it.on) said.push(`${label(it.id)} already ${it.on ? "on" : "off"}`);
        else (toggleLayer(it.id), said.push(`${label(it.id)} ${it.on ? "in" : "out"}`));
        break;
      case "allLayers":
        for (const l of LAYERS) if (isOn(l.id) !== it.on) toggleLayer(l.id);
        said.push(it.on ? "everything in" : "everything off. Just the rain now");
        break;
      case "bpm": {
        const before = useStore.getState().bpm;
        setBpm(it.set ?? before + (it.delta ?? 0));
        const after = useStore.getState().bpm;
        flash(`BPM ${after}`, "#00f0ff");
        said.push(
          after !== before
            ? `tempo ${after > before ? "up" : "down"} to ${after}`
            : it.set !== undefined
              ? `tempo's already at ${after}`
              : `tempo's already at the ${it.delta! > 0 ? "top" : "bottom"}, ${after}`,
        );
        break;
      }
      case "volume": {
        const before = st.muted ? 0 : useStore.getState().volume;
        const after = setVolume(it.set ?? useStore.getState().volume + (it.delta ?? 0));
        const pct = Math.round(after * 100);
        flash(`VOLUME ${pct}%`, "#ff2bd6");
        said.push(
          after !== before
            ? `${after > before ? "louder" : "quieter"}, ${pct} percent`
            : after >= 1
              ? "already flat out"
              : after <= 0
                ? "already silent"
                : `volume's already at ${pct} percent`,
        );
        break;
      }
      case "mute":
        setMuted(it.on);
        flash(it.on ? "MUTED" : "SOUND ON");
        said.push(it.on ? "muted. I'll be quiet too" : "sound back on");
        break;
      case "filter":
        setFilterOpen(it.open);
        said.push(it.open < 1 ? "muffled, like the club through the wall" : "filter wide open");
        break;
      case "go":
        goTo(it.chapter);
        said.push(["back to Piccadilly", "Northern Quarter it is", "off to the Haçienda"][it.chapter]);
        break;
      case "step":
        (it.dir > 0 ? next : prev)();
        said.push(it.dir > 0 ? "on we go" : "back we go");
        break;
      case "drop":
        beginCharge();
        said.push("building the drop");
        break;
    }
  }
  return said;
}

const compose = (said: string[]) =>
  `${said.map((x) => `${x[0].toUpperCase()}${x.slice(1)}.`).join(" ")} ${pickOne(["Have it.", "Mint.", "Go on then.", "Sorted, our kid.", "Proper."])}`;

function chatReply(chat: Chat | undefined): string {
  const st = useStore.getState();
  switch (chat) {
    case "wonderwall":
      return "I'm not playing Wonderwall. Not in this city, not in any year.";
    case "weather":
      return `It's ${st.weather.tempC} degrees and ${st.weather.rainMm > 0 ? "raining, obviously" : "somehow dry. Suspicious"}. It's Manchester, love.`;
    case "sun":
      return "Sun? In Manchester? Don't be daft.";
    case "who":
      return "I'm BEE-9. Manchester's worker bee, upgraded. I run the decks and judge your drops.";
    case "hello":
      return "Alright, our kid. Tell me what to play.";
    case "praise":
      return "Stop it, you'll make my wings go fuzzy.";
    case "help":
      return "Try: turn it up, increase the BPM, turn on the drums, take me to the Haçienda, or drop it.";
  }
  return pickOne([
    "No idea what that means, but I respect the energy.",
    "Sounds like rain to me. Try: turn it up.",
    "You what? Say increase the BPM and I'll show you.",
  ]);
}

/** Keyword path only (instant, offline). Returns BEE-9's reply. */
export function respond(raw: string): string {
  const { intents, chat } = parseCommand(raw);
  const said = execute(intents);
  return said.length ? compose(said) : chatReply(chat);
}

/** Gemma 4 for anything the keywords didn't catch: it reads intent and writes BEE-9's reply. */
async function askGemma(text: string): Promise<{ commands: GemmaCommand[]; reply: string | null } | null> {
  const s = useStore.getState();
  try {
    const r = await fetch("/api/intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        recent: recentReplies.slice(-4),
        state: {
          volume: s.volume,
          bpm: s.bpm,
          muted: s.muted,
          layers: LAYERS.filter((l) => s.pending[l.id] ?? s.layers[l.id]).map((l) => l.id),
          place: ["piccadilly", "northern_quarter", "hacienda"][s.chapter],
        },
      }),
      signal: AbortSignal.timeout(7000),
    });
    const out = (await r.json()) as { commands: GemmaCommand[]; reply: string | null; error?: string };
    return out.error ? null : out;
  } catch {
    return null;
  }
}

const recentReplies: string[] = [];

/** Understand a transcript: keywords first (instant), then Gemma 4, then a friendly fallback. */
export async function understand(text: string): Promise<string> {
  const local = parseCommand(text);
  if (local.intents.length) return compose(execute(local.intents));
  setTalk({ state: "thinking" });
  const g = await askGemma(text);
  setTalk({ state: "idle" });
  if (g && (g.commands.length || g.reply)) {
    const said = execute(fromGemma(g.commands));
    const line = g.reply?.trim() || (said.length ? compose(said) : chatReply(local.chat));
    recentReplies.push(line);
    return line;
  }
  return chatReply(local.chat);
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
