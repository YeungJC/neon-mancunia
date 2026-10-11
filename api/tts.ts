// Vercel serverless function: same handler the Vite dev server mounts at /api/tts.
import { handleTTS } from "../server/tts.js";

export default async function handler(
  req: { method?: string; body: { text?: unknown } },
  res: { status(code: number): { json(body: unknown): void; end(): void } },
) {
  if (req.method !== "POST") return res.status(405).end();
  res.status(200).json(await handleTTS(req.body));
}
