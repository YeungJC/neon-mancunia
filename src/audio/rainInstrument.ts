import * as Tone from 'tone';
import { create } from 'zustand';
import { useStore } from '../store';
import { degreeToMidi, midiToNote, type Scale } from './scales';
import { addNote, emptyPattern, quantizeStep, RAIN_DEGREES, type RainNote } from './rainPattern';

export type RainEvent = { id: number; lane: number; midi: number; time: number; velocity: number; source: 'hand' | 'loop' | 'demo' };
export const rainEvents: RainEvent[] = [];
export const useRain = create<{
  mode: 'empty' | 'armed' | 'recording' | 'playing'; step: number; count: number;
  vocals: boolean; vocalReady: boolean[]; activeVocal: number; touched: boolean;
}>(() => ({ mode: 'empty', step: 0, count: 0, vocals: false, vocalReady: [false, false, false], activeVocal: -1, touched: false }));
let instruments: Tone.Synth[] = [];
let getScale: () => Scale;
let pattern = emptyPattern();
let captureStart = Infinity;
let serial = 0;
let generation = 0;
let vocalGeneration = 0;
let demo = true;
const players: (Tone.Player | null)[] = [null, null, null];
export const VOCAL_LABELS = ['MAKE IT DANCE', 'MINT', 'TURN IT UP'];

function emit(lane: number, time: number, velocity: number, source: RainEvent['source']) {
  const midi = degreeToMidi(getScale(), RAIN_DEGREES[lane], 1);
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
  const reverb = new Tone.Reverb({ decay: 2.8, wet: 0.22 }).connect(destination);
  instruments = RAIN_DEGREES.map((_, i) => {
    const pan = new Tone.Panner((i - 2) * 0.35).connect(reverb);
    return new Tone.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.003, decay: 0.6, sustain: 0, release: 0.35 }, volume: -10 }).connect(pan);
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
        rainEvents.push({ id: serial++, lane: n.lane, midi: degreeToMidi(getScale(), RAIN_DEGREES[n.lane], 1), time: future, velocity: n.velocity, source: 'loop' });
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
