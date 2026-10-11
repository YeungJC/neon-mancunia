// Vercel serverless function: same handler the Vite dev server mounts at /api/intent.
import { handleIntent, type IntentRequest } from "../server/gemma.js";
import { allow, clientKey } from "../server/limit.js";

export default async function handler(
  req: { method?: string; body: IntentRequest; headers: Record<string, string | string[] | undefined> },
  res: { status(code: number): { json(body: unknown): void; end(): void } },
) {
  if (req.method !== "POST") return res.status(405).end();
  if (!allow(`intent:${clientKey(req.headers)}`, 12)) return res.status(200).json({ commands: [], reply: null, error: "slow-down" });
  res.status(200).json(await handleIntent(req.body));
}
