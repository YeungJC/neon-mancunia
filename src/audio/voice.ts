import * as Tone from "tone";
import { fx, useStore } from "../store";
import { duckMusic, getVoiceDestination } from "./engine";

// BEE-9's "cyber angel" chain: breathy chorus, an octave-up halo, a long cathedral tail,
// and a faint synthetic shimmer. Dry voice stays up front so every word is still clear.
let input: Tone.Filter | null = null;
let current: Tone.Player | null = null;

function chain() {
  if (input) return input;
  const out = getVoiceDestination();
  input = new Tone.Filter(150, "highpass");

  const dry = new Tone.Chorus({ frequency: 0.7, delayTime: 3.5, depth: 0.35, wet: 0.3 }).start();
  const shimmer = new Tone.Vibrato({ frequency: 5.5, depth: 0.04 });
  input.chain(dry, shimmer, out);

  const cathedral = new Tone.Reverb({ decay: 6.5, preDelay: 0.04, wet: 1 });
  const reverbSend = new Tone.Gain(0.32).connect(cathedral);
  cathedral.connect(out);
  shimmer.connect(reverbSend);

  // the halo: voice an octave up, only ever heard through the reverb
  const halo = new Tone.PitchShift({ pitch: 12, windowSize: 0.06, wet: 1 });
  const haloSend = new Tone.Gain(0.14);
  input.chain(halo, haloSend, cathedral);

  const echo = new Tone.PingPongDelay({ delayTime: "8n", feedback: 0.22, wet: 1 });
  const echoSend = new Tone.Gain(0.08).connect(echo);
  echo.connect(cathedral);
  shimmer.connect(echoSend);
  return input;
}

function finish() {
  duckMusic(false);
  fx.speaking = 0;
  useStore.getState().set({ djSpeaking: false });
}

/** Plays mp3 bytes (live /api/tts or a pre-rendered line) through the drone FX, ducking the music. */
export async function speak(mp3: ArrayBuffer) {
  const audio = await Tone.getContext().decodeAudioData(mp3);
  current?.stop();
  const player = new Tone.Player(audio).connect(chain());
  player.volume.value = 1;
  current = player;
  player.onstop = () => {
    player.dispose();
    if (current === player) {
      current = null;
      finish();
    }
  };
  duckMusic(true);
  fx.speaking = 1;
  useStore.getState().set({ djSpeaking: true });
  player.start();
}

/** Last resort when there is no audio at all (no key, no pre-rendered file). */
export function speakWithBrowser(text: string) {
  if (!("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-GB";
  u.pitch = 1.1;
  u.rate = 0.92;
  u.onstart = () => {
    duckMusic(true);
    fx.speaking = 1;
    useStore.getState().set({ djSpeaking: true });
  };
  u.onend = finish;
  speechSynthesis.speak(u);
}
