import { useEffect, useRef, useState } from "react";
import * as Tone from "tone";
import { beginCharge, cancelCharge, releaseCharge, setMuted, toggleLayer, nudgeBpm, tapTempo, BPM_MIN, BPM_MAX } from "../audio/engine";
import { poke } from "../lib/dj";
import { endSet as finishSet } from "../lib/session";
import { DISTRICTS, fx, LAYERS, useStore } from "../store";
import { ChapterNav } from "./Chapter";
import { PhoneButton } from "./PhonePanel";
import { MicButton } from "./Talk";

export function HUD() {
  const s = useStore();
  const district = DISTRICTS[s.district];
  const [ending, setEnding] = useState(false);

  const endSet = async () => {
    if (ending) return;
    setEnding(true);
    await finishSet();
    setEnding(false);
  };


  return (
    <div className={`hud ${s.phase === "outro" ? "hud--dim" : ""}`}>
      <header className="hud__top">
        <div className="hud__district">
          <span className="hud__brand">NEON/MANCUNIA</span>
          <span className="hud__sub" key={s.district}>
            {String(s.district + 1).padStart(2, "0")} / 03 — {district.name} · {district.sub}
          </span>
        </div>
        <div className="hud__readout">
          <div className="hud__row">
            <span className={`badge ${s.weather.live ? "badge--live" : ""}`}>{s.weather.live ? "LIVE" : "OFFLINE"}</span>
            MCR {s.weather.tempC}°C · RAIN {s.weather.rainMm.toFixed(1)}mm/h · WIND {s.weather.windKmh}km/h
          </div>
          <div className="hud__row hud__row--dim">
            {s.scaleName} · {s.bpm} BPM · <RecTimer since={s.startedAt} />
          </div>
          <Spectrum />
        </div>
      </header>

      <footer className="hud__bottom">
        <Pads />

        <div className="hud__right">
          <Tempo />
          <DropMeter />
          <SoundToggle muted={s.muted} onToggle={() => setMuted(!s.muted)} />
          <button className="btn btn--ghost" onClick={() => s.set({ highQuality: !s.highQuality })} title="Toggle quality (Q)">
            {s.highQuality ? "HQ" : "LQ"}
          </button>
          <MicButton />
          <PhoneButton />
          <button className="btn btn--primary" onClick={endSet} disabled={ending}>
            {ending ? "NAMING…" : "END SET"}
          </button>
        </div>
      </footer>

      <ChapterNav />
    </div>
  );
}

/** Drum-pad style layer controls: big targets, a live meter, and a clear ON / OFF / incoming state. */
function Pads() {
  const layers = useStore((st) => st.layers);
  const pending = useStore((st) => st.pending);
  const meters = useRef<(HTMLSpanElement | null)[]>([]);
  useEffect(() => {
    let id = 0;
    const tick = () => {
      LAYERS.forEach((l, i) => {
        const m = meters.current[i];
        if (m) m.style.transform = `scaleY(${fx.levels[l.id]})`;
      });
      id = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className="pads" role="group" aria-label="Track layers">
      <span className="pads__label">TRACK LAYERS — CLICK OR PRESS 1–5</span>
      {LAYERS.map((l, i) => {
        const on = layers[l.id];
        const incoming = pending[l.id];
        const state = incoming === undefined ? (on ? "ON" : "OFF") : incoming ? "IN…" : "OUT…";
        return (
          <button
            key={l.id}
            className={`pad ${on ? "pad--on" : ""} ${incoming !== undefined ? "pad--pending" : ""}`}
            style={{ "--c": l.color } as React.CSSProperties}
            onClick={() => {
              toggleLayer(l.id);
              poke();
            }}
            aria-pressed={on}
          >
            <span className="pad__meter" aria-hidden>
              <span ref={(el) => (meters.current[i] = el)} />
            </span>
            <kbd>{i + 1}</kbd>
            <span className="pad__name">{l.label}</span>
            <span className="pad__state">{state}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Tempo: −/+ (hold to repeat, shift for ±10), TAP tempo, and a light that blinks on the beat. */
function Tempo() {
  const bpm = useStore((st) => st.bpm);
  const [tapCount, setTapCount] = useState(0);
  const repeat = useRef(0);
  const tapReset = useRef(0);

  const hold = (delta: number) => (e: React.PointerEvent) => {
    const step = e.shiftKey ? delta * 5 : delta;
    nudgeBpm(step);
    window.clearTimeout(repeat.current);
    const again = () => {
      nudgeBpm(step);
      repeat.current = window.setTimeout(again, 90);
    };
    repeat.current = window.setTimeout(again, 380);
  };
  const stop = () => window.clearTimeout(repeat.current);
  useEffect(() => stop, []);

  // the light flashes on the beats you actually hear (transport position at the audible time)
  const beat = useRef<HTMLElement>(null);
  useEffect(() => {
    let id = 0;
    const tick = () => {
      const t = Tone.getTransport();
      const phase = (t.getTicksAtTime(Tone.immediate()) % t.PPQ) / t.PPQ;
      if (beat.current) beat.current.style.opacity = t.state === "started" && phase < 0.18 ? "1" : "0.15";
      id = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(id);
  }, []);

  const tap = () => {
    setTapCount(tapTempo());
    window.clearTimeout(tapReset.current);
    tapReset.current = window.setTimeout(() => setTapCount(0), 2000);
  };

  return (
    <div className="tempo" role="group" aria-label="Tempo">
      <button className="tempo__btn" onPointerDown={hold(-2)} onPointerUp={stop} onPointerLeave={stop} disabled={bpm <= BPM_MIN} aria-label="Slower (or [)" title="Slower  [   (shift: −10)">
        −
      </button>
      <output className="tempo__value" aria-live="polite">
        <i ref={beat} className="tempo__beat" aria-hidden />
        <b>{bpm}</b>
        <span>BPM</span>
      </output>
      <button className="tempo__btn" onPointerDown={hold(2)} onPointerUp={stop} onPointerLeave={stop} disabled={bpm >= BPM_MAX} aria-label="Faster (or ])" title="Faster  ]   (shift: +10)">
        +
      </button>
      <button className={`tempo__tap ${tapCount ? "tempo__tap--on" : ""}`} onClick={tap} title="Tap in time with any song (or press T)">
        {tapCount && tapCount < 3 ? `TAP ${tapCount}/3` : "TAP"}
      </button>
    </div>
  );
}

/** troisjs-style equaliser bars: dancing when the sound is on, flat when muted. */
function SoundToggle({ muted, onToggle }: { muted: boolean; onToggle: () => void }) {
  return (
    <button className={`btn btn--ghost sound ${muted ? "sound--off" : ""}`} onClick={onToggle} aria-label={muted ? "Unmute" : "Mute"} title="Sound">
      <i />
      <i />
      <i />
      <i />
    </button>
  );
}

function RecTimer({ since }: { since: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  const secs = Math.max(0, Math.floor((now - since) / 1000));
  return (
    <span className="rec">
      ● REC {String(Math.floor(secs / 60)).padStart(2, "0")}:{String(secs % 60).padStart(2, "0")}
    </span>
  );
}

function Spectrum() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const g = c.getContext("2d")!;
    let id = 0;
    const draw = () => {
      const w = c.width, h = c.height, n = 40, bw = w / n;
      g.clearRect(0, 0, w, h);
      for (let i = 0; i < n; i++) {
        const v = fx.fft[i];
        const grad = i / n;
        g.fillStyle = `hsl(${300 - grad * 130}, 100%, ${50 + v * 20}%)`;
        g.fillRect(i * bw + 1, h - v * h, bw - 2, v * h);
      }
      id = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(id);
  }, []);
  return <canvas ref={ref} className="spectrum" width={240} height={36} aria-hidden />;
}

function DropMeter() {
  const fill = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let id = 0;
    const tick = () => {
      fill.current!.style.transform = `scaleX(${fx.charge})`;
      wrap.current!.classList.toggle("meter--hot", fx.charge > 0.3);
      wrap.current!.classList.toggle("meter--flash", fx.flash > 0.5);
      id = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div className="meter" ref={wrap} aria-label="Drop charge">
      <button className="meter__touch" aria-label="Hold to build, release to drop"
        onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); beginCharge(); }}
        onPointerUp={() => releaseCharge()} onPointerCancel={cancelCharge}
        onKeyDown={e => { if ((e.key === "Enter" || e.key === " ") && !e.repeat) { e.preventDefault(); beginCharge(); } }}
        onKeyUp={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); releaseCharge(); } }} />
      <span className="meter__label">DROP</span>
      <div className="meter__track">
        <div className="meter__fill" ref={fill} />
      </div>
      <kbd>SPACE</kbd>
    </div>
  );
}
