/**
 * Design BEE-9's voice with ElevenLabs Voice Design.
 *   npm run design-voice              → generates previews into voice-previews/ (listen to them)
 *   npm run design-voice -- --save 2  → saves preview #2 as a voice and writes its id to .env
 */
import "dotenv/config";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) {
  console.error("Set ELEVENLABS_API_KEY in .env first.");
  process.exit(1);
}

const DESCRIPTION =
  "A young woman with an ethereal, angelic, breathy voice that is also dark and gothic: cool, hypnotic and a little eerie, " +
  "with a faint synthetic, digital shimmer like a cyberpunk AI choir angel. Low-to-mid pitch, slow, deliberate, intimate delivery, " +
  "Northern English accent.";

const SAMPLE =
  "Eh up, our kid. It's twenty eighty seven and it's still raining over Manchester. " +
  "Every drop is a note, every neon sign a layer. Hold space, let go, and give the Haçienda something to remember.";

const DIR = "voice-previews";
const save = process.argv.indexOf("--save");

if (save === -1) {
  mkdirSync(DIR, { recursive: true });
  const res = await fetch("https://api.elevenlabs.io/v1/text-to-voice/design?output_format=mp3_44100_128", {
    method: "POST",
    headers: { "xi-api-key": KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ voice_description: DESCRIPTION, text: SAMPLE, model_id: "eleven_multilingual_ttv_v2" }),
  });
  if (!res.ok) {
    console.error(`Voice Design failed ${res.status}: ${await res.text()}`);
    process.exit(1);
  }
  const { previews } = (await res.json()) as { previews: { generated_voice_id: string; audio_base_64: string }[] };
  previews.forEach((p, i) => writeFileSync(`${DIR}/preview-${i + 1}.mp3`, Buffer.from(p.audio_base_64, "base64")));
  writeFileSync(`${DIR}/previews.json`, JSON.stringify(previews.map((p) => p.generated_voice_id), null, 2));
  console.log(`Saved ${previews.length} previews to ${DIR}/. Listen, then: npm run design-voice -- --save <number>`);
} else {
  const n = Number(process.argv[save + 1]);
  const ids = JSON.parse(readFileSync(`${DIR}/previews.json`, "utf8")) as string[];
  const generated = ids[n - 1];
  if (!generated) {
    console.error(`No preview #${n}. There are ${ids.length}.`);
    process.exit(1);
  }
  const res = await fetch("https://api.elevenlabs.io/v1/text-to-voice", {
    method: "POST",
    headers: { "xi-api-key": KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ voice_name: "BEE-9 Cyber Angel", voice_description: DESCRIPTION, generated_voice_id: generated }),
  });
  if (!res.ok) {
    console.error(`Saving voice failed ${res.status}: ${await res.text()}`);
    process.exit(1);
  }
  const { voice_id } = (await res.json()) as { voice_id: string };
  const env = existsSync(".env") ? readFileSync(".env", "utf8") : "";
  const next = /^ELEVENLABS_VOICE_ID=.*$/m.test(env)
    ? env.replace(/^ELEVENLABS_VOICE_ID=.*$/m, `ELEVENLABS_VOICE_ID=${voice_id}`)
    : `${env.trimEnd()}\nELEVENLABS_VOICE_ID=${voice_id}\n`;
  writeFileSync(".env", next);
  console.log(`Saved as "BEE-9 Cyber Angel" and set ELEVENLABS_VOICE_ID in .env.`);
  console.log("Now re-voice the fixed lines: npm run gen-sfx -- --force");
}
