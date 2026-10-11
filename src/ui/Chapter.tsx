import { useEffect, useRef, useState } from "react";
import { goTo, next } from "../lib/chapters";
import { DISTRICTS, fx, useStore } from "../store";

/** Where each card sits so it never covers that chapter's clickable signs. */
const PLACEMENT = ["left", "top", "left"] as const;

/** Cyberfiction-style chapter card: huge editorial type that tells you what to do here. */
export function Chapter() {
  const chapter = useStore((s) => s.chapter);
  const travelling = useStore((s) => s.travelling);
  // BEE-9's subtitle sits at the top too; step the card back while she talks
  const speaking = useStore((s) => s.djSpeaking);
  const [rest, setRest] = useState(false);
  const d = DISTRICTS[chapter];

  useEffect(() => {
    setRest(false);
    if (travelling) return;
    const id = setTimeout(() => setRest(true), 6500);
    return () => clearTimeout(id);
  }, [chapter, travelling]);

  return (
    <>
      {!travelling && (
        <section className={`chapter chapter--${PLACEMENT[chapter]} ${rest || speaking ? "chapter--rest" : ""}`} key={chapter}>
          <p className="chapter__kicker">
            CHAPTER {String(chapter + 1).padStart(2, "0")} / {d.name}
          </p>
          <h1 className="chapter__big">
            {d.big.map((line, i) => (
              <span key={i} className={`chapter__line ${i === 1 ? "chapter__line--outline" : ""}`} style={{ animationDelay: `${0.15 + i * 0.12}s` }}>
                {line}
              </span>
            ))}
          </h1>
          <p className="chapter__small">{d.small}</p>
        </section>
      )}
      {!travelling && d.next && (
        <button className="next" onClick={next} key={`n${chapter}`}>
          <span className="next__arrow">▾</span>
          {d.next}
        </button>
      )}
    </>
  );
}

/** Right-edge chapter index with a progress rail that tracks the camera. */
export function ChapterNav() {
  const chapter = useStore((s) => s.chapter);
  const rail = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let id = 0;
    const tick = () => {
      rail.current!.style.transform = `scaleY(${fx.rigT / (DISTRICTS.length - 1)})`;
      id = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <nav className="cnav" aria-label="Chapters">
      <div className="cnav__track">
        <div className="cnav__rail" ref={rail} />
      </div>
      {DISTRICTS.map((d, i) => (
        <button key={d.name} className={`cnav__item ${i === chapter ? "cnav__item--on" : ""}`} onClick={() => goTo(i)}>
          <span className="cnav__num">{String(i + 1).padStart(2, "0")}</span>
          <span className="cnav__name">{d.name}</span>
        </button>
      ))}
    </nav>
  );
}
