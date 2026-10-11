import * as THREE from "three";

/** z centre of each district; the camera flies down -z. */
export const DISTRICT_Z = [0, -70, -140] as const;

export const CAMERA_PATH = new THREE.CatmullRomCurve3(
  [
    new THREE.Vector3(0, 3.4, 16),
    new THREE.Vector3(1.2, 3.0, -6),
    new THREE.Vector3(-0.8, 3.4, -28),
    new THREE.Vector3(0, 3.2, -50),
    new THREE.Vector3(0.8, 3.0, -80),
    new THREE.Vector3(-0.6, 3.4, -110),
    new THREE.Vector3(0, 3.4, -134),
  ],
  false,
  "centripetal",
);

/** Where the camera parks for each chapter, and what it looks at there. */
export const CHAPTER_Z = [16, -50, -134] as const;
export const CHAPTER_LOOK = [
  new THREE.Vector3(0, 4.4, -20),
  new THREE.Vector3(0, 5.0, -66),
  new THREE.Vector3(0, 6.6, -170),
] as const;

/** Path parameter for a given z (the path runs monotonically down -z). */
const SAMPLES = 400;
const zTable = [...Array(SAMPLES + 1)].map((_, i) => CAMERA_PATH.getPointAt(i / SAMPLES).z);
export function uAtZ(z: number) {
  for (let i = 1; i <= SAMPLES; i++) {
    if (zTable[i] <= z) {
      const a = zTable[i - 1], b = zTable[i];
      return (i - 1 + (a - z) / (a - b)) / SAMPLES;
    }
  }
  return 1;
}

/** rigT (0..2, fractional while flying) → z along the street. */
export function zAtRig(t: number) {
  const i = Math.min(CHAPTER_Z.length - 2, Math.floor(t));
  return THREE.MathUtils.lerp(CHAPTER_Z[i], CHAPTER_Z[i + 1], t - i);
}

export const districtAt = (z: number) => (z > -35 ? 0 : z > -105 ? 1 : 2);

export const NEON = {
  magenta: "#ff2bd6",
  cyan: "#00f0ff",
  amber: "#ffb800",
  violet: "#8a3bff",
  lime: "#b4ff39",
  blue: "#3b8cff",
};

export const FOG_COLOR = new THREE.Color("#07020f");
export const FOG_DENSITY = 0.016;

/** Deterministic PRNG so the city is the same every load (and for every judge). */
export function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
