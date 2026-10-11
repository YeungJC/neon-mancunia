import gsap from "gsap";
import { useEffect } from "react";
import { beginCharge, releaseCharge, setFilterOpen, toggleLayer } from "../audio/engine";
import { fx, LAYERS, useStore } from "../store";
import { heckle, poke } from "./dj";

/** Keyboard + pointer: Space = drop, 1-5 = layers, drag = filter, Q = quality. */
export function useControls() {
  useEffect(() => {
    let dragging = false;
    const live = () => useStore.getState().phase === "live";

    const onKeyDown = (e: KeyboardEvent) => {
      if (!live() || e.repeat) return;
      if (e.code === "Space") {
        e.preventDefault();
        beginCharge();
      }
      const n = Number(e.key);
      if (n >= 1 && n <= LAYERS.length) toggleLayer(LAYERS[n - 1].id);
      if (e.key.toLowerCase() === "q") useStore.getState().set({ highQuality: !useStore.getState().highQuality });
      poke();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== "Space" || !live()) return;
      const r = releaseCharge();
      if (r === "drop") heckle(useStore.getState().drops === 1 ? "firstDrop" : "drop");
      if (r === "bottled") heckle("bottled");
    };
    const onMove = (e: PointerEvent) => {
      fx.pointer.x = (e.clientX / innerWidth) * 2 - 1;
      fx.pointer.y = -(e.clientY / innerHeight) * 2 + 1;
      if (dragging) setFilterOpen(Math.max(0, Math.min(1, 1 - e.clientY / innerHeight)) * 0.92 + 0.08);
    };
    const onDown = (e: PointerEvent) => {
      if (!live() || fx.pointerOnSign || (e.target as HTMLElement).closest("button, a")) return;
      dragging = true;
      gsap.killTweensOf(fx);
      onMove(e);
      poke();
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      // spring the filter back open — a free "build" every time you let go
      gsap.to(fx, { filter: 1, duration: 1.4, ease: "power2.in", onUpdate: () => setFilterOpen(fx.filter) });
    };

    // When every layer is on, BEE-9 notices.
    const unsub = useStore.subscribe((s, prev) => {
      const all = LAYERS.every((l) => s.layers[l.id]);
      if (all && !LAYERS.every((l) => prev.layers[l.id])) heckle("allLayers");
      if (s.layers.greggs && !prev.layers.greggs) heckle("greggs");
      if (s.district !== prev.district && s.phase === "live") heckle("district");
    });

    addEventListener("keydown", onKeyDown);
    addEventListener("keyup", onKeyUp);
    addEventListener("pointermove", onMove);
    addEventListener("pointerdown", onDown);
    addEventListener("pointerup", onUp);
    return () => {
      unsub();
      removeEventListener("keydown", onKeyDown);
      removeEventListener("keyup", onKeyUp);
      removeEventListener("pointermove", onMove);
      removeEventListener("pointerdown", onDown);
      removeEventListener("pointerup", onUp);
    };
  }, []);
}
