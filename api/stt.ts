// Vercel serverless function: same handler the Vite dev server mounts at /api/stt.
import { allow, clientKey } from "../server/limit.js";
import { handleSTT } from "../server/stt.js";

export default async function handler(
  req: AsyncIterable<Buffer> & { method?: string; headers: Record<string, string | undefined>; body?: unknown },
  res: { status(code: number): { json(body: unknown): void; end(): void } },
) {
  if (req.method !== "POST") return res.status(405).end();
  if (!allow(`stt:${clientKey(req.headers)}`, 6)) return res.status(200).json({ text: null, error: "slow-down" });
  let audio: Buffer;
  if (Buffer.isBuffer(req.body)) audio = req.body;
  else {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(Buffer.from(c));
    audio = Buffer.concat(chunks);
  }
  res.status(200).json(await handleSTT(audio, req.headers["content-type"] ?? "audio/webm"));
}
