import * as Tone from "tone";

/**
 * Finds the cause of "random" audio cut-outs. The pad never stops, so if the master goes silent while
 * the player hasn't muted it, that's a dropout: log everything that could explain it at that moment.
 * Runs in dev, or on any build with ?diag in the URL.
 */
export const DIAG = import.meta.env.DEV || new URLSearchParams(location.search).has("diag");

type Probe = () => Record<string, unknown>;

const longTasks: { at: number; ms: number }[] = [];
const errors: { at: number; msg: string }[] = [];
const ctxEvents: { at: number; state: string }[] = [];

export function startDropoutMonitor(master: Tone.ToneAudioNode, probe: Probe) {
  if (!DIAG) return;
  const meter = new Tone.Meter({ smoothing: 0 });
  master.connect(meter);

  // main-thread freezes longer than the audio scheduler's lookahead cause gaps
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        longTasks.push({ at: e.startTime, ms: Math.round(e.duration) });
        if (e.duration > Tone.getContext().lookAhead * 1000) console.warn(`[audio-diag] main thread froze ${Math.round(e.duration)}ms (scheduler lookahead ${Math.round(Tone.getContext().lookAhead * 1000)}ms)`);
      }
      while (longTasks.length > 50) longTasks.shift();
    }).observe({ type: "longtask", buffered: false });
  } catch {
    /* longtask not supported */
  }
  addEventListener("error", (e) => errors.push({ at: performance.now(), msg: String(e.message) }));
  addEventListener("unhandledrejection", (e) => errors.push({ at: performance.now(), msg: String(e.reason?.message ?? e.reason) }));
  const raw = Tone.getContext().rawContext as AudioContext;
  raw.addEventListener("statechange", () => ctxEvents.push({ at: performance.now(), state: raw.state }));

  let silentSince = 0;
  let reported = false;
  let lastAudioTime = raw.currentTime;
  const tick = () => {
    const now = performance.now();
    const db = meter.getValue() as number;
    const p = probe();
    const expectSound = p.phase === "live" && !p.muted && (p.volume as number) > 0.02;
    if (expectSound && db < -55) {
      silentSince ||= now;
      if (!reported && now - silentSince > 250) {
        reported = true;
        const recent = <T extends { at: number }>(xs: T[]) => xs.filter((x) => now - x.at < 3000);
        const audioAdvance = raw.currentTime - lastAudioTime;
        const report = {
          when: new Date().toLocaleTimeString(),
          silentForMs: Math.round(now - silentSince),
          masterDb: Number(db.toFixed(1)),
          contextState: raw.state,
          audioClockAdvancing: audioAdvance > 0.001,
          ...p,
          recentMainThreadFreezes: recent(longTasks).map((t) => `${t.ms}ms`),
          recentErrors: recent(errors).map((e) => e.msg),
          recentContextStateChanges: recent(ctxEvents).map((e) => e.state),
        };
        const r = report as Record<string, unknown>;
        const likely =
          r.contextState !== "running" ? `audio device ${r.contextState} (Bluetooth/output switch?)`
          : !r.audioClockAdvancing ? "audio clock stalled (audio thread overloaded?)"
          : r.destinationMuted ? "app mute is on"
          : (r.dropGateGain as number) < 0.2 ? "drop's silent 'breath' gate is closed"
          : (r.voiceDuckGain as number) < 0.2 ? "voice duck stuck low"
          : (r.masterLowpassHz as number) < 300 ? "master low-pass filter closed"
          : (r.masterHighpassHz as number) > 500 ? "build high-pass filter stuck open"
          : (r.destinationDb as number) < -40 ? "master volume near zero"
          : (r.recentMainThreadFreezes as string[]).length ? "main thread froze (3D scene) and the scheduler missed notes"
          : "unknown: all gates open but output silent";
        Object.assign(report, { likely });
        console.warn("[audio-diag] DROPOUT", report);
        console.table(report);
        window.dispatchEvent(new CustomEvent("audio-dropout", { detail: report }));
      }
    } else {
      if (reported && silentSince) console.info(`[audio-diag] sound back after ${Math.round(now - silentSince)}ms`);
      silentSince = 0;
      reported = false;
    }
    lastAudioTime = raw.currentTime;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
