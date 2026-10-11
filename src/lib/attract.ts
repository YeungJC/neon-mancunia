import * as Tone from "tone";
import { useEffect } from "react";
import { beginCharge, cancelCharge, resetLayers, toggleLayer } from "../audio/engine";
import { fx, useStore, type LayerId } from "../store";
import { goTo } from "./chapters";
import { heckle } from "./dj";
import { newSet } from "./session";

/**
 * Expo kiosk mode (`?expo`): after 15s with nobody touching it, the city performs a full set by itself
 * and BEE-9 calls people over. Any real input hands control to the visitor from a clean start.
 * After END SET, the poster stays up for 45s, then a fresh set begins and the cycle resumes.
 */
export const KIOSK = new URLSearchParams(location.search).has("expo");
const IDLE_MS = 15000;
const OUTRO_MS = 45000;

let idleTimer = 0;
let steps: number[] = [];
let callout = 0;
let drift = 0;

const setLayer = (id: LayerId, on: boolean) => {
  const s = useStore.getState();
  if ((s.pending[id] ?? s.layers[id]) !== on) toggleLayer(id);
};

/** The autopilot's set, in bars: build, two takeovers, the drop, strip back, loop. */
const SCRIPT: [number, () => void][] = [
  [0, () => (resetLayers(), goTo(0))],
  [2, () => setLayer("drums", true)],
  [4, () => setLayer("bass", true)],
  [6, () => goTo(1)],
  [8, () => setLayer("lead", true)],
  [12, () => setLayer("madchester", true)],
  [18, () => (setLayer("madchester", false), setLayer("greggs", true))],
  [24, () => (setLayer("greggs", false), goTo(2))],
  [26, () => beginCharge()], // a full 2-bar build drops by itself (and BEE-9 reacts when it lands)
  [36, () => setLayer("lead", false)],
  [38, () => setLayer("bass", false)],
  [40, () => (setLayer("drums", false), goTo(0))],
];
const LOOP_BARS = 44;

function startAutopilot() {
  if (useStore.getState().attract) return;
  useStore.getState().set({ attract: true });
  const bar = (60 / Tone.getTransport().bpm.value) * 4 * 1000;
  const run = () => {
    steps = SCRIPT.map(([at, fn]) => window.setTimeout(fn, at * bar));
    steps.push(window.setTimeout(run, LOOP_BARS * bar));
  };
  run();
  heckle("attract");
  callout = window.setInterval(() => heckle("attract"), 20000);
  // a ghost hand drifts the camera and shoves the chrome
  const t0 = performance.now();
  const wander = () => {
    const t = (performance.now() - t0) / 1000;
    fx.pointer.x = Math.sin(t * 0.37) * 0.6;
    fx.pointer.y = Math.sin(t * 0.23 + 1) * 0.35;
    drift = requestAnimationFrame(wander);
  };
  wander();
}

function stopAutopilot() {
  steps.forEach((id) => window.clearTimeout(id));
  steps = [];
  window.clearInterval(callout);
  cancelAnimationFrame(drift);
  cancelCharge();
  useStore.getState().set({ attract: false });
}

function armIdle() {
  window.clearTimeout(idleTimer);
  const { phase } = useStore.getState();
  if (phase === "live") idleTimer = window.setTimeout(startAutopilot, IDLE_MS);
  if (phase === "outro")
    idleTimer = window.setTimeout(() => {
      newSet(true);
      goTo(0);
      armIdle();
    }, OUTRO_MS);
}

/** Any real input (DOM, phone remote, voice): hands over from the autopilot and resets the idle timer. */
export function noteInput() {
  if (!KIOSK) return;
  if (useStore.getState().attract) {
    stopAutopilot();
    newSet(true);
    goTo(0);
    heckle("welcome");
  }
  armIdle();
}

export function useAttract() {
  useEffect(() => {
    if (!KIOSK) return;
    // pointermove deliberately doesn't count: passers-by brush the mouse
    const onInput = noteInput;
    const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    events.forEach((e) => addEventListener(e, onInput, { capture: true, passive: true }));
    const unsub = useStore.subscribe((s, prev) => {
      if (s.phase !== prev.phase) armIdle();
    });
    return () => {
      events.forEach((e) => removeEventListener(e, onInput, { capture: true }));
      unsub();
      stopAutopilot();
      window.clearTimeout(idleTimer);
    };
  }, []);
}
