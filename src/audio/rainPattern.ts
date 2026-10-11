export const RAIN_KEYS = ['a', 's', 'd', 'f', 'g'];
// Saturated to match the city's neon (cyan · blue · violet · magenta · amber)
export const RAIN_COLORS = ['#00f0ff', '#3b8cff', '#a14bff', '#ff2bd6', '#ffb800'];
export const RAIN_DEGREES = [0, 2, 3, 4, 6];
export const LOOP_STEPS = 32;
export type RainNote = { lane: number; velocity: number };
export function quantizeStep(ticks: number, start: number, ppq: number) {
  return ((Math.round((ticks - start) / (ppq / 4)) % LOOP_STEPS) + LOOP_STEPS) % LOOP_STEPS;
}
export function addNote(pattern: RainNote[][], step: number, note: RainNote) {
  const slot = pattern[step];
  const existing = slot.findIndex(n => n.lane === note.lane);
  if (existing >= 0) slot[existing] = note;
  else slot.push(note);
}
export const emptyPattern = (): RainNote[][] => Array.from({ length: LOOP_STEPS }, () => []);
