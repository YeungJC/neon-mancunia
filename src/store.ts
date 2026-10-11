import { create } from "zustand";

export type LayerId = "drums" | "bass" | "lead" | "greggs" | "madchester";

/** `short` is used on phone-width pads where the full label would clip. */
export const LAYERS: { id: LayerId; label: string; short?: string; color: string }[] = [
  { id: "drums", label: "DRUMS", color: "#ff2bd6" },
  { id: "bass", label: "BASS", color: "#00f0ff" },
  { id: "lead", label: "LEAD", color: "#b4ff39" },
  { id: "madchester", label: "MADCHESTER", short: "MADCH", color: "#ffb800" },
  { id: "greggs", label: "GREGGS", color: "#3b8cff" },
];

export const DISTRICTS = [
  {
    name: "PICCADILLY",
    sub: "RAIN // PADS",
    big: ["THE RAIN", "IS THE", "SYNTH."],
    small: "Every drop is a note. Move your cursor and the rain parts around it.",
    next: "Scroll to fly to the Northern Quarter",
  },
  {
    name: "NORTHERN QUARTER",
    sub: "NEON // GROOVE",
    big: ["CLICK", "THE", "NEON."],
    small: "Each sign is a layer of the track: click to switch it on, it drops in on the next beat. The pads below and keys 1–5 do the same.",
    next: "Scroll on to the Haçienda",
  },
  {
    name: "THE HAÇIENDA",
    sub: "FAC 51 // RAVE",
    big: ["HOLD", "SPACE.", "LET GO."],
    small: "Charge the riser, release for the drop. Shove the chrome with your cursor. Hit END SET when you're done.",
    next: "",
  },
] as const;

export type Weather = {
  tempC: number;
  rainMm: number;
  windKmh: number;
  live: boolean;
};

export type Phase = "intro" | "live" | "outro";

type State = {
  phase: Phase;
  district: number;
  /** Chapter the camera is parked at (or flying to). */
  chapter: number;
  travelling: boolean;
  muted: boolean;
  layers: Record<LayerId, boolean>;
  /** Layers toggled but waiting for the next bar to land. */
  pending: Partial<Record<LayerId, boolean>>;
  weather: Weather;
  scaleName: string;
  bpm: number;
  drops: number;
  djLine: string;
  djSpeaking: boolean;
  trackName: string;
  recordingUrl: string | null;
  startedAt: number;
  highQuality: boolean;

  set: (p: Partial<State>) => void;
};

export const useStore = create<State>((set) => ({
  phase: "intro",
  district: 0,
  chapter: 0,
  travelling: false,
  muted: false,
  layers: { drums: false, bass: false, lead: false, greggs: false, madchester: false },
  pending: {},
  weather: { tempC: 11, rainMm: 0.8, windKmh: 18, live: false },
  scaleName: "D DORIAN",
  bpm: 104,
  drops: 0,
  djLine: "",
  djSpeaking: false,
  trackName: "",
  recordingUrl: null,
  startedAt: 0,
  highQuality: true,
  set: (p) => set(p),
}));

/**
 * Per-frame values written by the audio engine and read inside useFrame.
 * Deliberately NOT in zustand: these change 60x a second and must not trigger React renders.
 */
export const fx = {
  bass: 0,
  mids: 0,
  highs: 0,
  energy: 0,
  /** 64 normalised FFT bins, 0..1 */
  fft: new Float32Array(64),
  /** 1 on each kick, decays */
  kick: 0,
  /** 0..1 riser charge while Space is held */
  charge: 0,
  /** 1 at the drop, decays */
  flash: 0,
  /** 0..1 filter openness (1 = fully open) */
  filter: 1,
  speaking: 0,
  /** Rain intensity 0..1 used by visuals and the arpeggio */
  rain: 0.6,
  /** Normalised pointer, -1..1 */
  pointer: { x: 0, y: 0 },
  pointerOnSign: false,
  /** What the cursor is over, shown next to it (e.g. "TURN ON DRUMS"). */
  hoverLabel: "",
  /** 0..1 live level of each layer, for the pads' meters. */
  levels: { drums: 0, bass: 0, lead: 0, greggs: 0, madchester: 0 } as Record<LayerId, number>,
  /** Camera position along the chapters: 0 = Piccadilly … 2 = Haçienda (fractional while flying). */
  rigT: 0,
  /** 0..1 bell curve while flying between chapters. */
  warp: 0,
  /** Rain-note splashes waiting to be drawn: pan -1..1 */
  splashes: [] as { pan: number; color: number }[],
};
