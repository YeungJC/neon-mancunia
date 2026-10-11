import { useEffect } from "react";
import { DISTRICTS, fx, useStore } from "../store";
import { poke } from "./dj";

/**
 * Smooth scroll with a soft snap (Lusion / Active Theory feel):
 * wheel, trackpad and touch move a target continuously; the camera position (fx.rigT) eases toward it;
 * once input stops, the target settles on a chapter, leaning the way you were heading.
 */
const LAST = DISTRICTS.length - 1;
const PX_PER_CHAPTER = 900; // wheel pixels to travel one chapter
const SNAP_AFTER_MS = 200; // quiet time before snapping
const LEAN = 0.1; // move this far past a chapter and it commits to the next one (≈ one wheel notch)
const DAMPING = 3.4; // higher = camera catches the target faster

const nav = { target: 0, anchor: 0, lastInput: 0, snapped: true };

const clamp = (v: number) => Math.max(0, Math.min(LAST, v));

function nudge(chapters: number) {
  if (useStore.getState().phase !== "live") return;
  nav.target = clamp(nav.target + chapters);
  nav.lastInput = performance.now();
  nav.snapped = false;
  poke();
}

/** Jump (smoothly) to a chapter: nav dots, arrow keys, the "next" prompt. */
export function goTo(i: number) {
  if (useStore.getState().phase !== "live") return;
  nav.target = nav.anchor = clamp(Math.round(i));
  nav.snapped = true;
  poke();
}

export const next = () => goTo(nav.anchor + 1);
export const prev = () => goTo(nav.anchor - 1);

function settle() {
  const d = nav.target - nav.anchor;
  const to = d > LEAN ? Math.ceil(nav.target) : d < -LEAN ? Math.floor(nav.target) : nav.anchor;
  nav.target = nav.anchor = clamp(to);
  nav.snapped = true;
}

function step(dt: number) {
  if (!nav.snapped && performance.now() - nav.lastInput > SNAP_AFTER_MS) settle();
  const prevT = fx.rigT;
  fx.rigT += (nav.target - fx.rigT) * (1 - Math.exp(-dt * DAMPING));
  if (Math.abs(nav.target - fx.rigT) < 0.0005) fx.rigT = nav.target;
  const speed = Math.abs(fx.rigT - prevT) / Math.max(dt, 1e-3); // chapters per second
  fx.warp += (Math.min(1, speed / 0.8) - fx.warp) * Math.min(1, dt * 6);

  const s = useStore.getState();
  const chapter = Math.round(fx.rigT);
  const travelling = Math.abs(fx.rigT - nav.target) > 0.04 || Math.abs(fx.rigT - chapter) > 0.04;
  if (chapter !== s.chapter || travelling !== s.travelling) s.set({ chapter, travelling });
}

export function useChapterNav() {
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      step(Math.min(0.1, (now - last) / 1000));
      last = now;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const onWheel = (e: WheelEvent) => {
      const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * innerHeight : e.deltaY;
      nudge(px / PX_PER_CHAPTER);
    };
    let touchY = 0;
    let touchUI = false;
    const onTouchStart = (e: TouchEvent) => { touchY = e.touches[0].clientY; touchUI = !!(e.target instanceof Element && e.target.closest("button, input, .rain-deck, canvas")); };
    const onTouchMove = (e: TouchEvent) => {
      if (touchUI) return;
      const y = e.touches[0].clientY;
      nudge(((touchY - y) * 2.2) / PX_PER_CHAPTER);
      touchY = y;
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.target instanceof Element && e.target.closest("input, button, textarea, select"))) return;
      if (["ArrowDown", "ArrowRight", "PageDown"].includes(e.key)) next();
      if (["ArrowUp", "ArrowLeft", "PageUp"].includes(e.key)) prev();
    };
    addEventListener("wheel", onWheel, { passive: true });
    addEventListener("touchstart", onTouchStart, { passive: true });
    addEventListener("touchmove", onTouchMove, { passive: true });
    addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("wheel", onWheel);
      removeEventListener("touchstart", onTouchStart);
      removeEventListener("touchmove", onTouchMove);
      removeEventListener("keydown", onKey);
    };
  }, []);
}
