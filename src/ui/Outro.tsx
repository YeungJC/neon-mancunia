import { useEffect, useRef, useState } from "react";
import { newSet } from "../lib/session";
import { drawPoster, pickRows, POSTER_ROWS } from "../lib/poster";
import { useStore } from "../store";

/** Set complete: the Factory-style poster draws itself from your set, next to the track download. */
export function Outro() {
  const { trackName, recordingUrl, catalogue } = useStore();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const slug = trackName.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  useEffect(() => {
    let raf = 0;
    let cancelled = false;
    const rows = pickRows();
    const meta = { trackName: trackName || "UNTITLED DRIZZLE", fac: catalogue };
    (async () => {
      await document.fonts.ready;
      const start = performance.now();
      const step = () => {
        if (cancelled || !canvas.current) return;
        // one row every ~35ms, top to bottom, then the type lands
        const n = Math.min(POSTER_ROWS, Math.floor((performance.now() - start) / 35));
        drawPoster(canvas.current, rows, meta, n);
        if (n < POSTER_ROWS) raf = requestAnimationFrame(step);
        else setPosterUrl(canvas.current.toDataURL("image/png"));
      };
      step();
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [trackName, catalogue]);

  return (
    <div className="outro" role="dialog" aria-label="Set complete">
      <div className="outro__layout">
        <canvas ref={canvas} className="outro__poster" aria-label={`Poster for ${trackName}`} />
        <div className="outro__side">
          <p className="outro__kicker">{catalogue} · NAMED BY BEE-9</p>
          <h1 className="outro__title">{trackName || "UNTITLED DRIZZLE"}</h1>
          <p className="outro__note">Your set, drawn as a Factory Records sleeve: every line is a moment of your track's sound.</p>
          <div className="outro__actions">
            {posterUrl && (
              <a className="btn btn--primary" href={posterUrl} download={`${slug}-poster.png`}>
                DOWNLOAD POSTER
              </a>
            )}
            {recordingUrl ? (
              <a className="btn btn--ghost" href={recordingUrl} download={`${slug}-neon-mancunia.webm`}>
                DOWNLOAD TRACK
              </a>
            ) : (
              <span className="outro__note">Recording isn't supported in this browser.</span>
            )}
            <button className="btn btn--ghost" onClick={() => newSet()}>
              BACK INTO THE RAIN
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
