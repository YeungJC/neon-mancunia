# NEON MANCUNIA

> Manchester's rain finally does something useful.

Fly through a rain-soaked, neon Manchester in 2087 where **the city is the instrument**. Play five glowing puddles and add ElevenLabs vocal hits over the city’s groove. Every tower is an equaliser and every neon sign is a layer of the track. **BEE-9**, a cyber worker-bee drone DJ voiced by ElevenLabs, heckles your set in broad Manc.

## Run it

```bash
npm install
cp .env.example .env   # add ELEVENLABS_API_KEY (https://elevenlabs.io/app/settings/api-keys)
npm run gen-sfx        # one-off: ElevenLabs sound design + offline voice lines → public/
npm run gen-rain-vocals # three playable ElevenLabs phrases → public/voice/
npm run dev            # http://localhost:5173
```

Everything degrades gracefully. With no key, no wifi or no generated SFX, it still plays: BEE-9 uses its pre-rendered lines (or the browser's voice if `gen-sfx` hasn't run), and the weather falls back to "drizzle".

## Phone controller

Your phone becomes a controller: tap the puddles, toggle layers, fire BEE-9's vocals, **tilt to filter**, **shake or hold to drop**.

**Locally (expo / demo laptop):**
1. Run `npm run dev:phone` instead of `npm run dev`. This serves HTTPS on your wifi, because phones only allow tilt and shake on secure pages.
2. Open `https://localhost:5173` on the laptop and accept the certificate warning once.
3. Click **PHONE** in the HUD and scan the QR code. Your phone must be on the same wifi. Accept the warning on the phone too.

Messages go through the laptop's dev server, so this works even on wifi that blocks peer-to-peer.
If the venue wifi isolates devices from each other, connect the phone to the laptop's hotspot.

**Deployed (Vercel):** the QR points at the live site, and phone ⇄ laptop messages go through a public MQTT broker over secure WebSockets (EMQX, with Mosquitto and HiveMQ as fallbacks). This works on any network with internet, including mobile data. No peer-to-peer is involved, and each pairing gets a random secret carried only in the QR code.

## Talk to BEE-9

Hold **V** (or the mic button) and speak, then let go. ElevenLabs Scribe transcribes it, and BEE-9 does what you say and answers in her own voice. Examples:
- "turn on the drums and bass", "kill the lead", "give me Greggs", "everything"
- "faster", "slow it down", "120 bpm"
- "take me to the Haçienda", "drop it"
- …or just chat: "is it raining?", "who are you?", "play Wonderwall"

The ElevenLabs key needs the **Speech to Text** permission.

## Expo kiosk mode

Open **`http://localhost:5173/?expo`** and click PLUG IN once at the start of the day. Browsers need one click before they allow sound.
- After **15 s** with nobody touching it, the city performs a full set by itself: build-up, Madchester and Greggs takeovers, a Haçienda drop.
  - BEE-9 calls people over and "TOUCH ANYTHING TO PLAY" pulses.
- Any click, key, scroll or touch hands control to the visitor from a clean start. Mouse movement alone doesn't count.
- After END SET, the poster stays up for 45 s and then a fresh set begins.

## Controls

| Input | Does |
|---|---|
| Scroll (wheel, trackpad, swipe) / ↓ ↑ / chapter nav | Glide along the street; let go and it eases into the nearest district: Piccadilly → Northern Quarter → The Haçienda |
| Click a neon sign, a pad, or `1`–`5` | Toggle DRUMS · BASS · LEAD · MADCHESTER · GREGGS (lands on the next beat; pads show a live level meter) |
| Click/drag the glowing puddles / `A S D F G` | Play five notes in the weather-selected scale |
| `Z X C` or the small vocal hints | Play ElevenLabs voice samples over your notes and backing layers |
| Move the pointer | Rain parts around it like an umbrella |
| Hold `Space` or HOLD TO DROP | Build the riser, release for the drop (let go too early and BEE-9 calls you out for bottling it) |
| Cursor on the chrome at the Haçienda | Shove it around; click it to change its colour |
| `[` `]` / `T` | Tempo down / up (Shift ±10) / tap tempo |
| Hold `V` | Talk to BEE-9 (voice commands) |
| `Q` | Toggle high/low quality |
| END SET | BEE-9 names your track. A Factory Records poster (Joy Division's *Unknown Pleasures*, drawn from your set's own spectrum) draws itself, and you can download the poster (PNG) and the recording (`.webm`) |

## How it works

- **Audio:** Tone.js. Backing layers run continuously and are toggled by their gain on the next beat. The user plays rain notes immediately; recorded notes quantize to sixteenth notes in a two-bar loop. Live Manchester weather (Open-Meteo) sets the mode (dry → Mixolydian, drizzle → Dorian, downpour → Aeolian), the tempo, and the rain density.
- **Audio drives visuals:** an FFT analyser writes into a shared `fx` object every frame. The towers' shader reads 64 FFT bins (the front row is a spectrum analyser along the street), and the rain instrument shares pitch, audio time, lane, and velocity events with the 3D puddles. Looped droplets fall a beat ahead and hit when the note sounds. Background rain is atmospheric.
- **BEE-9:** a bank of hand-written Manc lines per event (drop, bottled, Greggs, idle, district…).
  - Fixed lines are pre-rendered by ElevenLabs once (`gen-sfx`), so they cost no quota at demo time.
  - About a third of lines are templates with live details (drop count, district, temperature). `/api/tts` voices those on the fly with ElevenLabs Flash.
  - Commentary plays through the drone voice chain and ducks the music underneath.
  - Three original ElevenLabs TTS phrases are playable as musical samples. Their rhythmic loop runs on the same Tone transport as the melody and reaches the same recorder. Missing samples disable their controls; browser speech is never substituted for musical samples.
- **Layers are DJ moves:**
  - each one sweeps in or out through a filter on the beat with a whoosh, and a banner slams across the screen
  - drums sidechain-pump the rest of the mix
  - bass sends shockwaves across the road and the lead writes a piano roll in the sky
- **Takeovers:**
  - **MADCHESTER** is acid house: a baggy shuffle groove, piano stabs, a crowd and a shout, smileys, a "24 HOUR PARTY PEOPLE" billboard and an acid grade.
  - **GREGGS** is the bakery apocalypse: it rains sausage rolls, a giant sausage roll descends, the city turns blue and gold, with choir stabs, pastry-crunch percussion and a sub drop.
- **Visuals:** React Three Fiber, a custom instanced tower shader, a GPU rain shader, a reflective wet road, and bloom, chromatic aberration, glitch and scanlines.
- **Inspirations:**
  - Cyberfiction: scroll-locked chapters with editorial type and a marquee.
  - troisjs: kick-pulsed neon arch tunnel and the equaliser-bars sound toggle.
  - Lusion: zero-g Rapier chrome cluster shoved by the cursor, Lightformer env reflections.

```
src/audio/   engine (master chain, drop, recorder) · layers (instruments) · scales · voice
src/scene/   City · Rain · Splashes · Road · Districts (signs, Haçienda, lasers, tram) · Bee · CameraRig · Effects
src/ui/      Intro · HUD · DJSubtitle · Outro · Cursor
src/lib/    lines (BEE-9 line bank + track-name generator) · dj (when/what BEE-9 says) · weather · input
server/tts.ts ElevenLabs TTS (dev: Vite middleware, prod: api/tts.ts on Vercel)
```

## Demo script (~2 min)

1. PLUG IN. Three isolated notes demonstrate puddles lighting up with their sounds.
2. Click or drag across the puddles, or play A/S/D/F/G. The five colours identify the pitches.
3. Add DRUMS and BASS using the existing layer controls.
4. Press Z/X/C to add MAKE IT DANCE, MINT, and TURN IT UP. These are ElevenLabs-generated musical accents inside the performance.
5. Hold SPACE (or the DROP control) and release for the drop.
6. END SET; download your live performance and poster.

## Validation

```bash
npm test             # timing seam, quantization, and repeated drag-note deduplication
npm run build        # TypeScript + production bundle
```

The in-scene note labels provide keyboard/screen-reader alternatives to the 3D surfaces. Touch uses the puddles and a hold-to-drop control; chapter buttons provide navigation without conflicting with rain gestures. Test sound after the initial browser audio-unlock click. Built-in recording availability depends on the browser.

## License and assets

Project source is MIT licensed; see [LICENSE](LICENSE). Orbitron retains its [SIL Open Font License](public/fonts/OFL.txt). The bundled voice and sound assets were generated with ElevenLabs; see [ASSETS.md](ASSETS.md) for provenance. External names and marks belong to their respective owners.

The branch must be pushed before the new implementation is available in the public repository. Do not commit `.env` or API keys.
