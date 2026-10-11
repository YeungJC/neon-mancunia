import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { handleTTS } from "./server/tts";

export default defineConfig(({ mode }) => {
  // Load .env into process.env for the server-side /api/tts handler (no VITE_ prefix => never bundled)
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));
  return {
    plugins: [
      react(),
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
        },
      },
    ],
  };
});
