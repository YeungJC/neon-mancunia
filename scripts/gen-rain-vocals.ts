import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { tts } from '../server/tts';

const phrases = ['Make it dance.', 'Mint. Absolutely mint.', 'Turn it up.'];
await mkdir('public/voice', { recursive: true });
for (const [i, phrase] of phrases.entries()) {
  const audio = await tts(phrase);
  if (!audio) throw new Error('Set ELEVENLABS_API_KEY to generate the musical voice samples.');
  await writeFile(`public/voice/rain-${i}.mp3`, audio);
  console.log(`Generated rain-${i}.mp3: ${phrase}`);
}
