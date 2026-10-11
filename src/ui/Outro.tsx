import { restartRecording } from "../audio/engine";
import { useStore } from "../store";
import { GlitchText } from "./Glitch";

export function Outro() {
  const { trackName, recordingUrl, drops, startedAt, layers, set } = useStore();
  const mins = Math.max(1, Math.round((Date.now() - startedAt) / 60000));
  const layersOn = Object.values(layers).filter(Boolean).length;
  const file = `${trackName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-neon-mancunia.webm`;

  return (
    <div className="outro" role="dialog" aria-label="Set complete">
      <div className="outro__card">
        <p className="outro__kicker">FAC 2087 · TRACK NAMED BY BEE-9</p>
        <GlitchText as="h1" className="outro__title" text={trackName || "UNTITLED DRIZZLE"} />
        <dl className="outro__stats">
          <div>
            <dt>DROPS</dt>
            <dd>{drops}</dd>
          </div>
          <div>
            <dt>MINUTES</dt>
            <dd>{mins}</dd>
          </div>
          <div>
            <dt>LAYERS LIVE</dt>
            <dd>{layersOn}/5</dd>
          </div>
        </dl>
        <div className="outro__actions">
          {recordingUrl ? (
            <a className="btn btn--primary" href={recordingUrl} download={file}>
              DOWNLOAD TRACK
            </a>
          ) : (
            <span className="outro__note">Recording isn't supported in this browser.</span>
          )}
          <button
            className="btn btn--ghost"
            onClick={() => {
              restartRecording();
              set({ phase: "live", startedAt: Date.now(), drops: 0 });
            }}
          >
            BACK INTO THE RAIN
          </button>
        </div>
      </div>
    </div>
  );
}
