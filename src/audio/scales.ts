import * as Tone from "tone";
import type { Weather } from "../store";

const MODES = {
  // semitone offsets from the root
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
} as const;

export type ModeName = keyof typeof MODES;

export type Scale = {
  name: string;
  rootMidi: number;
  steps: readonly number[];
};

/** Heavier rain => darker mode. A dry day in Manchester is so rare it gets the major-ish one. */
export function scaleFromWeather(w: Weather): Scale {
  const mode: ModeName = w.rainMm > 2 ? "aeolian" : w.rainMm > 0 ? "dorian" : "mixolydian";
  return { name: `D ${mode.toUpperCase()}`, rootMidi: 50, steps: MODES[mode] };
}

/** MIDI note for a scale degree (can be negative or > 7 to cross octaves). */
export function degreeToMidi(scale: Scale, degree: number, octave = 0): number {
  const len = scale.steps.length;
  const oct = Math.floor(degree / len);
  const idx = ((degree % len) + len) % len;
  return scale.rootMidi + scale.steps[idx] + 12 * (oct + octave);
}

export const midiToNote = (m: number) => Tone.Frequency(m, "midi").toNote();

/** Stack thirds within the mode: a diatonic 7th chord on `degree`. */
export function chord(scale: Scale, degree: number, octave = 0): string[] {
  return [0, 2, 4, 6].map((o) => midiToNote(degreeToMidi(scale, degree + o, octave)));
}

/** i – VII – IV – i : moody, a bit Stone Roses. */
export const PROGRESSION = [0, 6, 3, 0];

export const bpmFromWeather = (w: Weather) => Math.round(100 + Math.min(w.rainMm, 4) * 2);
