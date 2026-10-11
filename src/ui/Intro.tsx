import { useProgress } from "@react-three/drei";
import { useEffect, useRef, useState } from "react";
import { preloadSfx, startEngine } from "../audio/engine";
import { startDJ } from "../lib/dj";
import { startHistory } from "../lib/setHistory";
import { fetchWeather } from "../lib/weather";
import { fx, useStore } from "../store";
import { Wordmark } from "./Wordmark";

/**
 * Landing hero (Lusion-style): the city is already alive behind this, the title is 3D neon in the scene,
 * the chrome on the right is shoveable. This overlay only carries copy and the magnetic PLUG IN button,
 * which doubles as the loading ring.
 */
export function Intro() {
  const phase = useStore((s) => s.phase);
  const weather = useStore((s) => s.weather);
  const [status, setStatus] = useState("CONNECTING TO MANCHESTER_2087");
  const [sfxProgress, setSfxProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);
  const { progress: assetProgress, active } = useProgress();

  useEffect(() => {
    let alive = true;
    (async () => {
      const w = await fetchWeather();
      if (!alive) return;
      useStore.getState().set({ weather: w });
      setStatus(w.live ? (w.rainMm === 0 ? "0.0MM OF RAIN? SUSPICIOUS. ADDING SOME." : "LIVE RAIN LOCKED IN") : "WEATHER SAT OFFLINE · ASSUMING DRIZZLE");
      await preloadSfx(setSfxProgress);
      if (!alive) return;
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const progress = Math.round(((sfxProgress + (active ? assetProgress / 100 : 1)) / 2) * 100);
  const canStart = ready && !active;

  const plugIn = async () => {
    if (!canStart || leaving) return;
    setLeaving(true);
    fx.flash = 0.7; // bloom + glitch punch on the way in
    await startEngine();
    startDJ();
    startHistory();
    useStore.getState().set({ phase: "live" });
    setTimeout(() => setGone(true), 1200);
  };

  if (gone || (phase !== "intro" && !leaving)) return null;

  return (
    <div className={`hero ${leaving ? "hero--off" : ""}`}>
      <header className="hero__bar">
        <Wordmark className="hero__brand" />
        <span className="hero__meta">MLH · MANCHESTER · 2087</span>
        <span className={`badge ${weather.live ? "badge--live" : ""}`}>
          {weather.live ? "LIVE" : "OFFLINE"} · MCR {weather.tempC}°C · {weather.rainMm.toFixed(1)}MM/H
        </span>
      </header>

      {/* the big title is 3D neon in the scene; this keeps it accessible */}
      <h1 className="sr-only">NEON MANCUNIA</h1>

      <div className="hero__copy">
        <p className="hero__tag">
          Manchester's rain finally does something useful. <em>The city is the instrument.</em>
        </p>
        <p className="hero__sub">Play the puddles. Drop in a vocal. Let the city follow. A rain instrument for Manchester, 2087. Sound on.</p>
        <MagneticButton progress={progress} ready={canStart} onClick={plugIn} />
      </div>

      <p className="hero__shove" aria-hidden>
        ↑ shove the chrome
      </p>

      <footer className="hero__foot">
        <div className="marquee" aria-hidden>
          <div className="marquee__track">
            {[0, 1].map((k) => (
              <span key={k}>IT'S ALWAYS RAINING ✦ MANCHESTER 2087 ✦ THE RAIN IS THE SYNTH ✦ FAC 51 ✦ BEE-9 ON THE DECKS ✦&nbsp;</span>
            ))}
          </div>
        </div>
        <div className="hero__status">
          <span>{ready ? "SOUND SYSTEM ONLINE" : status}</span>
          <span>{progress}%</span>
        </div>
        <div className="hero__line">
          <div style={{ transform: `scaleX(${progress / 100})` }} />
        </div>
      </footer>
    </div>
  );
}

const R = 62;
const CIRC = 2 * Math.PI * R;

/** Round CTA that leans toward the cursor; its ring is the loader. */
function MagneticButton({ progress, ready, onClick }: { progress: number; ready: boolean; onClick: () => void }) {
  const btn = useRef<HTMLButtonElement>(null);
  const label = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const el = btn.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const pull = Math.hypot(dx, dy) < 150 ? 1 : 0;
      el.style.transform = `translate(${dx * 0.28 * pull}px, ${dy * 0.28 * pull}px)`;
      label.current!.style.transform = `translate(${dx * 0.12 * pull}px, ${dy * 0.12 * pull}px)`;
    };
    addEventListener("pointermove", move);
    return () => removeEventListener("pointermove", move);
  }, []);

  return (
    <button ref={btn} className={`magnet ${ready ? "magnet--ready" : ""}`} onClick={onClick} disabled={!ready} aria-label={ready ? "Plug in" : `Loading ${progress}%`}>
      <svg viewBox="0 0 140 140" aria-hidden>
        <circle cx="70" cy="70" r={R} className="magnet__track" />
        <circle cx="70" cy="70" r={R} className="magnet__ring" strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - progress / 100)} />
      </svg>
      <span ref={label} className="magnet__label">
        {ready ? (
          <>
            PLUG
            <br />
            IN
          </>
        ) : (
          `${progress}%`
        )}
      </span>
    </button>
  );
}
