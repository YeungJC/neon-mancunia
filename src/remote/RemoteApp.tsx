import { useEffect, useRef, useState } from "react";
import { RAIN_COLORS, RAIN_KEYS } from "../audio/rainPattern";
import { openBrokerLink, randomSecret, type BrokerLink } from "../lib/brokerLink";
import { roomId, type Presence, type RemoteMsg, type RemoteState } from "../lib/remoteProtocol";
import { LAYERS } from "../store";
import "./remote.css";

const VOCALS = ["MAKE IT DANCE", "MINT", "TURN IT UP"];
const SHAKE_THRESHOLD = 22; // m/s² change between readings
const SHAKE_COOLDOWN = 1500;

type Status = "connecting" | "connected" | "lost" | "error";

/** The phone controller (?remote=CODE): puddles, layers, vocals, hold-to-drop, tilt filter, shake to drop. */
export function RemoteApp({ code, secret }: { code: string; secret: string }) {
  const [status, setStatus] = useState<Status>("connecting");
  const [state, setState] = useState<RemoteState | null>(null);
  const [tilt, setTilt] = useState(false);
  const [filter, setFilter] = useState(1);
  const [shook, setShook] = useState(false);
  const [held, setHeld] = useState(false);

  /** Which transport this phone is using: the laptop's dev-server relay (local) or the MQTT broker (anywhere). */
  const link = useRef<{ send: (m: unknown) => void } | null>(null);
  const send = (msg: RemoteMsg) => link.current?.send(msg);
  const buzz = (ms = 12) => navigator.vibrate?.(ms);

  useEffect(() => {
    let alive = true;
    let stream: EventSource | null = null;
    let broker: BrokerLink | null = null;
    let beat = 0;
    const me = randomSecret(8);

    // Local/expo: the page came from the laptop's dev server, which relays (fastest)
    const tryRelay = async () => {
      // &via=broker forces the internet path (to test what the deployed site does)
      if (new URLSearchParams(location.search).get("via") === "broker") return false;
      try {
        if (!(await fetch("/api/lan", { signal: AbortSignal.timeout(1500) })).ok) return false;
      } catch {
        return false;
      }
      stream = new EventSource(`/api/remote/stream?code=${code}&role=phone`);
      stream.onopen = () => setStatus("connected");
      stream.onmessage = (e) => setState(JSON.parse(e.data) as RemoteState);
      stream.onerror = () => setStatus("lost"); // EventSource reconnects by itself
      link.current = {
        send: (m) => fetch(`/api/remote/send?code=${code}&to=laptop`, { method: "POST", body: JSON.stringify(m), keepalive: true }).catch(() => {}),
      };
      return true;
    };

    // Anywhere else (the deployed site): a public MQTT broker over secure WebSockets
    const useBroker = async () => {
      if (!secret) return setStatus("error");
      try {
        broker = await openBrokerLink(
          roomId(code, secret),
          "phone",
          (m) => m.t === "state" && setState(m as unknown as RemoteState),
          (s) => {
            if (!alive) return;
            if (s === "connected") {
              setStatus("connected");
              broker?.send({ t: "hello", from: me } satisfies Presence);
            } else setStatus(s === "lost" ? "lost" : "connecting");
          },
          { t: "bye", from: me } satisfies Presence,
        );
        if (!alive) return broker.close();
        link.current = broker;
        broker.send({ t: "hello", from: me } satisfies Presence);
        // heartbeat so the laptop knows this phone is still here
        beat = window.setInterval(() => broker?.send({ t: "beat", from: me } satisfies Presence), 8000);
      } catch {
        if (alive) setStatus("error");
      }
    };

    tryRelay().then((ok) => {
      if (!ok) useBroker();
    });
    const bye = () => broker?.send({ t: "bye", from: me } satisfies Presence);
    addEventListener("pagehide", bye);
    return () => {
      alive = false;
      removeEventListener("pagehide", bye);
      window.clearInterval(beat);
      bye();
      stream?.close();
      broker?.close();
      link.current = null;
    };
  }, [code, secret]);

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
              {l.short ?? l.label}
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
