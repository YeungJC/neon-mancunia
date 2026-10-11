import { useEffect, useState } from "react";
import { startTalking, stopTalking } from "../lib/talk";
import { useStore } from "../store";

/** Hold-to-talk mic button for the HUD. */
export function MicButton() {
  const state = useStore((s) => s.talk.state);
  return (
    <button
      className={`btn btn--ghost mic ${state === "listening" ? "mic--on" : ""}`}
      onPointerDown={(e) => {
        e.preventDefault();
        startTalking();
      }}
      onPointerUp={stopTalking}
      onPointerLeave={() => state === "listening" && stopTalking()}
      title="Hold to talk to BEE-9 (or hold V)"
      aria-label="Hold to talk to BEE-9"
    >
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
        <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
      </svg>
      <kbd>V</kbd>
    </button>
  );
}

/** LISTENING… / THINKING… while you talk, then what BEE-9 heard. */
export function TalkIndicator() {
  const { state, heard } = useStore((s) => s.talk);
  const [shown, setShown] = useState("");
  useEffect(() => {
    if (!heard) return;
    setShown(heard);
    const id = setTimeout(() => setShown(""), 5000);
    return () => clearTimeout(id);
  }, [heard]);

  if (state === "idle" && !shown) return null;
  return (
    <div className={`talk talk--${state}`} aria-live="polite">
      {state === "listening" && (
        <>
          <span className="talk__wave" aria-hidden>
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
          LISTENING… LET GO WHEN YOU'RE DONE
        </>
      )}
      {state === "thinking" && "BEE-9 IS THINKING…"}
      {state === "idle" && shown && (
        <>
          <span className="talk__you">YOU</span> “{shown}”
        </>
      )}
    </div>
  );
}
