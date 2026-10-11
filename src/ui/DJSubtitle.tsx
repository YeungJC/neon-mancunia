import { useEffect, useState } from "react";
import { useStore } from "../store";
import { useTyped } from "./Glitch";

export function DJSubtitle() {
  const line = useStore((s) => s.djLine);
  const speaking = useStore((s) => s.djSpeaking);
  const typed = useTyped(line, 38);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!line) return;
    setVisible(true);
    if (speaking) return;
    const id = setTimeout(() => setVisible(false), 4500);
    return () => clearTimeout(id);
  }, [line, speaking]);

  return (
    <div className={`dj ${visible ? "dj--on" : ""}`} aria-live="polite">
      <span className="dj__tag">
        <span className={`dj__bars ${speaking ? "dj__bars--on" : ""}`}>
          <i />
          <i />
          <i />
          <i />
        </span>
        BEE-9
      </span>
      <p className="dj__line">{typed}</p>
    </div>
  );
}
