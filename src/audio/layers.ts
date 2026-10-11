import * as Tone from "tone";
import { chord, degreeToMidi, midiToNote, PROGRESSION, type Scale } from "./scales";

export type LayerKey = "pad" | "rain" | "drums" | "bass" | "lead" | "greggs" | "madchester";

type Hooks = {
  getScale: () => Scale;
  /** 0..1 — how often the rain arpeggio fires */
  getRain: () => number;
  onKick: (time: number) => void;
  onSplash: (pan: number, time: number) => void;
};

const STEPS = [...Array(16).keys()];

/** Every layer runs continuously; audibility is just its output gain. This keeps toggles sample-tight. */
export function buildLayers(dest: Tone.InputNode, hooks: Hooks) {
  const transport = Tone.getTransport();
  const barAt = (time: number) => Math.floor(transport.getTicksAtTime(time) / (transport.PPQ * 4));
  const chordDegAt = (time: number) => PROGRESSION[barAt(time) % PROGRESSION.length];

  const gains = {} as Record<LayerKey, Tone.Gain>;
  /** Post-gain level per layer, so the UI can show what each one is actually doing. */
  const meters = {} as Record<LayerKey, Tone.Meter>;
  const disposables: { dispose(): unknown }[] = [];
  const own = <T extends { dispose(): unknown }>(n: T) => (disposables.push(n), n);
  const out = (key: LayerKey, initial: number) => {
    const g = own(new Tone.Gain(initial).connect(dest));
    gains[key] = g;
    meters[key] = own(new Tone.Meter({ smoothing: 0.6 }));
    g.connect(meters[key]);
    return g;
  };

  const reverb = own(new Tone.Reverb({ decay: 6, wet: 0.4 }));
  reverb.connect(dest);

  // ── PAD: always on, the wet-pavement bed ─────────────────────────────
  {
    const g = out("pad", 1);
    const chorus = own(new Tone.Chorus(0.6, 3.5, 0.5).start());
    const lp = own(new Tone.Filter(1600, "lowpass"));
    const pad = own(
      new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "fatsawtooth", count: 3, spread: 28 },
        envelope: { attack: 1.2, decay: 0.6, sustain: 0.6, release: 2.5 },
        volume: -19,
      }),
    );
    pad.chain(lp, chorus, g);
    chorus.connect(reverb);
    own(
      new Tone.Loop((time) => {
        pad.triggerAttackRelease(chord(hooks.getScale(), chordDegAt(time)), "1m", time, 0.7);
      }, "1m").start(0),
    );
  }

  // ── RAIN ARPEGGIO: every note is a raindrop hitting the road ─────────
  {
    const g = out("rain", 1);
    const delay = own(new Tone.FeedbackDelay({ delayTime: "8n.", feedback: 0.35, wet: 0.3 }));
    delay.connect(g);
    delay.connect(reverb);
    // Round-robin voices so each drop keeps its own stereo position
    const voices = [...Array(4)].map(() => {
      const panner = own(new Tone.Panner(0).connect(delay));
      const synth = own(
        new Tone.Synth({
          oscillator: { type: "triangle" },
          envelope: { attack: 0.002, decay: 0.22, sustain: 0, release: 0.3 },
          volume: -14,
        }).connect(panner),
      );
      return { panner, synth };
    });
    let v = 0;
    own(
      new Tone.Loop((time) => {
        if (Math.random() > hooks.getRain() * 0.55) return;
        const scale = hooks.getScale();
        const base = chordDegAt(time);
        const deg = base + [0, 2, 4, 6, 7, 9][Math.floor(Math.random() * 6)];
        const pan = Math.random() * 1.8 - 0.9;
        const voice = voices[v++ % voices.length];
        voice.panner.pan.setValueAtTime(pan, time);
        voice.synth.triggerAttackRelease(midiToNote(degreeToMidi(scale, deg, 2)), "32n", time, 0.3 + Math.random() * 0.5);
        hooks.onSplash(pan, time);
      }, "16n").start(0),
    );
  }

  // ── DRUMS: baggy Madchester breakbeat ────────────────────────────────
  {
    const g = out("drums", 0);
    const kick = own(
      new Tone.MembraneSynth({
        pitchDecay: 0.05,
        octaves: 6,
        envelope: { attack: 0.001, decay: 0.4, sustain: 0 },
        volume: -3,
      }).connect(g),
    );
    const snareBp = own(new Tone.Filter(1900, "bandpass", -12).connect(g));
    const snare = own(
      new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.18, sustain: 0 }, volume: -6 }).connect(snareBp),
    );
    snareBp.connect(reverb);
    const hatHp = own(new Tone.Filter(8000, "highpass").connect(g));
    const hat = own(
      new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.035, sustain: 0 }, volume: -24 }).connect(hatHp),
    );
    const K = [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0];
    const S = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0.25, 0, 1, 0, 0, 0.4];
    own(
      new Tone.Sequence(
        (time, step: number) => {
          if (K[step]) {
            kick.triggerAttackRelease("D1", "8n", time);
            hooks.onKick(time);
          }
          if (S[step]) snare.triggerAttackRelease("16n", time, S[step]);
          hat.triggerAttackRelease("32n", time, step % 4 === 2 ? 0.9 : 0.35);
        },
        STEPS,
        "16n",
      ).start(0),
    );
  }

  // ── BASS ─────────────────────────────────────────────────────────────
  {
    const g = out("bass", 0);
    const bass = own(
      new Tone.MonoSynth({
        oscillator: { type: "sawtooth" },
        filter: { Q: 1, type: "lowpass", rolloff: -24 },
        envelope: { attack: 0.005, decay: 0.2, sustain: 0.5, release: 0.2 },
        filterEnvelope: { attack: 0.005, decay: 0.15, sustain: 0.3, baseFrequency: 90, octaves: 2 },
        volume: -11,
      }).connect(g),
    );
    const R = [1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0];
    own(
      new Tone.Sequence(
        (time, step: number) => {
          if (!R[step]) return;
          const m = degreeToMidi(hooks.getScale(), chordDegAt(time), -1) + (step === 7 || step === 13 ? 12 : 0);
          bass.triggerAttackRelease(midiToNote(m), "16n", time);
        },
        STEPS,
        "16n",
      ).start(0),
    );
  }

  // ── LEAD: a generative motif that mutates every 8 bars ───────────────
  {
    const g = out("lead", 0);
    const delay = own(new Tone.FeedbackDelay({ delayTime: "8n.", feedback: 0.4, wet: 0.35 }).connect(g));
    delay.connect(reverb);
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
          if (deg == null) return;
          lead.triggerAttackRelease(midiToNote(degreeToMidi(hooks.getScale(), chordDegAt(time) + deg, 1)), "8n", time);
        },
        STEPS,
        "8n",
      ).start(0),
    );
  }

  // ── GREGGS: a gloriously stupid crushed brass stab ───────────────────
  {
    const g = out("greggs", 0);
    const crush = own(new Tone.BitCrusher(7).connect(g));
    crush.wet.value = 0.3;
    const stab = own(
      new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "fatsawtooth", count: 2, spread: 40 },
        envelope: { attack: 0.004, decay: 0.16, sustain: 0, release: 0.1 },
        volume: -19,
      }).connect(crush),
    );
    const P = [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1];
    own(
      new Tone.Sequence(
        (time, step: number) => {
          if (P[step]) stab.triggerAttackRelease(chord(hooks.getScale(), chordDegAt(time), 1), "16n", time);
        },
        STEPS,
        "16n",
      ).start(0),
    );
  }

  // ── MADCHESTER: tambourine shuffle + offbeat organ (Happy Mondays energy) ──
  {
    const g = out("madchester", 0);
    const hp = own(new Tone.Filter(7000, "highpass").connect(g));
    const tamb = own(
      new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.07, sustain: 0 }, volume: -20 }).connect(hp),
    );
    const leslie = own(new Tone.Chorus(6, 2, 0.4).start().connect(g));
    const organ = own(
      new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "custom", partials: [1, 0.6, 0.8, 0, 0.35, 0, 0, 0.2] },
        envelope: { attack: 0.005, decay: 0.1, sustain: 0.7, release: 0.08 },
        volume: -22,
      }).connect(leslie),
    );
    own(
      new Tone.Sequence(
        (time, step: number) => {
          tamb.triggerAttackRelease("32n", time, step % 2 ? 0.45 : 1);
          if (step % 4 === 2) organ.triggerAttackRelease(chord(hooks.getScale(), chordDegAt(time), 1), "16n", time);
        },
        STEPS,
        "16n",
      ).start(0),
    );
  }

  return {
    gains,
    meters,
    dispose: () => disposables.reverse().forEach((d) => d.dispose()),
  };
}
