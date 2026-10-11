import * as Tone from "tone";
import { startDropoutMonitor } from "./dropoutMonitor";
import { initRainInstrument, preloadVocals } from "./rainInstrument";
import { fx, LAYERS, useStore, type LayerId } from "../store";
import { buildLayers } from "./layers";
import { bpmFromWeather, scaleFromWeather, type Scale } from "./scales";

// The default "interactive" context runs a ~5ms buffer: lowest latency, but any spike from the WebGL
// scene starves the audio thread and the music drops out. "balanced" + more lookahead trades a few ms
// of latency (everything is beat-quantised anyway) for a set that never cuts out.
// lookAhead 0.25s: the 3D scene can freeze the main thread for a frame or two (first-time shader
// compiles, GC); the scheduler needs to have already queued the next notes when that happens.
Tone.setContext(new Tone.Context({ latencyHint: "balanced", lookAhead: 0.25 }));

/** Pre-generated ElevenLabs sound design (npm run gen-sfx). Every one is optional. */
const SFX = ["rain", "crt", "impact", "greggs", "whooshIn", "whooshOut", "madShout", "madCrowd", "choir", "crunch", "steakbake"] as const;
type SfxName = (typeof SFX)[number];

let scale: Scale = scaleFromWeather(useStore.getState().weather);
let layers: ReturnType<typeof buildLayers> | null = null;
const sfx: Partial<Record<SfxName, Tone.Player>> = {};
const buffers: Partial<Record<SfxName, Tone.ToneAudioBuffer>> = {};

// Master chain: layers → filter (cursor) → duck (voice) → comp → limiter → speakers
let masterFilter: Tone.Filter;
let duck: Tone.Gain;
let limiter: Tone.Limiter;
let analyser: Tone.Analyser;
let recorder: Tone.Recorder | null = null;

/** Soft UI tick for layer toggles (replaces a harsh neon-buzz sample). */
let toggleTick: Tone.Synth | null = null;
let lastTickAt = 0;

let riser: { noise: Tone.Noise; hp: Tone.Filter; osc: Tone.Oscillator; gain: Tone.Gain } | null = null;
/** Drains the bass out of the whole mix while building a drop. */
let masterHP: Tone.Filter;
/** Opens/closes for the half-beat of silence right before the drop lands. */
let dropGate: Tone.Gain;

/** idle → building (Space held) → pending (released, waiting for the downbeat) → dropping (8 bars) → idle */
type DropState = "idle" | "building" | "pending" | "dropping";
let dropState: DropState = "idle";
let holdStart = 0;
let dropAt = 0; // audio-context time the current drop lands
const holding = () => dropState === "building";
const dropActive = () => dropState === "dropping";

/**
 * Run app-state updates when an audio time arrives. Plain timers keep running in background tabs,
 * unlike Tone.Draw (requestAnimationFrame), so a pad can never get stuck on "IN…".
 */
function atAudioTime(time: number, fn: () => void) {
  window.setTimeout(fn, Math.max(0, (time - Tone.immediate()) * 1000));
}

/** Where the voice chain plugs in so BEE-9 is heard (and recorded) but not ducked or filtered. */
export const getVoiceDestination = () => limiter;

/** Load SFX buffers during the intro, before the audio context is unlocked. Missing files are skipped. */
export async function preloadSfx(onProgress?: (p: number) => void) {
  await preloadVocals();
  let done = 0;
  await Promise.all(
    SFX.map(async (name) => {
      try {
        const buf = await new Tone.ToneAudioBuffer().load(`/sfx/${name}.mp3`);
        buffers[name] = buf;
        sfx[name] = new Tone.Player(buf);
      } catch {
        /* not generated yet — the synths cover for it */
      }
      onProgress?.(++done / SFX.length);
    }),
  );
}

export function playSfx(name: SfxName, volumeDb = -6) {
  const p = sfx[name];
  if (!p) return;
  p.volume.value = volumeDb;
  try {
    if (p.state === "started") p.restart();
    else p.start();
  } catch {
    // two layers landing on the same beat both ask for the whoosh at the same instant; one is plenty
  }
}

export async function startEngine() {
  await Tone.start();
  const { weather } = useStore.getState();
  scale = scaleFromWeather(weather);
  fx.rain = Math.min(1, 0.35 + weather.rainMm * 0.25);

  const transport = Tone.getTransport();
  transport.bpm.value = bpmFromWeather(weather);
  transport.swingSubdivision = "16n";
  transport.swing = 0.14;

  limiter = new Tone.Limiter(-1).toDestination();
  const comp = new Tone.Compressor({ threshold: -18, ratio: 3, attack: 0.01, release: 0.2 }).connect(limiter);
  duck = new Tone.Gain(1).connect(comp);
  dropGate = new Tone.Gain(1).connect(duck);
  masterHP = new Tone.Filter({ frequency: 10, type: "highpass", rolloff: -24 }).connect(dropGate);
  masterFilter = new Tone.Filter({ frequency: 20000, type: "lowpass", rolloff: -24, Q: 1 }).connect(masterHP);
  analyser = new Tone.Analyser("fft", 64);
  analyser.smoothing = 0.7;
  limiter.connect(analyser);

  if (Tone.Recorder.supported) {
    recorder = new Tone.Recorder();
    limiter.connect(recorder);
    recorder.start();
  }

  for (const p of Object.values(sfx)) p.connect(duck);
  if (sfx.rain) {
    sfx.rain.loop = true;
    sfx.rain.volume.value = -22 + fx.rain * 8;
    sfx.rain.start();
  }

  toggleTick = new Tone.Synth({
    oscillator: { type: "sine" },
    envelope: { attack: 0.002, decay: 0.09, sustain: 0, release: 0.05 },
    volume: -22,
  }).connect(limiter);

  const draw = Tone.getDraw();
  // Draw drops callbacks that run >0.25s late by default; a frame hitch would then leave a layer
  // playing while its pad still says "IN…". Late UI is better than lost UI.
  draw.expiration = 10;
  initRainInstrument(masterFilter, () => scale);
  layers = buildLayers(masterFilter, {
    getScale: () => scale,
    getRain: () => fx.rain,
    getTheme: () => fx.themeTarget,
    isOn: (id) => {
      if (dropState === "pending" || dropState === "dropping") return true;
      const st = useStore.getState();
      return st.layers[id as LayerId] || st.pending[id as LayerId] !== undefined;
    },
    samples: { choir: buffers.choir, crunch: buffers.crunch },
    onBass: (midi, time) =>
      draw.schedule(() => {
        if (layers && layers.gains.bass.gain.value > 0.1 && fx.bassHits.length < 16) fx.bassHits.push(midi);
      }, time),
    onLead: (midi, time) =>
      draw.schedule(() => {
        if (layers && layers.gains.lead.gain.value > 0.1 && fx.leadNotes.length < 16) fx.leadNotes.push(midi);
      }, time),
    // Only flash visuals for kicks you can actually hear
    onKick: (time) =>
      draw.schedule(() => {
        if (layers && layers.gains.drums.gain.value > 0.1) fx.kick = 1;
      }, time),
    onSplash: (pan, time) =>
      draw.schedule(() => {
        if (fx.splashes.length < 32) fx.splashes.push({ pan, color: Math.floor(Math.random() * 3) });
      }, time),
  });

  // Riser for the drop: white noise sweep + a climbing saw
  const riserGain = new Tone.Gain(0).connect(dropGate);
  const hp = new Tone.Filter(200, "highpass").connect(riserGain);
  const noise = new Tone.Noise("white").connect(hp).start();
  noise.volume.value = -14;
  const osc = new Tone.Oscillator("D3", "sawtooth").connect(riserGain).start();
  osc.volume.value = -26;
  riser = { noise, hp, osc, gain: riserGain };

  // Snare roll for the build: quarters → 8ths → 16ths as the charge rises, flat out while pending
  const rollBp = new Tone.Filter(2200, "bandpass").connect(dropGate);
  const roll = new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.09, sustain: 0 }, volume: -10 }).connect(rollBp);
  let rollStep = 0;
  new Tone.Loop((time) => {
    const step = rollStep++;
    const c = fx.charge;
    const beat = Tone.Time("4n").toSeconds();
    let hit = false;
    if (dropState === "building") hit = c < 0.35 ? step % 4 === 0 : c < 0.7 ? step % 2 === 0 : true;
    if (dropState === "pending") hit = time < dropAt - beat / 2 - 0.01;
    if (hit) roll.triggerAttackRelease("32n", time, 0.25 + Math.min(1, c) * 0.75);
  }, "16n").start(0);

  setVolume(useStore.getState().volume);

  // Bluetooth/AirPods switching or another app grabbing the output device can suspend/interrupt the
  // context; the music would stay silent until something resumed it. Resume straight away.
  const raw = Tone.getContext().rawContext as AudioContext;
  raw.addEventListener("statechange", () => {
    if (raw.state !== "running" && raw.state !== "closed" && useStore.getState().phase !== "intro") {
      console.warn(`[audio] context ${raw.state}; resuming`);
      raw.resume().catch(() => {});
    }
  });

  startDropoutMonitor(limiter, () => {
    const s = useStore.getState();
    return {
      phase: s.phase,
      muted: s.muted,
      volume: s.volume,
      layersOn: Object.entries(s.layers).filter(([, v]) => v).map(([k]) => k).join("+") || "none",
      dropState,
      voiceDuckGain: Number(duck.gain.value.toFixed(2)),
      dropGateGain: Number(dropGate.gain.value.toFixed(2)),
      masterLowpassHz: Math.round(Tone.Frequency(masterFilter.frequency.value).toFrequency()),
      masterHighpassHz: Math.round(Tone.Frequency(masterHP.frequency.value).toFrequency()),
      destinationDb: Number(Tone.getDestination().volume.value.toFixed(1)),
      destinationMuted: Tone.getDestination().mute,
      transport: Tone.getTransport().state,
      bpm: s.bpm,
      beeSpeaking: s.djSpeaking,
      talk: s.talk.state,
    };
  });

  if (import.meta.env.DEV) {
    // dev-only handle on the live audio graph, for measuring levels from the console
    import("./rainInstrument").then((ri) => Object.assign(window, { __nmAudio: { master: limiter, duck, keys: ri.rainOutput, toggleLayer, playRain: ri.playRain, rainEvents: ri.rainEvents } }));
  }
  playSfx("crt", -4);
  transport.start("+0.1");
  useStore.getState().set({ scaleName: scale.name, bpm: Math.round(transport.bpm.value), startedAt: Date.now() });
  requestAnimationFrame(tick);
}

let last = performance.now();
function tick(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  const values = analyser.getValue() as Float32Array;
  let b = 0, m = 0, h = 0;
  for (let i = 0; i < 64; i++) {
    const v = Math.max(0, Math.min(1, (values[i] + 90) / 70));
    fx.fft[i] += (v - fx.fft[i]) * 0.5;
    if (i < 4) b += v;
    else if (i < 16) m += v;
    else if (i < 40) h += v;
  }
  fx.bass += (b / 4 - fx.bass) * 0.4;
  fx.mids += (m / 12 - fx.mids) * 0.3;
  fx.highs += (h / 24 - fx.highs) * 0.3;
  fx.energy = fx.bass * 0.5 + fx.mids * 0.3 + fx.highs * 0.2;

  if (layers) {
    for (const { id } of LAYERS) {
      const db = layers.meters[id].getValue() as number;
      fx.levels[id] = Math.max(0, Math.min(1, (db + 48) / 42));
    }
  }

  // takeovers fade in/out over about a second
  fx.theme.greggs += (fx.themeTarget.greggs - fx.theme.greggs) * Math.min(1, dt * 2.5);
  fx.theme.madchester += (fx.themeTarget.madchester - fx.theme.madchester) * Math.min(1, dt * 2.5);

  fx.kick = Math.max(0, fx.kick - dt * 4);
  fx.flash = Math.max(0, fx.flash - dt * 0.6);

  // Charge fills over 2 bars of wall-clock time (frame-rate independent)
  const barSecs = (60 / Tone.getTransport().bpm.value) * 4;
  if (holding()) {
    fx.charge = Math.min(1, (now - holdStart) / 1000 / (barSecs * 2));
    if (fx.charge >= 1) scheduleDrop(); // full charge drops by itself on the next downbeat
  } else if (dropState !== "pending") fx.charge = Math.max(0, fx.charge - dt * 3);
  fx.dropping = Math.max(0, fx.dropping - dt * 0.12);
  if (riser && (dropState === "building" || dropState === "pending")) {
    const c = fx.charge;
    const t = Tone.now();
    riser.gain.gain.setTargetAtTime(0.15 + c * 0.55, t, 0.05);
    riser.hp.frequency.setTargetAtTime(200 * Math.pow(40, c), t, 0.05);
    riser.osc.frequency.setTargetAtTime(Tone.Frequency("D3").toFrequency() * Math.pow(8, c), t, 0.05);
    masterHP.frequency.setTargetAtTime(10 * Math.pow(2, c * 7.5), t, 0.08); // up to ~1.8kHz: the bass drains away
  }
  requestAnimationFrame(tick);
}

const TAKEOVER_TITLE: Partial<Record<LayerId, string>> = { greggs: "GREGGS MODE", madchester: "MADCHESTER MODE" };

export function toggleLayer(id: LayerId) {
  if (!layers) return;
  const s = useStore.getState();
  const want = !(s.pending[id] ?? s.layers[id]);
  s.set({ pending: { ...s.pending, [id]: want } });
  // two toggles in the same instant (voice "drums and bass", the autopilot) must not schedule the
  // click at an identical time: Tone throws "start time must be strictly greater"
  lastTickAt = Math.max(Tone.now(), lastTickAt + 0.012);
  toggleTick?.triggerAttackRelease(want ? "A5" : "D5", "32n", lastTickAt);

  // Land on the next beat: quick enough to feel instant, still in time
  const transport = Tone.getTransport();
  transport.scheduleOnce((time) => {
    const beat = Tone.Time("4n").toSeconds();
    const { gains, entries } = layers!;
    const cutoff = entries[id].frequency;
    cutoff.cancelScheduledValues(time);
    if (want) {
      // sweep in: open the filter over a beat as the layer slams in
      cutoff.setValueAtTime(260, time);
      cutoff.exponentialRampToValueAtTime(20000, time + beat);
      if (!dropActive()) gains[id].gain.rampTo(1, 0.02, time);
    } else {
      // sweep out: close the filter over half a beat, then cut
      cutoff.setValueAtTime(20000, time);
      cutoff.exponentialRampToValueAtTime(180, time + beat / 2);
      if (!dropActive()) gains[id].gain.setValueAtTime(1, time + beat / 2 - 0.01).linearRampToValueAtTime(0, time + beat / 2);
      cutoff.setValueAtTime(20000, time + beat / 2 + 0.02);
    }
    if (id === "greggs" || id === "madchester") fx.themeTarget[id] = want ? 1 : 0;
    if (id === "madchester") transport.swing = want ? 0.24 : 0.14;

    atAudioTime(time, () => {
      playSfx(want ? "whooshIn" : "whooshOut", want ? -12 : -16);
      if (want && id === "greggs") {
        playSfx("steakbake", -13);
        playSfx("greggs", -14);
      }
      if (want && id === "madchester") {
        playSfx("madShout", -6);
        playSfx("madCrowd", -5);
      }
      const color = LAYERS.find((l) => l.id === id)!.color;
      const label = LAYERS.find((l) => l.id === id)!.label;
      const st = useStore.getState();
      const pending = { ...st.pending };
      if (pending[id] === want) delete pending[id];
      st.set({
        layers: { ...st.layers, [id]: want },
        pending,
        banner: {
          text: want && TAKEOVER_TITLE[id] ? TAKEOVER_TITLE[id]! : `${label} ${want ? "IN" : "OUT"}`,
          color,
          big: want && !!TAKEOVER_TITLE[id],
          n: (st.banner?.n ?? 0) + 1,
        },
      });
    });
  }, "@4n");
}

/** Instantly silence every toggleable layer and end any takeover (kiosk reset / new visitor). */
export function resetLayers() {
  if (!layers) return;
  for (const { id } of LAYERS) {
    layers.gains[id].gain.rampTo(0, 0.3);
    layers.entries[id].frequency.cancelScheduledValues(Tone.now());
    layers.entries[id].frequency.value = 20000;
  }
  fx.themeTarget.greggs = fx.themeTarget.madchester = 0;
  Tone.getTransport().swing = 0.14;
  const off = Object.fromEntries(LAYERS.map((l) => [l.id, false])) as Record<LayerId, boolean>;
  useStore.getState().set({ layers: off, pending: {} });
}

/** 0..1 → lowpass sweep, exponential so the whole range is musical. */
export function setFilterOpen(v: number) {
  fx.filter = v;
  masterFilter?.frequency.rampTo(80 * Math.pow(2, v * 8), 0.05);
}

export function beginCharge() {
  if (!layers || dropState !== "idle") return;
  dropState = "building";
  holdStart = performance.now();
}

/** Let go of a build without dropping (kiosk handover). A drop already counting in still lands. */
export function cancelCharge() {
  if (dropState !== "building") return;
  dropState = "idle";
  riser?.gain.gain.rampTo(0, 0.2);
  masterHP?.frequency.rampTo(10, 0.3);
}

/** Returns "drop" | "bottled" | null so the DJ can react. */
export function releaseCharge(): "drop" | "bottled" | null {
  if (dropState !== "building") return null;
  // measure the hold directly rather than trusting the last rendered frame
  const barSecs = (60 / Tone.getTransport().bpm.value) * 4;
  fx.charge = Math.min(1, (performance.now() - holdStart) / 1000 / (barSecs * 2));
  if (fx.charge < 0.3) {
    cancelCharge();
    return "bottled";
  }
  scheduleDrop();
  return "drop";
}

/** Milliseconds until the pending drop lands (0 if none), so BEE-9 can wait rather than talk over it. */
export const msUntilDrop = () => (dropState === "pending" ? Math.max(0, (dropAt - Tone.now()) * 1000) : 0);

function scheduleDrop() {
  if (!layers || dropState !== "building") return;
  dropState = "pending";
  const transport = Tone.getTransport();
  const beat = Tone.Time("4n").toSeconds();
  const bar = Tone.Time("1m").toSeconds();
  // land on the next half-bar; if that's too close to feel the breath, the one after
  let t = transport.nextSubdivision("2n");
  if (t - Tone.now() < beat * 0.6) t += bar / 2;
  dropAt = t;

  // big on-screen count-in, one number per beat
  const beatsLeft = Math.round((t - Tone.now()) / beat);
  for (let k = beatsLeft; k >= 1; k--) atAudioTime(t - k * beat, () => useStore.getState().set({ dropCountdown: k }));

  // the breath: half a beat of silence, then everything at once
  dropGate.gain.setValueAtTime(1, t - beat / 2);
  dropGate.gain.linearRampToValueAtTime(0, t - beat / 2 + 0.04);
  dropGate.gain.setValueAtTime(1, t);
  masterHP.frequency.cancelScheduledValues(t);
  masterHP.frequency.setValueAtTime(10, t);
  riser!.gain.gain.cancelScheduledValues(t);
  riser!.gain.gain.setValueAtTime(0, t);
  for (const g of Object.values(layers.gains)) g.gain.setValueAtTime(1, t);
  sfx.impact?.start(t);
  sfx.steakbake?.start(t);
  if (sfx.madCrowd) sfx.madCrowd.start(t + beat / 2);

  atAudioTime(t, () => {
    dropState = "dropping";
    fx.flash = 1;
    fx.dropping = 1;
    fx.charge = 0;
    const s = useStore.getState();
    s.set({ drops: s.drops + 1, dropCountdown: null, banner: { text: "DROP", color: "#ffffff", big: true, n: (s.banner?.n ?? 0) + 1 } });
  });

  // 8 bars later, hand the mix back to whatever the player has on
  const end = t + bar * 8;
  atAudioTime(end - 0.2, () => {
    const on = useStore.getState().layers;
    for (const { id } of LAYERS) layers!.gains[id].gain.setValueAtTime(on[id] ? 1 : 0, end);
    atAudioTime(end, () => (dropState = "idle"));
  });
}

/** Master volume 0..1 on a perceptual curve, with headroom above the default so "turn it up" works. */
export function setVolume(v: number) {
  const volume = Math.round(Math.max(0, Math.min(1, v)) * 100) / 100;
  // perceptual curve (≈ amplitude²): 50% sounds about half as loud (-12 dB), not a barely-there -6 dB
  Tone.getDestination().volume.rampTo(volume <= 0.001 ? -60 : 40 * Math.log10(volume), 0.3);
  if (volume > 0 && useStore.getState().muted) setMuted(false);
  useStore.getState().set({ volume });
  return volume;
}

export function setMuted(muted: boolean) {
  Tone.getDestination().mute = muted;
  useStore.getState().set({ muted });
}

export function duckMusic(on: boolean) {
  duck?.gain.rampTo(on ? 0.55 : 1, on ? 0.12 : 0.6);
}

export async function stopRecording(): Promise<string | null> {
  if (!recorder || recorder.state !== "started") return null;
  const blob = await recorder.stop();
  return URL.createObjectURL(blob);
}

/** Start a fresh take (discarding anything in progress), so each visitor's download is only their set. */
export async function restartRecording() {
  if (!recorder) return;
  if (recorder.state === "started") await recorder.stop();
  recorder.start();
}

/** Live weather arriving after the engine started: retune on the next bar. */
export const BPM_MIN = 70;
export const BPM_MAX = 150;
/** Once the player sets the tempo, the weather stops choosing it. */
let bpmLocked = false;
let retimeTimer = 0;

/** Glide the whole city to a new tempo (everything is on the transport, so it all follows). */
export function setBpm(value: number) {
  const bpm = Math.round(Math.max(BPM_MIN, Math.min(BPM_MAX, value)));
  bpmLocked = true;
  Tone.getTransport().bpm.rampTo(bpm, 0.5);
  useStore.getState().set({ bpm });
  // retime tempo-synced echoes once the glide has landed
  window.clearTimeout(retimeTimer);
  retimeTimer = window.setTimeout(() => layers?.retime(), 550);
}

export const nudgeBpm = (delta: number) => setBpm(useStore.getState().bpm + delta);

const taps: number[] = [];
/** Tap tempo: average the last few taps; a pause of 2s+ starts a fresh count. */
export function tapTempo() {
  const now = performance.now();
  if (taps.length && now - taps[taps.length - 1] > 2000) taps.length = 0;
  taps.push(now);
  if (taps.length > 5) taps.shift();
  if (taps.length < 3) return taps.length;
  const gaps = taps.slice(1).map((t, i) => t - taps[i]);
  setBpm(60000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length));
  return taps.length;
}

export function applyWeather() {
  const { weather } = useStore.getState();
  fx.rain = Math.min(1, 0.35 + weather.rainMm * 0.25);
  if (!layers) return;
  Tone.getTransport().scheduleOnce(() => {
    scale = scaleFromWeather(weather);
    if (!bpmLocked) Tone.getTransport().bpm.rampTo(bpmFromWeather(weather), 2);
    Tone.getDraw().schedule(
      () => useStore.getState().set({ scaleName: scale.name, ...(bpmLocked ? {} : { bpm: bpmFromWeather(weather) }) }),
      Tone.now(),
    );
  }, "@1m");
}
