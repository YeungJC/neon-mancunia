import { playRain, triggerVocal } from "../audio/rainInstrument";
import { RAIN_KEYS } from "../audio/rainPattern";
import { useEffect } from "react";
import { beginCharge, cancelCharge, nudgeBpm, releaseCharge, tapTempo, toggleLayer } from "../audio/engine";
import { fx, LAYERS, useStore } from "../store";
import { heckle, poke } from "./dj";

/** Play the scene: ASDFG notes, ZXC vocal effects, Space drop, 1–5 layers. */
export function useControls() {
  useEffect(() => {
    const live = () => useStore.getState().phase === "live";

    const onKeyDown = (e: KeyboardEvent) => {
      if (!live() || e.repeat || (e.target instanceof Element && e.target.closest("input, textarea, select"))) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const effect = ["z", "x", "c"].indexOf(e.key.toLowerCase());
      if (effect >= 0) { e.preventDefault(); triggerVocal(effect); }
      const lane = RAIN_KEYS.indexOf(e.key.toLowerCase());
      if (lane >= 0) { e.preventDefault(); playRain(lane); }
      if (e.code === "Space" && !(e.target instanceof Element && e.target.closest("button"))) {
        e.preventDefault();
        beginCharge();
      }
      const n = Number(e.key);
      if (n >= 1 && n <= LAYERS.length) toggleLayer(LAYERS[n - 1].id);
      if (e.key.toLowerCase() === "q") useStore.getState().set({ highQuality: !useStore.getState().highQuality });
      if (e.key === "[") nudgeBpm(e.shiftKey ? -10 : -2);
      if (e.key === "]") nudgeBpm(e.shiftKey ? 10 : 2);
      if (e.key === "{") nudgeBpm(-10); // shift+[ on most layouts
      if (e.key === "}") nudgeBpm(10);
      if (e.key.toLowerCase() === "t") tapTempo();
      poke();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== "Space" || !live()) return;
      // a successful drop is reacted to when it lands (below), so BEE-9 never talks over the build
      if (releaseCharge() === "bottled") heckle("bottled");
    };
    const onMove = (e: PointerEvent) => {
      fx.pointer.x = (e.clientX / innerWidth) * 2 - 1;
      fx.pointer.y = -(e.clientY / innerHeight) * 2 + 1;

    };
    const onBlur = () => cancelCharge();

    // When every layer is on, BEE-9 notices.
    const unsub = useStore.subscribe((s, prev) => {
      const all = LAYERS.every((l) => s.layers[l.id]);
      if (all && !LAYERS.every((l) => prev.layers[l.id])) heckle("allLayers");
      // BEE-9 reacts two bars after a drop lands, once the impact has hit
      if (s.drops > prev.drops) setTimeout(() => heckle(s.drops === 1 ? "firstDrop" : "drop"), (60 / s.bpm) * 8 * 1000);
      if (s.layers.greggs && !prev.layers.greggs) heckle("greggs");
      if (s.layers.madchester && !prev.layers.madchester) heckle("madchester");
      if (s.district !== prev.district && s.phase === "live") heckle("district");
    });

    addEventListener("keydown", onKeyDown);
    addEventListener("keyup", onKeyUp);
    addEventListener("pointermove", onMove);
    addEventListener("blur", onBlur);
    return () => {
      unsub();
      removeEventListener("keydown", onKeyDown);
      removeEventListener("keyup", onKeyUp);
      removeEventListener("pointermove", onMove);
      removeEventListener("blur", onBlur);
    };
  }, []);
}
