import * as Tone from "tone";
import { fx, LAYERS, useStore, type LayerId } from "../store";
import { buildLayers } from "./layers";
import { bpmFromWeather, scaleFromWeather, type Scale } from "./scales";

/** Pre-generated ElevenLabs sound design (npm run gen-sfx). Every one is optional. */
const SFX = ["rain", "crt", "impact", "greggs"] as const;
type SfxName = (typeof SFX)[number];

let scale: Scale = scaleFromWeather(useStore.getState().weather);
let layers: ReturnType<typeof buildLayers> | null = null;
const sfx: Partial<Record<SfxName, Tone.Player>> = {};

// Master chain: layers → filter (cursor) → duck (voice) → comp → limiter → speakers
let masterFilter: Tone.Filter;
let duck: Tone.Gain;
let limiter: Tone.Limiter;
let analyser: Tone.Analyser;
let recorder: Tone.Recorder | null = null;

/** Soft UI tick for layer toggles (replaces a harsh neon-buzz sample). */
let toggleTick: Tone.Synth | null = null;

let riser: { noise: Tone.Noise; hp: Tone.Filter; osc: Tone.Oscillator; gain: Tone.Gain } | null = null;
let holding = false;
let holdStart = 0;
let dropActive = false;

/** Where the voice chain plugs in so BEE-9 is heard (and recorded) but not ducked or filtered. */
export const getVoiceDestination = () => limiter;

/** Load SFX buffers during the intro, before the audio context is unlocked. Missing files are skipped. */
export async function preloadSfx(onProgress?: (p: number) => void) {
  let done = 0;
  await Promise.all(
    SFX.map(async (name) => {
      try {
        const buf = await new Tone.ToneAudioBuffer().load(`/sfx/${name}.mp3`);
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
  if (p.state === "started") p.restart();
  else p.start();
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
  masterFilter = new Tone.Filter({ frequency: 20000, type: "lowpass", rolloff: -24, Q: 1 }).connect(duck);
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
  layers = buildLayers(masterFilter, {
    getScale: () => scale,
    getRain: () => fx.rain,
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
  const riserGain = new Tone.Gain(0).connect(duck);
  const hp = new Tone.Filter(200, "highpass").connect(riserGain);
  const noise = new Tone.Noise("white").connect(hp).start();
  noise.volume.value = -14;
  const osc = new Tone.Oscillator("D3", "sawtooth").connect(riserGain).start();
  osc.volume.value = -26;
  riser = { noise, hp, osc, gain: riserGain };

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

  fx.kick = Math.max(0, fx.kick - dt * 4);
  fx.flash = Math.max(0, fx.flash - dt * 0.6);

  // Charge fills over 2 bars of wall-clock time (frame-rate independent)
  const barSecs = (60 / Tone.getTransport().bpm.value) * 4;
  if (holding) fx.charge = Math.min(1, (now - holdStart) / 1000 / (barSecs * 2));
  else fx.charge = Math.max(0, fx.charge - dt * 3);
  if (riser) {
    const c = fx.charge;
    riser.gain.gain.setTargetAtTime(holding ? c * 0.6 : 0, Tone.now(), 0.05);
    riser.hp.frequency.setTargetAtTime(200 * Math.pow(40, c), Tone.now(), 0.05);
    riser.osc.frequency.setTargetAtTime(Tone.Frequency("D3").toFrequency() * Math.pow(8, c), Tone.now(), 0.05);
  }
  requestAnimationFrame(tick);
}

export function toggleLayer(id: LayerId) {
  if (!layers) return;
  const s = useStore.getState();
  const want = !(s.pending[id] ?? s.layers[id]);
  s.set({ pending: { ...s.pending, [id]: want } });
  toggleTick?.triggerAttackRelease(want ? "A5" : "D5", "32n");
  if (id === "greggs" && want) playSfx("greggs", -12);

  // Land on the next beat: quick enough to feel instant, still in time
  const transport = Tone.getTransport();
  transport.scheduleOnce((time) => {
    if (!dropActive) layers!.gains[id].gain.rampTo(want ? 1 : 0, 0.03, time);
    Tone.getDraw().schedule(() => {
      const st = useStore.getState();
      const pending = { ...st.pending };
      if (pending[id] === want) delete pending[id];
      st.set({ layers: { ...st.layers, [id]: want }, pending });
    }, time);
  }, "@4n");
}

/** 0..1 → lowpass sweep, exponential so the whole range is musical. */
export function setFilterOpen(v: number) {
  fx.filter = v;
  masterFilter?.frequency.rampTo(80 * Math.pow(2, v * 8), 0.05);
}

export function beginCharge() {
  if (!layers || dropActive || holding) return;
  holding = true;
  holdStart = performance.now();
}

/** Returns "drop" | "bottled" | null so the DJ can react. */
export function releaseCharge(): "drop" | "bottled" | null {
  if (!holding) return null;
  holding = false;
  const barSecs = (60 / Tone.getTransport().bpm.value) * 4;
  fx.charge = Math.min(1, (performance.now() - holdStart) / 1000 / (barSecs * 2));
  if (fx.charge < 0.3) return "bottled";

  dropActive = true;
  const transport = Tone.getTransport();
  transport.scheduleOnce((time) => {
    Tone.getDraw().schedule(() => {
      fx.flash = 1;
      playSfx("impact", -9);
    }, time);
    for (const g of Object.values(layers!.gains)) g.gain.rampTo(1, 0.02, time);
    // Full mix for 8 bars, then back to whatever the player had on
    const restoreAt = transport.getTicksAtTime(time) + transport.PPQ * 4 * 8;
    transport.scheduleOnce((t) => {
      const on = useStore.getState().layers;
      for (const { id } of LAYERS) layers!.gains[id].gain.rampTo(on[id] ? 1 : 0, 0.05, t);
      dropActive = false;
    }, `${restoreAt}i`);
  }, "@4n");

  const s = useStore.getState();
  s.set({ drops: s.drops + 1 });
  return "drop";
}

export function setMuted(muted: boolean) {
  Tone.getDestination().mute = muted;
  useStore.getState().set({ muted });
}

export function duckMusic(on: boolean) {
  duck?.gain.rampTo(on ? 0.35 : 1, on ? 0.12 : 0.6);
}

export async function stopRecording(): Promise<string | null> {
  if (!recorder || recorder.state !== "started") return null;
  const blob = await recorder.stop();
  return URL.createObjectURL(blob);
}

export function restartRecording() {
  if (recorder && recorder.state !== "started") recorder.start();
}

/** Live weather arriving after the engine started: retune on the next bar. */
export function applyWeather() {
  const { weather } = useStore.getState();
  fx.rain = Math.min(1, 0.35 + weather.rainMm * 0.25);
  if (!layers) return;
  Tone.getTransport().scheduleOnce(() => {
    scale = scaleFromWeather(weather);
    Tone.getTransport().bpm.rampTo(bpmFromWeather(weather), 2);
    Tone.getDraw().schedule(() => useStore.getState().set({ scaleName: scale.name, bpm: bpmFromWeather(weather) }), Tone.now());
  }, "@1m");
}
