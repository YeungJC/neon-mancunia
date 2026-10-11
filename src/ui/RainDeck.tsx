import { triggerVocal, useRain, VOCAL_LABELS } from '../audio/rainInstrument';
import { poke } from '../lib/dj';

/** A quiet hint line, leaving the instrument itself in the scene. */
export function RainDeck() {
  const ready = useRain(s => s.vocalReady);
  const active = useRain(s => s.activeVocal);
  return <div className="rain-hints" aria-label="Play along">
    <span className="rain-hints__notes">A S D F G <span>· play the puddles</span></span>
    <div className="rain-hints__sounds" role="group" aria-label="ElevenLabs sound effects">
      {VOCAL_LABELS.map((label, i) => <button key={label} disabled={!ready[i]}
        className={active === i ? 'active' : ''}
        aria-label={`${label}, key ${['Z', 'X', 'C'][i]}${ready[i] ? '' : ', unavailable'}`}
        title={`ElevenLabs · ${label}`} onClick={() => { triggerVocal(i); poke(); }}>
        <kbd>{['Z', 'X', 'C'][i]}</kbd><span>{label.toLowerCase()}</span>
      </button>)}
    </div>
  </div>;
}
