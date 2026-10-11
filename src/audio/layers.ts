import * as Tone from "tone";
import { chord, degreeToMidi, midiToNote, PROGRESSION, type Scale } from "./scales";

export type LayerKey = "pad" | "rain" | "drums" | "bass" | "lead" | "greggs" | "madchester";

type Hooks = {
  getScale: () => Scale;
  /** 0..1 — how often the rain arpeggio fires */
  getRain: () => number;
  /** 0..1 takeover amounts, so grooves and timbres can switch with the theme */
  getTheme: () => { greggs: number; madchester: number };
  /** Whether a toggleable layer should synthesise right now (on, fading in/out, or in a drop). Saves audio CPU. */
  isOn: (key: LayerKey) => boolean;
  onKick: (time: number) => void;
  onSplash: (pan: number, time: number) => void;
  onBass: (midi: number, time: number) => void;
  onLead: (midi: number, time: number) => void;
  /** ElevenLabs one-shots that live inside a layer (so the layer's gain gates them). */
  samples: Partial<Record<"choir", Tone.ToneAudioBuffer>>;
};

const STEPS = [...Array(16).keys()];

/**
 * Every layer runs continuously; audibility is its output gain, so toggles are sample-tight.
 * Chain per layer: entry filter (sweep in/out) → gain → [pump bus] → out, with reverb sent *after* the gain
 * so an "off" layer is truly silent.
 */
export function buildLayers(dest: Tone.InputNode, hooks: Hooks) {
  const transport = Tone.getTransport();
  const barAt = (time: number) => Math.floor(transport.getTicksAtTime(time) / (transport.PPQ * 4));
  const chordDegAt = (time: number) => PROGRESSION[barAt(time) % PROGRESSION.length];

  const gains = {} as Record<LayerKey, Tone.Gain>;
  const entries = {} as Record<LayerKey, Tone.Filter>;
  /** Post-gain level per layer, so the UI can show what each one is actually doing. */
  const meters = {} as Record<LayerKey, Tone.Meter>;
  const disposables: { dispose(): unknown }[] = [];
  /** Echoes whose time is musical ("8n."): retimed when the tempo changes so they stay on the beat. */
  const tempoDelays: Tone.FeedbackDelay[] = [];
  const own = <T extends { dispose(): unknown }>(n: T) => (disposables.push(n), n);

  const reverb = own(new Tone.Reverb({ decay: 6, wet: 1 }));
  // Sidechain-style pump: everything but the drums dips on each audible kick.
  const pumpBus = own(new Tone.Gain(1).connect(dest));
  reverb.connect(pumpBus);

  const out = (key: LayerKey, initial: number, opts: { reverb?: number; pumped?: boolean } = {}) => {
    const entry = own(new Tone.Filter({ type: "lowpass", frequency: 20000, rolloff: -24 }));
    const g = own(new Tone.Gain(initial));
    entry.connect(g);
    g.connect(opts.pumped === false ? dest : pumpBus);
    if (opts.reverb) g.connect(own(new Tone.Gain(opts.reverb)).connect(reverb));
    meters[key] = own(new Tone.Meter({ smoothing: 0.6 }));
    g.connect(meters[key]);
    gains[key] = g;
    entries[key] = entry;
    return entry;
  };

  // ── PAD: always on, the wet-pavement bed ─────────────────────────────
  {
    const input = out("pad", 1, { reverb: 0.45 });
    const chorus = own(new Tone.Chorus(0.6, 3.5, 0.5).start());
    const lp = own(new Tone.Filter(1600, "lowpass"));
    const pad = own(
      new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "fatsawtooth", count: 3, spread: 28 },
        envelope: { attack: 1.2, decay: 0.6, sustain: 0.6, release: 2.5 },
        volume: -19,
      }),
    );
    pad.chain(lp, chorus, input);
    own(
      new Tone.Loop((time) => {
        pad.triggerAttackRelease(chord(hooks.getScale(), chordDegAt(time)), "1m", time, 0.7);
      }, "1m").start(0),
    );
  }

  // Rain now belongs to the playable instrument; retain the bus for existing gain resets.
  out("rain", 0);

  // ── DRUMS: baggy breakbeat; a looser Madchester shuffle during the takeover ──
  {
    const input = out("drums", 0, { pumped: false, reverb: 0.12 });
    const kick = own(
      new Tone.MembraneSynth({
        pitchDecay: 0.05,
        octaves: 6,
        envelope: { attack: 0.001, decay: 0.4, sustain: 0 },
        volume: -3,
      }).connect(input),
    );
    const snareBp = own(new Tone.Filter(1900, "bandpass", -12).connect(input));
    const snare = own(
      new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.18, sustain: 0 }, volume: -6 }).connect(snareBp),
    );
    const hatHp = own(new Tone.Filter(8000, "highpass").connect(input));
    const hat = own(
      new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.035, sustain: 0 }, volume: -24 }).connect(hatHp),
    );
    const BREAK = {
      K: [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0],
      S: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0.25, 0, 1, 0, 0, 0.4],
    };
    // Funky-drummer-ish shuffle: the Stone Roses / Happy Mondays backbone
    const BAGGY = {
      K: [1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0],
      S: [0, 0, 0, 0, 1, 0, 0, 0.3, 0, 0.3, 0, 0, 1, 0, 0.3, 0],
    };
    own(
      new Tone.Sequence(
        (time, step: number) => {
          if (!hooks.isOn("drums")) return;
          const p = hooks.getTheme().madchester > 0.5 ? BAGGY : BREAK;
          if (p.K[step]) {
            kick.triggerAttackRelease("D1", "8n", time);
            hooks.onKick(time);
            // pump everything else when the drums can actually be heard
            if (gains.drums.gain.getValueAtTime(time) > 0.1) {
              pumpBus.gain.cancelScheduledValues(time);
              pumpBus.gain.setValueAtTime(0.42, time);
              pumpBus.gain.linearRampToValueAtTime(1, time + 0.22);
            }
          }
          if (p.S[step]) snare.triggerAttackRelease("16n", time, p.S[step]);
          hat.triggerAttackRelease("32n", time, step % 4 === 2 ? 0.9 : 0.35);
        },
        STEPS,
        "16n",
      ).start(0),
    );
  }

  // ── BASS ─────────────────────────────────────────────────────────────
  {
    const input = out("bass", 0);
    const bass = own(
      new Tone.MonoSynth({
        oscillator: { type: "sawtooth" },
        filter: { Q: 1, type: "lowpass", rolloff: -24 },
        envelope: { attack: 0.005, decay: 0.2, sustain: 0.5, release: 0.2 },
        filterEnvelope: { attack: 0.005, decay: 0.15, sustain: 0.3, baseFrequency: 90, octaves: 2 },
        volume: -11,
      }).connect(input),
    );
    const R = [1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0];
    own(
      new Tone.Sequence(
        (time, step: number) => {
          if (!R[step] || !hooks.isOn("bass")) return;
          const m = degreeToMidi(hooks.getScale(), chordDegAt(time), -1) + (step === 7 || step === 13 ? 12 : 0);
          bass.triggerAttackRelease(midiToNote(m), "16n", time);
          hooks.onBass(m, time);
        },
        STEPS,
        "16n",
      ).start(0),
    );
  }

  // ── LEAD: a generative motif that mutates every 8 bars ───────────────
  {
    const input = out("lead", 0, { reverb: 0.3 });
    const delay = own(new Tone.FeedbackDelay({ delayTime: "8n.", feedback: 0.4, wet: 0.35 }).connect(input));
    tempoDelays.push(delay);
    const vib = own(new Tone.Vibrato(5, 0.08).connect(delay));
    const lead = own(
      new Tone.Synth({
        oscillator: { type: "fattriangle", count: 2, spread: 14 },
        envelope: { attack: 0.02, decay: 0.2, sustain: 0.4, release: 0.4 },
        volume: -17,
      }).connect(vib),
    );
    const makeMotif = () => {
      let d = 0;
      return [...Array(16)].map((_, i) => {
        if (i > 0 && Math.random() < 0.35) return null;
        d = Math.max(-2, Math.min(9, d + [-2, -1, 1, 2, 0][Math.floor(Math.random() * 5)]));
        return d;
      });
    };
    let motif = makeMotif();
    let lastBar = -1;
    own(
      new Tone.Sequence(
        (time, step: number) => {
          const bar = barAt(time);
          if (step === 0 && bar % 8 === 0 && bar !== lastBar) {
            lastBar = bar;
            motif = makeMotif();
          }
          const deg = motif[step];
          if (deg == null || !hooks.isOn("lead")) return;
          const m = degreeToMidi(hooks.getScale(), chordDegAt(time) + deg, 1);
          lead.triggerAttackRelease(midiToNote(m), "8n", time);
          hooks.onLead(m, time);
        },
        STEPS,
        "8n",
      ).start(0),
    );
  }

  // ── GREGGS: clean brass stab + choir + a bouncy "pop" on the off-beats ────
  // (no bitcrusher, no crunch sample: both read as static over the mix)
  {
    const input = out("greggs", 0, { reverb: 0.25 });
    const stab = own(
      new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "fatsawtooth", count: 2, spread: 30 },
        envelope: { attack: 0.004, decay: 0.16, sustain: 0, release: 0.1 },
        volume: -19,
      }).connect(own(new Tone.Filter(2600, "lowpass").connect(input))),
    );
    const choir = hooks.samples.choir ? own(new Tone.Player(hooks.samples.choir).connect(input)) : null;
    if (choir) choir.volume.value = -10;
    const pop = own(
      new Tone.MembraneSynth({ pitchDecay: 0.02, octaves: 3, envelope: { attack: 0.001, decay: 0.09, sustain: 0 }, volume: -14 }).connect(input),
    );
    const P = [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1];
    const C = [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 1];
    own(
      new Tone.Sequence(
        (time, step: number) => {
          if (!hooks.isOn("greggs")) return;
          if (P[step]) stab.triggerAttackRelease(chord(hooks.getScale(), chordDegAt(time), 1), "16n", time);
          if (C[step]) pop.triggerAttackRelease(step % 4 === 2 ? "G4" : "D4", "32n", time, 0.7);
          if (choir && step === 0 && barAt(time) % 2 === 0) choir.start(time, 0, 1.6);
        },
        STEPS,
        "16n",
      ).start(0),
    );
  }

  // ── MADCHESTER: tambourine shuffle, offbeat organ and piano-house stabs ──
  {
    const input = out("madchester", 0, { reverb: 0.2 });
    const hp = own(new Tone.Filter(7000, "highpass").connect(input));
    const tamb = own(
      new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.07, sustain: 0 }, volume: -18 }).connect(hp),
    );
    const leslie = own(new Tone.Chorus(6, 2, 0.4).start().connect(input));
    const organ = own(
      new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "custom", partials: [1, 0.6, 0.8, 0, 0.35, 0, 0, 0.2] },
        envelope: { attack: 0.005, decay: 0.1, sustain: 0.7, release: 0.08 },
        volume: -22,
      }).connect(leslie),
    );
    const piano = own(
      new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 2,
        modulationIndex: 3,
        envelope: { attack: 0.002, decay: 0.5, sustain: 0.1, release: 0.4 },
        modulationEnvelope: { attack: 0.002, decay: 0.3, sustain: 0, release: 0.2 },
        volume: -20,
      }).connect(input),
    );
    const PIANO = [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0];
    own(
      new Tone.Sequence(
        (time, step: number) => {
          if (!hooks.isOn("madchester")) return;
          tamb.triggerAttackRelease("32n", time, step % 2 ? 0.45 : 1);
          if (step % 4 === 2) organ.triggerAttackRelease(chord(hooks.getScale(), chordDegAt(time), 1), "16n", time);
          if (PIANO[step]) piano.triggerAttackRelease(chord(hooks.getScale(), chordDegAt(time), 1).slice(0, 3), "16n", time, 0.8);
        },
        STEPS,
        "16n",
      ).start(0),
    );
  }

  return {
    gains,
    entries,
    meters,
    retime: () => tempoDelays.forEach((d) => d.delayTime.rampTo(Tone.Time("8n.").toSeconds(), 0.2)),
    dispose: () => disposables.reverse().forEach((d) => d.dispose()),
  };
}
