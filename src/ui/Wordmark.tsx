/** Cyberfiction-style mixed-weight wordmark: heavy NEON, light MANCUNIA, trailing asterisk. */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`wordmark ${className}`}>
      <strong>NEON</strong>/MANCUNIA<sup aria-hidden>*</sup>
    </span>
  );
}
