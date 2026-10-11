import { useEffect, useState } from "react";

/** Text with RGB-split glitch layers (styled in CSS via data-text). */
export function GlitchText({ text, className = "", as: Tag = "span" }: { text: string; className?: string; as?: "span" | "h1" | "h2" | "div" }) {
  return (
    <Tag className={`glitch ${className}`} data-text={text}>
      {text}
    </Tag>
  );
}

/** Types text out, scrambling the next few characters like a decrypt. */
export function useTyped(text: string, cps = 45) {
  const [out, setOut] = useState("");
  useEffect(() => {
    if (!text) return setOut("");
    let i = 0;
    const glyphs = "▓▒░#/\\<>_01";
    const id = setInterval(() => {
      i++;
      const tail = [...Array(Math.min(3, text.length - i))].map(() => glyphs[Math.floor(Math.random() * glyphs.length)]).join("");
      setOut(text.slice(0, i) + tail);
      if (i >= text.length) clearInterval(id);
    }, 1000 / cps);
    return () => clearInterval(id);
  }, [text, cps]);
  return out;
}
