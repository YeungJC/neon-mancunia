import type { Weather } from "../store";

export type DJEvent = "tick" | "drop" | "firstDrop" | "bottled" | "allLayers" | "idle" | "district" | "greggs";

/**
 * BEE-9's fixed lines. `npm run gen-sfx` renders each to /voice/line-NN.mp3 with ElevenLabs,
 * so at demo time they cost no quota and work offline. Keep the order stable (indices are file names).
 */
export const STATIC_LINES = [
  "Our kid, that beat's wetter than Piccadilly Gardens in July.",
  "Mint. Absolutely mint. The rain's never sounded this expensive.",
  "Is that a bassline or did a tram just break down?",
  "Proper shambolic, that. I love it.",
  "Even Liam would say that's a bit much. Keep going.",
  "Two thousand eighty seven and it's still raining. Make it dance, then.",
  "I've heard better drops off the Mancunian Way, to be fair.",
  "Northern Quarter's buzzing. Mostly me, I'm a bee.",
  "Turn it up. The pigeons on Market Street can't hear you.",
  "That's not a key change, that's a cry for help.",
  "Sound. Dead sound. Literally, it's all sound.",
  "Hold space, you coward. The Haçienda's waiting.",
  "You've bottled it. Classic. Try again, our kid.",
  "Big drop. The Etihad felt that one.",
  "Is it raining or are those just your hi-hats?",
  "I've seen livelier Tuesdays in Salford. Add some drums.",
  "Greggs layer engaged. This is now a sausage roll rave.",
  "Factory Records would've signed that. Then lost the contract.",
  "Absolute scenes. Someone call Tony Wilson's hologram.",
  "Cracking stuff. My wings are vibrating.",
  "That bassline's got more swagger than an Oasis reunion.",
  "Bit quiet in here. Is this a library or a rave?",
  "Madchester mode. Get your bucket hat on.",
  "Every raindrop's a note. That's the most Manchester sentence ever.",
  "Eh up, did you just do a crescendo? Get in.",
  "Not bad for a city that's ninety percent drizzle.",
  "The Hacienda must be built. And then built again in neon.",
  "I'm a cyber bee and even I'm dancing.",
  "Your filter sweep's smoother than a Bury Market black pudding.",
  "Right, that's a banger. Don't let it go to your head.",
];

/** Which fixed lines fit each event. */
export const STATIC_FOR: Record<DJEvent, number[]> = {
  tick: [0, 1, 2, 3, 4, 6, 10, 14, 17, 19, 20, 25, 27, 28],
  bottled: [12, 9],
  greggs: [16],
  drop: [13, 24, 18, 29],
  firstDrop: [13, 18, 24],
  allLayers: [29, 22, 19, 20],
  idle: [8, 15, 21, 11],
  district: [7, 26, 5, 23],
};

export const staticFile = (i: number) => `/voice/line-${String(i).padStart(2, "0")}.mp3`;

export type SetState = {
  district: string;
  weather: Weather;
  drops: number;
  bpm: number;
  scale: string;
  layers: string[];
};

/** Lines with live details: voiced on the fly by ElevenLabs (a few dozen characters of quota each). */
export const TEMPLATES: Record<DJEvent, ((s: SetState) => string)[]> = {
  tick: [
    (s) => `${s.bpm} BPM in ${s.scale.toLowerCase()}. Proper Manc maths, that.`,
    (s) => `${s.weather.tempC} degrees in Manchester and you're making it sound like Ibiza.`,
    (s) => (s.layers.length ? `${s.layers.join(", ")}. That's a set, that is.` : `Just rain and pads? Bold. Very ambient. Very Salford.`),
  ],
  drop: [(s) => `Drop number ${s.drops}. The Etihad felt that one.`, (s) => `${s.drops} drops and counting. The pigeons are raving.`],
  firstDrop: [(s) => `First drop in ${s.district}. Get in, our kid.`],
  bottled: [() => `You bottled it. Hold space longer, you big soft lad.`],
  allLayers: [(s) => `All ${s.layers.length} layers on. Absolute scenes in ${s.district}.`],
  idle: [(s) => `It's ${s.weather.tempC} degrees out and you've gone quiet. Click a sign, our kid.`],
  district: [
    (s) => `Welcome to ${s.district}. Mind the puddles.`,
    (s) =>
      s.weather.rainMm > 0
        ? `${s.district}. ${s.weather.rainMm.toFixed(1)} mil of rain an hour. Perfect.`
        : `${s.district}. Zero rain in Manchester. The satellites must be broken.`,
  ],
  greggs: [() => `Greggs layer on. Somebody get this producer a steak bake.`],
};

const A = ["WET", "NEON", "ELECTRIC", "MIDNIGHT", "BAGGY", "CHROME", "SECOND", "LAST", "ENDLESS", "NORTHERN"];
const N = ["DRIZZLE", "TRAM", "CANAL", "WORKER BEE", "BUCKET HAT", "SAUSAGE ROLL", "PIGEON", "SKYLINE", "RAVE", "PUDDLE"];
const P = ["OLDHAM STREET", "PICCADILLY", "SALFORD QUAYS", "ANCOATS", "DEANSGATE", "THE MANCUNIAN WAY"];

/** Factory Records-ish track names, no API needed. */
export function trackName() {
  const r = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
  const forms = [
    () => `${r(A)} ${r(N)}`,
    () => `${r(N)} ON ${r(P)}`,
    () => `${r(A)} ${r(N)} (${r(P)} MIX)`,
    () => `FAC ${2000 + Math.floor(Math.random() * 99)}: ${r(N)}`,
  ];
  return r(forms)();
}
