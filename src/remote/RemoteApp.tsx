import type { DataConnection } from "peerjs";
import { useEffect, useRef, useState } from "react";
import { RAIN_COLORS, RAIN_KEYS } from "../audio/rainPattern";
import { peerId, type RemoteMsg, type RemoteState } from "../lib/remoteProtocol";
import { LAYERS } from "../store";
import "./remote.css";

const VOCALS = ["MAKE IT DANCE", "MINT", "TURN IT UP"];
const SHAKE_THRESHOLD = 22; // m/s² change between readings
const SHAKE_COOLDOWN = 1500;

type Status = "connecting" | "connected" | "lost" | "error";

/** The phone controller (?remote=CODE): puddles, layers, vocals, hold-to-drop, tilt filter, shake to drop. */
export function RemoteApp({ code }: { code: string }) {
  const conn = useRef<DataConnection | null>(null);
  const [status, setStatus] = useState<Status>("connecting");
  const [state, setState] = useState<RemoteState | null>(null);
  const [tilt, setTilt] = useState(false);
  const [filter, setFilter] = useState(1);
  const [shook, setShook] = useState(false);
  const [held, setHeld] = useState(false);

  /** Set when the page came from the laptop's dev server: messages go through its relay instead of WebRTC. */
  const relay = useRef(false);
  const send = (msg: RemoteMsg) => {
    if (relay.current) fetch(`/api/remote/send?code=${code}&to=laptop`, { method: "POST", body: JSON.stringify(msg), keepalive: true }).catch(() => {});
    else if (conn.current?.open) conn.current.send(msg);
  };
  const buzz = (ms = 12) => navigator.vibrate?.(ms);

  // connect, and reconnect if the link drops
  useEffect(() => {
    let alive = true;
    let peer: import("peerjs").Peer | null = null;
    let watchdog = 0;
    let stream: EventSource | null = null;

    // Local/expo: the laptop's dev server relays (no WebRTC, works on venue wifi)
    const tryRelay = async () => {
      try {
        if (!(await fetch("/api/lan", { signal: AbortSignal.timeout(1500) })).ok) return false;
      } catch {
        return false;
      }
      relay.current = true;
      stream = new EventSource(`/api/remote/stream?code=${code}&role=phone`);
      stream.onopen = () => setStatus("connected");
      stream.onmessage = (e) => setState(JSON.parse(e.data) as RemoteState);
      stream.onerror = () => setStatus("lost"); // EventSource reconnects by itself
      return true;
    };

    const connect = async () => {
      if (!alive) return;
      const { default: Peer } = await import("peerjs");
      peer?.destroy();
      peer = new Peer();
      // a hung attempt (e.g. the phone backgrounded mid-handshake) fires no error, so retry on a timer
      window.clearTimeout(watchdog);
      watchdog = window.setTimeout(() => {
        if (alive && !conn.current?.open) connect();
      }, 8000);
      peer.on("open", () => {
        const c = peer!.connect(peerId(code), { reliable: true });
        c.on("open", () => {
          window.clearTimeout(watchdog);
          conn.current = c;
          setStatus("connected");
        });
        c.on("data", (d) => setState(d as RemoteState));
        c.on("close", () => {
          setStatus("lost");
          conn.current = null;
          if (alive) setTimeout(connect, 1500);
        });
      });
      peer.on("error", () => {
        setStatus("error");
        if (alive) setTimeout(connect, 2500);
      });
    };
    tryRelay().then((ok) => {
      if (!ok) connect();
    });
    return () => {
      alive = false;
      window.clearTimeout(watchdog);
      stream?.close();
      peer?.destroy();
    };
  }, [code]);

  // tilt → filter (phone upright = open, laid flat = muffled), shake → drop
  useEffect(() => {
    if (!tilt) return;
    let last = 0;
    let lastShake = 0;
    let prev: number | null = null;
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.beta == null) return;
      const v = Math.max(0.08, Math.min(1, Math.abs(e.beta) / 80));
      const now = performance.now();
      if (now - last > 50) {
        last = now;
        setFilter(v);
        send({ t: "filter", v });
      }
    };
    const onMotion = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (!a || a.x == null || a.y == null || a.z == null) return;
      const mag = Math.hypot(a.x, a.y, a.z);
      if (prev != null && Math.abs(mag - prev) > SHAKE_THRESHOLD && performance.now() - lastShake > SHAKE_COOLDOWN) {
        lastShake = performance.now();
        send({ t: "shake" });
        buzz(60);
        setShook(true);
        setTimeout(() => setShook(false), 900);
      }
      prev = mag;
    };
    addEventListener("deviceorientation", onOrient);
    addEventListener("devicemotion", onMotion);
    return () => {
      removeEventListener("deviceorientation", onOrient);
      removeEventListener("devicemotion", onMotion);
      send({ t: "filter", v: 1 });
    };
  }, [tilt]);

  const enableTilt = async () => {
    if (tilt) return setTilt(false);
    // iOS asks for permission, and only from a tap
    type Asker = { requestPermission?: () => Promise<string> };
    try {
      const o = (DeviceOrientationEvent as unknown as Asker).requestPermission;
      const m = (DeviceMotionEvent as unknown as Asker).requestPermission;
      if (o && (await o()) !== "granted") return;
      if (m && (await m()) !== "granted") return;
    } catch {
      return;
    }
    setTilt(true);
  };

  const live = state?.phase === "live";

  return (
    <main className="rm">
      <header className="rm__bar">
        <span className="rm__brand">NEON/MANCUNIA</span>
        <span className={`rm__status rm__status--${status}`}>
          <i />
          {status === "connected" ? `ROOM ${code}` : status === "connecting" ? "CONNECTING…" : "RECONNECTING…"}
        </span>
      </header>

      {status === "connected" && !live && <p className="rm__hint">Press PLUG IN on the big screen to start.</p>}

      <section className="rm__puddles" aria-label="Rain notes">
        {RAIN_COLORS.map((c, i) => (
          <button
            key={c}
            className="rm__puddle"
            style={{ "--c": c } as React.CSSProperties}
            onPointerDown={(e) => {
              e.preventDefault();
              send({ t: "rain", lane: i });
              buzz();
              e.currentTarget.classList.remove("rm__puddle--hit");
              void e.currentTarget.offsetWidth; // restart the ripple animation
              e.currentTarget.classList.add("rm__puddle--hit");
            }}
          >
            <span>{RAIN_KEYS[i].toUpperCase()}</span>
          </button>
        ))}
      </section>

      <section className="rm__layers" aria-label="Track layers">
        {LAYERS.map((l) => {
          const on = state?.layers[l.id];
          const pending = state?.pending[l.id] !== undefined;
          return (
            <button
              key={l.id}
              className={`rm__layer ${on ? "rm__layer--on" : ""} ${pending ? "rm__layer--pending" : ""}`}
              style={{ "--c": l.color } as React.CSSProperties}
              onClick={() => {
                send({ t: "layer", id: l.id });
                buzz();
              }}
              aria-pressed={!!on}
            >
              {l.label}
            </button>
          );
        })}
      </section>

      <section className="rm__vocals" aria-label="BEE-9 vocal hits">
        {VOCALS.map((v, i) => (
          <button key={v} className="rm__vocal" onClick={() => (send({ t: "vocal", i }), buzz())}>
            {v}
          </button>
        ))}
      </section>

      <section className="rm__bottom">
        <button className={`rm__tilt ${tilt ? "rm__tilt--on" : ""}`} onClick={enableTilt}>
          <span className="rm__tilt-meter" style={{ transform: `scaleX(${tilt ? filter : 0})` }} />
          {tilt ? "TILT FILTER ON · SHAKE TO DROP" : "ENABLE TILT + SHAKE"}
        </button>
        <button
          className={`rm__drop ${held ? "rm__drop--held" : ""} ${shook ? "rm__drop--shook" : ""}`}
          onPointerDown={(e) => {
            e.preventDefault();
            setHeld(true);
            send({ t: "drop", down: true });
            buzz(30);
          }}
          onPointerUp={() => {
            setHeld(false);
            send({ t: "drop", down: false });
            buzz(80);
          }}
          onPointerCancel={() => {
            setHeld(false);
            send({ t: "drop", down: false });
          }}
        >
          {shook ? "SHAKE!" : held ? "LET GO TO DROP" : "HOLD TO DROP"}
          {state && <small>{state.bpm} BPM</small>}
        </button>
      </section>
    </main>
  );
}
