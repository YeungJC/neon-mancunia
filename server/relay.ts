import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Phone ⇄ laptop relay for local/expo use: Server-Sent Events down, POST up, through the dev server.
 * No WebRTC, so it works on networks that block peer-to-peer (venue wifi). Rooms live in memory.
 */
type Role = "laptop" | "phone";
const rooms = new Map<string, Record<Role, Set<ServerResponse>>>();

const room = (code: string) => {
  let r = rooms.get(code);
  if (!r) rooms.set(code, (r = { laptop: new Set(), phone: new Set() }));
  return r;
};

function push(code: string, to: Role, data: string) {
  for (const res of room(code)[to]) res.write(`data: ${data}\n\n`);
}

/** GET /api/remote/stream?code=ABCD&role=laptop|phone */
export function relayStream(req: IncomingMessage, res: ServerResponse) {
  const q = new URL(req.url ?? "", "http://x").searchParams;
  const code = (q.get("code") ?? "").toUpperCase();
  const role = q.get("role") === "phone" ? "phone" : "laptop";
  if (!/^[A-Z0-9]{4}$/.test(code)) {
    res.statusCode = 400;
    return res.end();
  }
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.write(": hi\n\n");
  const r = room(code);
  r[role].add(res);
  // tell the laptop a phone arrived/left, so it can show the count and send the current state
  if (role === "phone") push(code, "laptop", JSON.stringify({ t: "hello", phones: r.phone.size }));
  const ping = setInterval(() => res.write(": ping\n\n"), 15000);
  req.on("close", () => {
    clearInterval(ping);
    r[role].delete(res);
    if (role === "phone") push(code, "laptop", JSON.stringify({ t: "bye", phones: r.phone.size }));
  });
}

/** POST /api/remote/send?code=ABCD&to=laptop|phone  (body: one JSON message) */
export async function relaySend(req: IncomingMessage, res: ServerResponse) {
  const q = new URL(req.url ?? "", "http://x").searchParams;
  const code = (q.get("code") ?? "").toUpperCase();
  const to = q.get("to") === "phone" ? "phone" : "laptop";
  let body = "";
  for await (const chunk of req) body += chunk;
  if (!/^[A-Z0-9]{4}$/.test(code) || body.length > 4000) {
    res.statusCode = 400;
    return res.end();
  }
  push(code, to, body);
  res.statusCode = 204;
  res.end();
}
