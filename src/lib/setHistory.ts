import { fx, LAYERS, useStore, type LayerId } from "../store";

/**
 * A memory of the set for the poster: the spectrum every half-second (Joy Division's pulsar plot,
 * but of *your* track) plus which layers were ever used.
 */
const MAX_ROWS = 600; // 5 minutes at 2/s; longer sets keep the most recent 5
const rows: Float32Array[] = [];
const used = new Set<LayerId>();
let timer = 0;

export function startHistory() {
  stopHistory();
  timer = window.setInterval(() => {
    // skip silence (e.g. before the first beat lands)
    if (fx.energy < 0.02) return;
    rows.push(fx.fft.slice());
    if (rows.length > MAX_ROWS) rows.shift();
  }, 500);
}

export function stopHistory() {
  window.clearInterval(timer);
}

export function resetHistory() {
  rows.length = 0;
  used.clear();
}

export const historyRows = () => rows;
export const layersUsed = () => LAYERS.filter((l) => used.has(l.id)).map((l) => l.label);

useStore.subscribe((s) => {
  for (const { id } of LAYERS) if (s.layers[id]) used.add(id);
});
