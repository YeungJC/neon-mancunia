/** ElevenLabs speech-to-text (Scribe) for talking back to BEE-9. Server-side so the key stays secret. */

const MAX_BYTES = 2_000_000; // ~1 minute of opus; a talk-back clip is a few seconds

export async function handleSTT(audio: Buffer, mime = "audio/webm"): Promise<{ text: string | null; error?: string }> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return { text: null, error: "no-key" };
  if (!audio.length || audio.length > MAX_BYTES) return { text: null, error: "bad-size" };
  for (const model of ["scribe_v2", "scribe_v1"]) {
    const form = new FormData();
    form.append("model_id", model);
    form.append("language_code", "en");
    form.append("tag_audio_events", "false");
    form.append("file", new Blob([new Uint8Array(audio)], { type: mime }), "talk.webm");
    const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": key },
      body: form,
      signal: AbortSignal.timeout(12000),
    });
    if (res.ok) {
      const { text } = (await res.json()) as { text?: string };
      return { text: text?.trim() || null };
    }
    const detail = await res.text();
    console.warn(`[bee9] STT ${model} ${res.status}: ${detail.slice(0, 200)}`);
    // an unknown model falls through to the older one; anything else is final
    if (res.status !== 400 && res.status !== 422) return { text: null, error: res.status === 401 ? "permission" : `http-${res.status}` };
  }
  return { text: null, error: "model" };
}
