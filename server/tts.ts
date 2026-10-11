/** ElevenLabs text-to-speech for BEE-9. Server-side so the key never reaches the browser. */

const MAX_CHARS = 200; // BEE-9 lines are short; this also stops a deployed endpoint being used as free TTS

export async function tts(text: string): Promise<Buffer | null> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return null;
  const voice = process.env.ELEVENLABS_VOICE_ID || "pFZP5JQG7iQjIQuC4Bku"; // Lily: velvety British
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      text,
      model_id: "eleven_flash_v2_5", // lowest latency, cheapest per character
      // calm, slow and breathy: the reverb/halo chain in src/audio/voice.ts does the angelic part
      voice_settings: { stability: 0.6, similarity_boost: 0.8, style: 0.15, speed: 0.88 },
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`ElevenLabs TTS ${res.status}: ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function handleTTS(body: { text?: unknown }): Promise<{ audio: string | null }> {
  const text = typeof body.text === "string" ? body.text.trim().slice(0, MAX_CHARS) : "";
  if (!text) return { audio: null };
  try {
    const mp3 = await tts(text);
    return { audio: mp3 ? mp3.toString("base64") : null };
  } catch (e) {
    console.warn("[bee9]", (e as Error).message);
    return { audio: null };
  }
}
