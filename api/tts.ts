// Vercel serverless function: same handler the Vite dev server mounts at /api/tts.
import { allow, clientKey } from "../server/limit.js";
import { handleTTS } from "../server/tts.js";

export default async function handler(
  req: { method?: string; body: { text?: unknown }; headers: Record<string, string | string[] | undefined> },
  res: { status(code: number): { json(body: unknown): void; end(): void } },
) {
  if (req.method !== "POST") return res.status(405).end();
  // BEE-9 speaks a line every ~18s; 20/min per visitor is plenty for real play
  if (!allow(`tts:${clientKey(req.headers)}`, 20)) return res.status(200).json({ audio: null });
  res.status(200).json(await handleTTS(req.body));
}
