import * as Tone from 'tone';
import { create } from 'zustand';
import { useStore } from '../store';
import { degreeToMidi, midiToNote, PROGRESSION, type Scale } from './scales';
import { addNote, emptyPattern, quantizeStep, RAIN_DEGREES, type RainNote } from './rainPattern';

export type RainEvent = { id: number; lane: number; midi: number; time: number; velocity: number; source: 'hand' | 'loop' | 'demo' };
export const rainEvents: RainEvent[] = [];
export const useRain = create<{
  mode: 'empty' | 'armed' | 'recording' | 'playing'; step: number; count: number;
  vocals: boolean; vocalReady: boolean[]; activeVocal: number; touched: boolean;
}>(() => ({ mode: 'empty', step: 0, count: 0, vocals: false, vocalReady: [false, false, false], activeVocal: -1, touched: false }));
let instruments: Tone.FMSynth[] = [];
/** The keys' output bus (exported so levels can be checked against the other layers). */
export let rainOutput: Tone.Gain | null = null;
let getScale: () => Scale;
let pattern = emptyPattern();
let captureStart = Infinity;
let serial = 0;
let generation = 0;
let vocalGeneration = 0;
let demo = true;
const players: (Tone.Player | null)[] = [null, null, null];
export const VOCAL_LABELS = ['MAKE IT DANCE', 'MINT', 'TURN IT UP'];

/** Keys play tones of the chord sounding at `time` (root, 3rd, 5th, 7th, octave), so they always fit the background. */
const CHORD_TONES = [0, 2, 4, 6, 7];
function laneMidi(lane: number, time: number) {
  const t = Tone.getTransport();
  const bar = Math.floor(t.getTicksAtTime(time) / (t.PPQ * 4));
  const chordDeg = PROGRESSION[bar % PROGRESSION.length];
  // keep every chord's root in the same band (≤ G4) so the keys don't leap an octave between bars
  const shift = degreeToMidi(getScale(), chordDeg, 1) > 67 ? -12 : 0;
  return degreeToMidi(getScale(), chordDeg + CHORD_TONES[lane], 1) + shift;
}

function emit(lane: number, time: number, velocity: number, source: RainEvent['source']) {
  const midi = laneMidi(lane, time);
  instruments[lane].triggerAttackRelease(midiToNote(midi), '16n', time, velocity);
  if (!rainEvents.some(e => e.lane === lane && Math.abs(e.time - time) < 0.025))
    rainEvents.push({ id: serial++, lane, midi, time, velocity, source });
  if (rainEvents.length > 100) rainEvents.shift();
}

export async function preloadVocals() {
  await Promise.all(players.map(async (_, i) => {
    try {
      const p = await new Tone.Player().load(`/voice/rain-${i}.mp3`);
      p.volume.value = -8;
      p.fadeIn = 0.015;
      p.fadeOut = 0.08;
      players[i] = p;
      useRain.setState(s => ({ vocalReady: s.vocalReady.map((v, k) => k === i || v) }));
    } catch { /* A missing asset is shown as unavailable, never silently substituted. */ }
  }));
}

export function initRainInstrument(destination: Tone.InputNode, scale: () => Scale) {
  getScale = scale;
  // Warm electric piano (Rhodes-ish FM): the same family as the Madchester piano and the pads, so it
  // sits *in* the mix. A touch of chorus and room; no echo.
  // level measured against drums+bass+lead: +5 dB lands the keys ~6 dB under the full band (lead level)
  rainOutput = new Tone.Gain(Tone.dbToGain(5)).connect(destination);
  const reverb = new Tone.Reverb({ decay: 3, wet: 0.24 }).connect(rainOutput);
  const warmth = new Tone.Filter({ type: 'lowpass', frequency: 3200, rolloff: -12 }).connect(reverb);
  const chorus = new Tone.Chorus({ frequency: 0.9, delayTime: 3, depth: 0.3, wet: 0.3 }).start().connect(warmth);
  instruments = RAIN_DEGREES.map((_, i) => {
    const pan = new Tone.Panner((i - 2) * 0.3).connect(chorus);
    return new Tone.FMSynth({
      harmonicity: 1,
      modulationIndex: 3.2,
      oscillator: { type: 'sine' },
      modulation: { type: 'sine' },
      envelope: { attack: 0.004, decay: 1.1, sustain: 0.12, release: 0.8 },
      modulationEnvelope: { attack: 0.002, decay: 0.35, sustain: 0.05, release: 0.4 },
      volume: -4,
    }).connect(pan);
  });
  players.forEach(p => p?.connect(destination));
  const transport = Tone.getTransport();
  const initialTick = transport.ticks;
  transport.scheduleRepeat(time => {
    const ticks = Math.round(transport.getTicksAtTime(time));
    const step = quantizeStep(ticks, 0, transport.PPQ);
    const revision = generation;
    const mode = useRain.getState().mode;
    if (ticks >= captureStart + transport.PPQ * 8 && (mode === 'recording' || mode === 'armed')) {
      captureStart = Infinity;
      useRain.setState({ mode: pattern.some(s => s.length) ? 'playing' : 'empty' });
    } else if (ticks >= captureStart && mode === 'armed') {
      useRain.setState({ mode: 'recording' });
    }
    if (useRain.getState().mode === 'playing' && useStore.getState().phase === 'live') {
      pattern[step].forEach(n => emit(n.lane, time, n.velocity, 'loop'));
      // Forecast a beat of falling droplets; only the audio scheduler can sound an impact.
      const future = time + Tone.Time('4n').toSeconds();
      pattern[(step + 4) % 32].forEach(n => {
        rainEvents.push({ id: serial++, lane: n.lane, midi: laneMidi(n.lane, future), time: future, velocity: n.velocity, source: 'loop' });
      });
      while (rainEvents.length > 100) rainEvents.shift();
    }
    // Three sparse notes teach the relationship, then the instrument belongs to the player.
    const demoStep = Math.round((ticks - initialTick) / (transport.PPQ / 4));
    if (demo && !useRain.getState().touched && [0, 8, 16].includes(demoStep)) emit(demoStep / 4, time, 0.7, 'demo');
    if (demoStep >= 16) demo = false;
    if (useRain.getState().vocals && step % 8 === 0) triggerVocal((step / 8) % 3, time, true);
    Tone.getDraw().schedule(() => {
      if (revision === generation) useRain.setState({ step });
    }, time);
  }, '16n', 0);
}

export function playRain(lane: number, velocity = 0.8) {
  if (!instruments.length || useStore.getState().phase !== 'live' || lane < 0 || lane > 4) return;
  useRain.setState({ touched: true });
  demo = false;
  emit(lane, Tone.immediate(), velocity, 'hand');
  const ticks = Tone.getTransport().ticks;
  if (ticks >= captureStart && ticks < captureStart + Tone.getTransport().PPQ * 8) {
    const step = quantizeStep(ticks, captureStart, Tone.getTransport().PPQ);
    addNote(pattern, step, { lane, velocity } satisfies RainNote);
    useRain.setState({ count: pattern.reduce((n, s) => n + s.length, 0) });
  }
}
export function captureRain() {
  if (!instruments.length) return;
  clearRain();
  demo = false;
  const t = Tone.getTransport();
  captureStart = (Math.floor(t.ticks / (t.PPQ * 4)) + 1) * t.PPQ * 4;
  // A two-bar phrase starts on either bar of the global two-bar grid.
  captureStart = Math.ceil(captureStart / (t.PPQ * 8)) * t.PPQ * 8;
  useRain.setState({ mode: 'armed', touched: true });
}
export function clearRain() {
  generation++;
  pattern = emptyPattern();
  captureStart = Infinity;
  rainEvents.length = 0;
  useRain.setState({ mode: 'empty', count: 0 });
}
export function triggerVocal(i: number, time = Tone.now(), rhythmic = false) {
  if (useStore.getState().phase !== 'live' || !players[i]?.loaded) return;
  players.forEach(p => { if (p?.state === 'started') p.stop(time); });
  const duration = rhythmic ? Math.min(players[i]!.buffer.duration, Tone.Time('2n').toSeconds()) : players[i]!.buffer.duration;
  players[i]!.start(time, 0, duration);
  const token = ++vocalGeneration;
  Tone.getDraw().schedule(() => { if (token === vocalGeneration) useRain.setState({ activeVocal: i }); }, time);
  Tone.getDraw().schedule(() => { if (token === vocalGeneration) useRain.setState({ activeVocal: -1 }); }, time + duration);
}
export function resetRain() {
  vocalGeneration++;
  clearRain();
  demo = false;
  players.forEach(p => { if (p?.state === 'started') p.stop(); });
  useRain.setState({ vocals: false, activeVocal: -1 });
}
