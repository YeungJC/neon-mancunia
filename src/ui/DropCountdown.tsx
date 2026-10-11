import { useEffect, useRef } from "react";
import { fx, useStore } from "../store";

/** The drop's count-in (3 · 2 · 1) and a "LET GO" cue once a build is charged enough to drop. */
export function DropCountdown() {
  const n = useStore((s) => s.dropCountdown);
  const cue = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let id = 0;
    const tick = () => {
      const el = cue.current;
      if (el) {
        el.classList.toggle("letgo--on", fx.charge >= 0.3 && useStore.getState().dropCountdown === null);
        el.style.setProperty("--charge", String(fx.charge));
      }
      id = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <>
      <div ref={cue} className="letgo" aria-hidden>
        LET GO TO DROP
      </div>
      {n !== null && (
        <div className="countdown" key={n} aria-live="assertive">
          {n}
        </div>
      )}
    </>
  );
}
