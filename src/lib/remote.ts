import type { DataConnection, Peer as PeerType } from "peerjs";
import { beginCharge, releaseCharge, setFilterOpen, toggleLayer } from "../audio/engine";
import { playRain, triggerVocal } from "../audio/rainInstrument";
import { LAYERS, useStore } from "../store";
import { noteInput } from "./attract";
import { heckle, poke } from "./dj";
import { peerId, type RemoteMsg, type RemoteState } from "./remoteProtocol";

export { peerId };

/**
 * Phone-as-controller over WebRTC (PeerJS). The laptop hosts room "nmcr-CODE"; the phone page
 * (?remote=CODE) connects straight to it. Works locally and when deployed (no websocket server).
 */

const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L
const newCode = () => [...Array(4)].map(() => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");

let peer: PeerType | null = null;
const conns = new Set<DataConnection>();
/** Phones on the dev-server relay (local/expo), and the relay stream itself. */
let relayPhones = 0;
let relay: EventSource | null = null;
let relayCode = "";

const phoneCount = () => conns.size + relayPhones;
const setStatus = (code: string, status: "starting" | "waiting" | "connected" | "error") =>
  useStore.getState().set({ remote: { code, status: phoneCount() ? "connected" : status, phones: phoneCount() } });

/** The relay only exists on the laptop's dev server (not on the deployed site). */
async function relayAvailable() {
  try {
    return (await fetch("/api/lan", { signal: AbortSignal.timeout(1500) })).ok;
  } catch {
    return false;
  }
}

function startRelay(code: string) {
  relayCode = code;
  relay = new EventSource(`/api/remote/stream?code=${code}&role=laptop`);
  relay.onmessage = (e) => {
    const msg = JSON.parse(e.data) as RemoteMsg | RelayPresence;
    if (msg.t === "hello" || msg.t === "bye") {
      const before = phoneCount();
      relayPhones = msg.phones;
      setStatus(code, "waiting");
      if (msg.t === "hello") {
        sendRelay(snapshot());
        if (phoneCount() > before) heckle("phone");
      } else if (!phoneCount()) setFilterOpen(1);
      return;
    }
    handle(msg as RemoteMsg);
  };
}

/** The relay's own presence messages (a phone joined / left). */
type RelayPresence = { t: "hello" | "bye"; phones: number };

function sendRelay(msg: RemoteState) {
  if (!relay || !relayPhones) return;
  fetch(`/api/remote/send?code=${relayCode}&to=phone`, { method: "POST", body: JSON.stringify(msg), keepalive: true }).catch(() => {});
}

function snapshot(): RemoteState {
  const s = useStore.getState();
  return { t: "state", phase: s.phase, layers: s.layers, pending: s.pending, bpm: s.bpm, chapter: s.chapter };
}

function broadcast() {
  const msg = snapshot();
  conns.forEach((c) => c.open && c.send(msg));
  sendRelay(msg);
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

/** Start hosting (idempotent). Resolves with the room code once the signalling server has us. */
export async function hostRemote(): Promise<string> {
  const existing = useStore.getState().remote;
  if (peer && existing.code) return existing.code;
  const code = newCode();
  useStore.getState().set({ remote: { code, status: "starting", phones: 0 } });
  const local = await relayAvailable();
  if (local) {
    startRelay(code);
    setStatus(code, "waiting");
  }
  const { default: Peer } = await import("peerjs");
  return new Promise((resolve, reject) => {
    if (local) resolve(code); // the relay is enough; PeerJS still comes up for phones that use it
    peer = new Peer(peerId(code));
    peer.on("open", () => {
      setStatus(code, "waiting");
      resolve(code);
    });
    // the signalling server drops peers whose heartbeat stalls (background tab, sleep); re-register so
    // phones can still find the room. Existing phone links are direct and survive this.
    peer.on("disconnected", () => {
      setTimeout(() => peer && !peer.destroyed && peer.disconnected && peer.reconnect(), 1000);
    });
    peer.on("error", (err) => {
      console.warn("[remote]", err.type, err.message);
      if (err.type === "network" || err.type === "server-error" || err.type === "socket-error") {
        setTimeout(() => peer && !peer.destroyed && peer.disconnected && peer.reconnect(), 2000);
      }
      if (!local) setStatus(code, "error");
      if (!local && !conns.size) reject(err);
    });
    peer.on("connection", (conn) => {
      conn.on("open", () => {
        conns.add(conn);
        setStatus(code, "connected");
        conn.send(snapshot());
        heckle("phone");
      });
      conn.on("data", (d) => handle(d as RemoteMsg));
      conn.on("close", () => {
        conns.delete(conn);
        if (!phoneCount()) setFilterOpen(1); // never leave the mix muffled by a phone that walked away
        setStatus(code, "waiting");
      });
    });
  });
}

/** The URL the QR code points at: this origin when deployed, the laptop's LAN address in local dev. */
export async function remoteUrl(code: string): Promise<{ url: string; warning?: string }> {
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  if (!local) return { url: `${location.origin}/?remote=${code}` };
  try {
    const lan = (await (await fetch("/api/lan")).json()) as { exposed: boolean; origin: string | null };
    if (lan.origin)
      return {
        url: `${lan.origin}/?remote=${code}`,
        warning: lan.exposed ? undefined : "Your phone can't reach this laptop yet. Restart with: npm run dev:phone",
      };
  } catch {
    /* fall through */
  }
  return { url: `${location.origin}/?remote=${code}`, warning: "Open this on the deployed site so your phone can reach it." };
}

// keep connected phones in sync with the set
useStore.subscribe((s, prev) => {
  if (!phoneCount()) return;
  if (s.layers !== prev.layers || s.pending !== prev.pending || s.bpm !== prev.bpm || s.chapter !== prev.chapter || s.phase !== prev.phase)
    broadcast();
});
