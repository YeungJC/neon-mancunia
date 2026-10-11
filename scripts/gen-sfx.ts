/**
 * One-off: generate NEON MANCUNIA's sound design + BEE-9's fixed voice lines with ElevenLabs.
 * Uses roughly 2,000 characters of TTS quota plus 4 sound effects.
 *   npm run gen-sfx            (skips files that already exist)
 *   npm run gen-sfx -- --force (regenerate everything)
 */
import "dotenv/config";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { STATIC_LINES, staticFile } from "../src/lib/lines";
import { tts } from "../server/tts";

const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) {
  console.error("Set ELEVENLABS_API_KEY in .env first.");
  process.exit(1);
}
const force = process.argv.includes("--force");

const SFX: Record<string, { text: string; duration: number }> = {
  rain: { text: "steady heavy rain on metal rooftops and puddles in a city street at night, constant, seamless loop", duration: 12 },
  crt: { text: "old CRT television powering on: static thump, rising high-pitched whine", duration: 2 },
  impact: { text: "huge cinematic sub bass drop impact with shattering glass and a reverse cymbal tail", duration: 3 },
  greggs: { text: "paper bakery bag rustling open followed by a triumphant heavenly choir stab", duration: 3 },
  whooshIn: { text: "short punchy sci-fi whoosh rising into a tight impact hit", duration: 1 },
  whooshOut: { text: "short sci-fi whoosh falling away with a tape-stop slowdown", duration: 1 },
  madCrowd: { text: "1990 Manchester rave crowd cheering with whistles blowing, short burst", duration: 3 },
  choir: { text: "single heavenly angelic choir chord stab singing aah, short, cathedral reverb", duration: 2 },
  crunch: { text: "one crisp bite of flaky pastry, close-up crunch", duration: 0.5 },
  steakbake: { text: "deep 808 sub bass drop boom with a short rumbling tail", duration: 2 },
};

async function soundEffect(text: string, duration: number) {
  const res = await fetch("https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128", {
    method: "POST",
    headers: { "xi-api-key": KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({ text, duration_seconds: duration, prompt_influence: 0.5 }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

mkdirSync("public/sfx", { recursive: true });
mkdirSync("public/voice", { recursive: true });

for (const [name, { text, duration }] of Object.entries(SFX)) {
  const file = `public/sfx/${name}.mp3`;
  if (existsSync(file) && !force) continue;
  process.stdout.write(`sfx  ${name} … `);
  try {
    writeFileSync(file, await soundEffect(text, duration));
    console.log("ok");
  } catch (e) {
    console.log(`FAILED ${(e as Error).message}`);
  }
}

// Spoken one-shots in BEE-9's voice, used as sound effects
const SHOUTS: Record<string, string> = { madShout: "MADCHESTER!" };
for (const [name, text] of Object.entries(SHOUTS)) {
  const file = `public/sfx/${name}.mp3`;
  if (existsSync(file) && !force) continue;
  process.stdout.write(`shout ${name} … `);
  try {
    const mp3 = await tts(text);
    if (mp3) writeFileSync(file, mp3);
    console.log("ok");
  } catch (e) {
    console.log(`FAILED ${(e as Error).message}`);
  }
}

for (const [i, line] of STATIC_LINES.entries()) {
  const file = `public${staticFile(i)}`;
  if (existsSync(file) && !force) continue;
  process.stdout.write(`voice ${i} … `);
  try {
    const mp3 = await tts(line);
    if (mp3) writeFileSync(file, mp3);
    console.log("ok");
  } catch (e) {
    console.log(`FAILED ${(e as Error).message}`);
  }
}
