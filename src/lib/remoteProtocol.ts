import type { LayerId } from "../store";

/** Shared by the laptop host (lib/remote.ts) and the phone page (remote/RemoteApp.tsx). Keep it dependency-free. */

/** Phone → laptop */
export type RemoteMsg =
  | { t: "rain"; lane: number }
  | { t: "layer"; id: LayerId }
  | { t: "vocal"; i: number }
  | { t: "drop"; down: boolean }
  | { t: "shake" }
  | { t: "filter"; v: number };

/** Phone → laptop over the broker: who's here (phones heartbeat so the laptop can count them). */
export type Presence = { t: "hello" | "beat" | "bye"; from: string };

/** Laptop → phone */
export type RemoteState = {
  t: "state";
  phase: string;
  layers: Record<LayerId, boolean>;
  pending: Partial<Record<LayerId, boolean>>;
  bpm: number;
  chapter: number;
};

/** Broker topic room: the visible code plus the QR-only secret, so rooms can't be guessed. */
export const roomId = (code: string, secret: string) => `${code.toUpperCase()}-${secret}`;
