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

/** Laptop → phone */
export type RemoteState = {
  t: "state";
  phase: string;
  layers: Record<LayerId, boolean>;
  pending: Partial<Record<LayerId, boolean>>;
  bpm: number;
  chapter: number;
};

export const peerId = (code: string) => `nmcr-${code.toUpperCase()}`;

