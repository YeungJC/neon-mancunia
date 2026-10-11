import { config as loadDotenv } from "dotenv";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { networkInterfaces } from "node:os";
import { relaySend, relayStream } from "./server/relay";
import { handleSTT } from "./server/stt";
import { handleTTS } from "./server/tts";

/** `npm run dev:phone` serves HTTPS on the LAN: phones only allow motion sensors on secure pages. */
const PHONE = process.env.PHONE === "1";

export default defineConfig(() => {
  // Load .env into process.env for the server-side /api/tts handler (no VITE_ prefix => never bundled).
  // override: Vite restarts on .env edits, and without it the first values loaded would stick forever.
  loadDotenv({ override: true });
  return {
    server: PHONE ? { host: true } : undefined,
    plugins: [
      react(),
      ...(PHONE ? [basicSsl()] : []),
      {
        name: "bee9-tts",
        configureServer(server) {
          server.middlewares.use("/api/tts", async (req, res) => {
            if (req.method !== "POST") {
              res.statusCode = 405;
              return res.end();
            }
            let body = "";
            for await (const chunk of req) body += chunk;
            const result = await handleTTS(JSON.parse(body || "{}"));
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(result));
          });
          server.middlewares.use("/api/stt", async (req, res) => {
            if (req.method !== "POST") {
              res.statusCode = 405;
              return res.end();
            }
            const chunks: Buffer[] = [];
            for await (const chunk of req) chunks.push(chunk as Buffer);
            const result = await handleSTT(Buffer.concat(chunks), req.headers["content-type"] ?? "audio/webm");
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(result));
          });
          // Phone ⇄ laptop relay (local/expo): works where peer-to-peer WebRTC is blocked
          server.middlewares.use("/api/remote/stream", relayStream);
          server.middlewares.use("/api/remote/send", (req, res) => {
            if (req.method !== "POST") {
              res.statusCode = 405;
              return res.end();
            }
            relaySend(req, res);
          });
          // Where a phone on the same wifi can reach this laptop (for the remote-control QR code)
          server.middlewares.use("/api/lan", (_req, res) => {
            const ips = Object.values(networkInterfaces())
              .flat()
              .filter((n) => n && n.family === "IPv4" && !n.internal)
              .map((n) => n!.address);
            const port = server.config.server.port ?? 5173;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ exposed: PHONE, origin: ips[0] ? `${PHONE ? "https" : "http"}://${ips[0]}:${port}` : null }));
          });
        },
      },
    ],
  };
});
