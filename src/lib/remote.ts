import { beginCharge, releaseCharge, setFilterOpen, toggleLayer } from "../audio/engine";
import { playRain, triggerVocal } from "../audio/rainInstrument";
import { LAYERS, useStore } from "../store";
import { noteInput } from "./attract";
import { openBrokerLink, randomSecret, type BrokerLink } from "./brokerLink";
import { heckle, poke } from "./dj";
import { roomId, type Presence, type RemoteMsg, type RemoteState } from "./remoteProtocol";

/**
 * Phone-as-controller. The laptop opens a room; phones join via the QR code (?remote=CODE&k=SECRET).
 * Two transports, both listened to at once:
 *  - local relay through the laptop's dev server (npm run dev:phone; fastest, for the expo table)
 *  - a public MQTT broker over secure WebSockets (works anywhere with internet, e.g. the deployed site)
 * Neither needs peer-to-peer, which venue wifi and some home routers block.
 */

const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L
const newCode = () => [...Array(4)].map(() => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");

let code = "";
let secret = "";
let broker: BrokerLink | null = null;
let relay: EventSource | null = null;
let relayPhones = 0;
/** Phones on the broker, by id → last heard (they heartbeat; silent ones age out). */
const brokerPhones = new Map<string, number>();
const PHONE_TIMEOUT = 25_000;

const phoneCount = () => relayPhones + brokerPhones.size;

function setStatus(status: "starting" | "waiting" | "error") {
  useStore.getState().set({ remote: { code, status: phoneCount() ? "connected" : status, phones: phoneCount() } });
}

function snapshot(): RemoteState {
  const s = useStore.getState();
  return { t: "state", phase: s.phase, layers: s.layers, pending: s.pending, bpm: s.bpm, chapter: s.chapter };
}

function broadcast() {
  const msg = snapshot();
  broker?.send(msg);
  if (relay && relayPhones) fetch(`/api/remote/send?code=${code}&to=phone`, { method: "POST", body: JSON.stringify(msg), keepalive: true }).catch(() => {});
}

function handle(msg: RemoteMsg) {
  if (useStore.getState().phase !== "live") return;
  noteInput();
  poke();
  switch (msg.t) {
    case "rain":
      playRain(msg.lane, 0.85);
      break;
    case "layer":
      if (LAYERS.some((l) => l.id === msg.id)) toggleLayer(msg.id);
      break;
    case "vocal":
      triggerVocal(msg.i);
      break;
    case "drop":
      if (msg.down) beginCharge();
      else if (releaseCharge() === "bottled") heckle("bottled");
      break;
    case "shake":
      // a shake starts a full build; it drops by itself when charged
      beginCharge();
      break;
    case "filter":
      setFilterOpen(Math.max(0.08, Math.min(1, msg.v)));
      break;
  }
}

function phoneJoined(before: number) {
  setStatus("waiting");
  broadcast();
  if (phoneCount() > before) heckle("phone");
}

function phoneLeft() {
  setStatus("waiting");
  if (!phoneCount()) setFilterOpen(1); // never leave the mix muffled by a phone that walked away
}

/** The relay only exists on the laptop's dev server (not on the deployed site). */
async function relayAvailable() {
  try {
    return (await fetch("/api/lan", { signal: AbortSignal.timeout(1500) })).ok;
  } catch {
    return false;
  }
}

function startRelay() {
  relay = new EventSource(`/api/remote/stream?code=${code}&role=laptop`);
  relay.onmessage = (e) => {
    const msg = JSON.parse(e.data) as RemoteMsg | { t: "hello" | "bye"; phones: number };
    if (msg.t === "hello" || msg.t === "bye") {
      const before = phoneCount();
      relayPhones = msg.phones;
      if (msg.t === "hello") phoneJoined(before);
      else phoneLeft();
      return;
    }
    handle(msg as RemoteMsg);
  };
}

async function startBroker() {
  try {
    broker = await openBrokerLink(
      roomId(code, secret),
      "laptop",
      (raw) => {
        const msg = raw as RemoteMsg | Presence;
        if (msg.t === "hello" || msg.t === "beat") {
          const before = phoneCount();
          const isNew = !brokerPhones.has(msg.from);
          brokerPhones.set(msg.from, Date.now());
          if (isNew) phoneJoined(before);
          return;
        }
        if (msg.t === "bye") {
          if (brokerPhones.delete(msg.from)) phoneLeft();
          return;
        }
        handle(msg as RemoteMsg);
      },
      (s) => s === "lost" && !relay && setStatus("error"),
    );
    setStatus("waiting");
  } catch {
    if (!relay) setStatus("error");
  }
}

// silent phones (closed tab, dead battery) age out
setInterval(() => {
  const now = Date.now();
  let changed = false;
  for (const [id, seen] of brokerPhones) if (now - seen > PHONE_TIMEOUT) changed = brokerPhones.delete(id) || changed;
  if (changed) phoneLeft();
}, 5000);

/** Start hosting (idempotent). Resolves with the room code and secret once a transport is up. */
export async function hostRemote(): Promise<{ code: string; secret: string }> {
  if (code) return { code, secret };
  code = newCode();
  secret = randomSecret();
  setStatus("starting");
  if (await relayAvailable()) {
    startRelay();
    setStatus("waiting");
    startBroker(); // in the background: phones that load the deployed site use this
  } else {
    await startBroker();
  }
  return { code, secret };
}

/** The URL the QR code points at: this origin when deployed, the laptop's LAN address in local dev. */
export async function remoteUrl(c: string, k: string): Promise<{ url: string; warning?: string }> {
  const query = `/?remote=${c}&k=${k}`;
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  if (!local) return { url: `${location.origin}${query}` };
  try {
    const lan = (await (await fetch("/api/lan")).json()) as { exposed: boolean; origin: string | null };
    if (lan.origin)
      return {
        url: `${lan.origin}${query}`,
        warning: lan.exposed ? undefined : "Your phone can't reach this laptop yet. Restart with: npm run dev:phone",
      };
  } catch {
    /* fall through */
  }
  return { url: `${location.origin}${query}` };
}

// keep connected phones in sync with the set
useStore.subscribe((s, prev) => {
  if (!phoneCount()) return;
  if (s.layers !== prev.layers || s.pending !== prev.pending || s.bpm !== prev.bpm || s.chapter !== prev.chapter || s.phase !== prev.phase)
    broadcast();
});
