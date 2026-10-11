import { historyRows, layersUsed } from "./setHistory";
import { useStore } from "../store";

export const POSTER_W = 1200;
export const POSTER_H = 1600;
const ROWS = 56;

/** Factory catalogue number, counting up per device. Storage can be unavailable; the poster still works. */
export function nextCatalogue() {
  let n: number;
  try {
    n = Number(localStorage.getItem("nm-fac") ?? "0") + 1;
    localStorage.setItem("nm-fac", String(n));
  } catch {
    n = Math.floor(Math.random() * 900) + 100;
  }
  return `FAC 2087/${String(n).padStart(3, "0")}`;
}

/** Sample ROWS evenly from the history; if the set was short, pad with gentle noise so it still reads. */
export function pickRows(): number[][] {
  const h = historyRows();
  return [...Array(ROWS)].map((_, r) => {
    const src = h.length ? h[Math.floor((r / ROWS) * h.length)] : null;
    return [...Array(64)].map((_, i) => (src ? src[i] : 0.05 + Math.random() * 0.05));
  });
}

const LEFT = 260, RIGHT = 940, TOP = 330, GAP = 12, AMP = 175, STEPS = 140;

/** One pulsar line: bins mirrored about the centre (low end in the middle), shaped by a centred window. */
function rowPoints(bins: number[], r: number): [number, number][] {
  const base = TOP + r * GAP;
  return [...Array(STEPS + 1)].map((_, s) => {
    const u = s / STEPS;
    // spread ~52 bins from the centre outward on a gentle curve so lows and mids both shape the ridge
    const bin = Math.min(63, Math.floor(Math.pow(Math.abs(u - 0.5) * 2, 0.8) * 52));
    const window = Math.pow(Math.sin(Math.PI * u), 1.6);
    const wobble = Math.sin(u * 40 + r * 1.7) * 0.03;
    const v = Math.max(0, (bins[bin] - 0.08 + wobble) * window);
    return [LEFT + u * (RIGHT - LEFT), base - v * AMP];
  });
}

/**
 * Unknown Pleasures from the set: each row is a moment of the track.
 * Call with revealRows < ROWS to animate the draw-in; the type only appears on the full draw.
 * Await document.fonts.ready once before the first call.
 */
export function drawPoster(canvas: HTMLCanvasElement, rows: number[][], meta: { trackName: string; fac: string }, revealRows = ROWS) {
  const g = canvas.getContext("2d")!;
  canvas.width = POSTER_W;
  canvas.height = POSTER_H;
  g.fillStyle = "#000";
  g.fillRect(0, 0, POSTER_W, POSTER_H);

  g.lineWidth = 2.2;
  g.lineJoin = "round";
  g.strokeStyle = "#fff";
  for (let r = 0; r < Math.min(revealRows, ROWS); r++) {
    const pts = rowPoints(rows[r], r);
    const trace = () => pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    // fill below in black so nearer rows hide the ones behind, then stroke the line
    g.beginPath();
    trace();
    g.lineTo(RIGHT, TOP + r * GAP + 40);
    g.lineTo(LEFT, TOP + r * GAP + 40);
    g.closePath();
    g.fillStyle = "#000";
    g.fill();
    g.beginPath();
    trace();
    g.stroke();
  }
  if (revealRows < ROWS) return;

  const s = useStore.getState();
  g.fillStyle = "#fff";
  g.font = "700 26px 'JetBrains Mono', monospace";
  g.fillText(meta.fac, 90, 120);
  g.textAlign = "right";
  g.fillText("NEON MANCUNIA", POSTER_W - 90, 120);
  g.textAlign = "left";

  // title, wrapped to fit
  g.font = "900 64px Orbitron, sans-serif";
  const lines: string[] = [];
  let line = "";
  for (const w of meta.trackName.split(" ")) {
    const test = line ? `${line} ${w}` : w;
    if (g.measureText(test).width > POSTER_W - 180 && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  lines.push(line);
  lines.forEach((l, i) => g.fillText(l, 90, 1180 + i * 74));

  const y0 = 1180 + lines.length * 74 + 30;
  const used = layersUsed();
  g.font = "400 24px 'JetBrains Mono', monospace";
  g.fillStyle = "#bbb";
  g.fillText(`${s.drops} DROP${s.drops === 1 ? "" : "S"} · ${s.scaleName} · ${s.bpm} BPM`, 90, y0);
  g.fillText(used.length ? used.join(" + ") : "RAIN + PADS", 90, y0 + 38);
  const date = new Date().toLocaleDateString("en-GB").replace(/\/\d{4}$/, "/2087");
  g.fillText(`MCR ${s.weather.tempC}°C · ${s.weather.rainMm.toFixed(1)}MM/H · ${date}`, 90, y0 + 76);
  g.font = "400 18px 'JetBrains Mono', monospace";
  g.fillStyle = "#666";
  g.fillText("PERFORMED LIVE IN MANCHESTER. THE RAIN WAS THE SYNTH.", 90, POSTER_H - 80);
  g.textAlign = "right";
  g.fillText("VOICE: BEE-9", POSTER_W - 90, POSTER_H - 80);
  g.textAlign = "left";
}

export const POSTER_ROWS = ROWS;
