/**
 * Phone ⇄ laptop link through a public MQTT broker over secure WebSockets.
 * Unlike peer-to-peer WebRTC, this works on any network with internet (venue wifi, mobile data).
 * Rooms are private by obscurity: the topic includes a random secret that only the QR code carries.
 * Shared by the laptop (lib/remote.ts) and the phone page; mqtt is loaded only when used.
 */
const BROKERS = ["wss://broker.emqx.io:8084/mqtt", "wss://test.mosquitto.org:8081/mqtt", "wss://broker.hivemq.com:8884/mqtt"];

export type Role = "laptop" | "phone";
export type BrokerLink = { send: (msg: unknown) => void; close: () => void };

const topic = (room: string, to: Role) => `neonmcr/v1/${room}/to-${to}`;

export async function openBrokerLink(
  room: string,
  role: Role,
  onMessage: (msg: Record<string, unknown>) => void,
  onStatus: (s: "connecting" | "connected" | "lost") => void,
  lastWill?: unknown,
): Promise<BrokerLink> {
  const { default: mqtt } = await import("mqtt");
  const other: Role = role === "laptop" ? "phone" : "laptop";
  onStatus("connecting");

  for (const url of BROKERS) {
    const client = mqtt.connect(url, {
      connectTimeout: 5000,
      reconnectPeriod: 2000,
      clean: true,
      will: lastWill ? { topic: topic(room, other), payload: JSON.stringify(lastWill), qos: 0, retain: false } : undefined,
    });
    const ok = await new Promise<boolean>((resolve) => {
      const t = setTimeout(() => resolve(false), 6000);
      client.once("connect", () => (clearTimeout(t), resolve(true)));
    });
    if (!ok) {
      client.end(true);
      continue; // try the next broker
    }
    client.subscribe(topic(room, role), { qos: 0 });
    client.on("message", (_t, payload) => {
      try {
        onMessage(JSON.parse(payload.toString()));
      } catch {
        /* not ours */
      }
    });
    client.on("connect", () => onStatus("connected"));
    client.on("offline", () => onStatus("lost"));
    client.on("reconnect", () => onStatus("connecting"));
    onStatus("connected");
    return {
      send: (msg) => client.connected && client.publish(topic(room, other), JSON.stringify(msg), { qos: 0 }),
      close: () => client.end(true),
    };
  }
  onStatus("lost");
  throw new Error("No MQTT broker reachable");
}

const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
export const randomSecret = (n = 12) =>
  Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => ALPHABET[b % ALPHABET.length]).join("");
