/**
 * Per-visitor rate limit for the public API routes, so a deployed URL can't be used to drain the
 * ElevenLabs quota. In-memory per server instance: not airtight, but it stops casual abuse.
 */
const hits = new Map<string, number[]>();

export function allow(key: string, max: number, windowMs = 60_000) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) hits.clear(); // never grow without bound
  return true;
}

/** Best-effort client address behind Vercel's proxy. */
export const clientKey = (headers: Record<string, string | string[] | undefined>, fallback = "anon") =>
  String(headers["x-forwarded-for"] ?? fallback).split(",")[0].trim();
