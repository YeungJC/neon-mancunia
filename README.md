# NEON MANCUNIA

> Manchester's rain finally does something useful.

Fly through a rain-soaked, neon Manchester in 2087 where **the city is the instrument**. Every raindrop is a note, every tower is an equaliser, every neon sign is a layer of the track. **BEE-9**, a cyber worker-bee drone DJ voiced by ElevenLabs, heckles your set in broad Manc.

## Run it

```bash
npm install
cp .env.example .env   # add ELEVENLABS_API_KEY (https://elevenlabs.io/app/settings/api-keys)
npm run gen-sfx        # one-off: ElevenLabs sound design + offline voice lines → public/
npm run dev            # http://localhost:5173
```

Everything degrades gracefully. With no key, no wifi or no generated SFX, it still plays: BEE-9 uses its pre-rendered lines (or the browser's voice if `gen-sfx` hasn't run), and the weather falls back to "drizzle".

## Controls

| Input | Does |
|---|---|
| Scroll (wheel, trackpad, swipe) / ↓ ↑ / chapter nav | Glide along the street; let go and it eases into the nearest district: Piccadilly → Northern Quarter → The Haçienda |
| Click a neon sign, a pad, or `1`–`5` | Toggle DRUMS · BASS · LEAD · MADCHESTER · GREGGS (lands on the next beat; pads show a live level meter) |
| Drag on empty space | Low-pass filter sweep (springs back open when you let go) |
| Move the pointer | Rain parts around it like an umbrella |
| Hold `Space` | Build the riser, release for the drop (let go too early and BEE-9 calls you out for bottling it) |
| Cursor on the chrome at the Haçienda | Shove it around; click it to change its colour |
| `Q` | Toggle high/low quality |
| END SET | BEE-9 names your track (Factory Records-style generator), and you can download the recording (`.webm`) |

## How it works

- **Audio:** Tone.js. Every layer runs continuously and is toggled by its gain, quantised to the bar, so it is always tight. Live Manchester weather (Open-Meteo) sets the mode (dry → Mixolydian, drizzle → Dorian, downpour → Aeolian), the tempo, and the rain density.
- **Audio drives visuals:** an FFT analyser writes into a shared `fx` object every frame. The towers' shader reads 64 FFT bins (the front row is a spectrum analyser along the street), and each rain-arpeggio note spawns a splash ripple panned where you hear it.
- **BEE-9:** a bank of hand-written Manc lines per event (drop, bottled, Greggs, idle, district…).
  - Fixed lines are pre-rendered by ElevenLabs once (`gen-sfx`), so they cost no quota at demo time.
  - About a third of lines are templates with live details (drop count, district, temperature). `/api/tts` voices those on the fly with ElevenLabs Flash.
  - The voice plays through a bitcrush/delay "drone radio" chain and ducks the music underneath.
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

1. Intro: point out the live weather line ("0.0mm/h — suspicious, adding rain anyway").
2. PLUG IN. Listen to the rain arpeggio and watch the ripples land where the notes pan.
3. Scroll into the Northern Quarter and click the signs: DRUMS, BASS, then GREGGS (BEE-9 reacts).
4. Drag the filter down and let go.
5. Fly to the Haçienda, hold Space, and release on the drop. Lasers.
6. END SET: BEE-9 names the track; download it.
