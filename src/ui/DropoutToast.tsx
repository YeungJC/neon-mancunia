import { useEffect, useState } from "react";
import { DIAG } from "../audio/dropoutMonitor";

/** Diagnostics only (dev, or ?diag): flags an audio cut-out the moment it happens, with the likely cause. */
export function DropoutToast() {
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    if (!DIAG) return;
    const on = (e: Event) => setReport((e as CustomEvent).detail);
    addEventListener("audio-dropout", on);
    return () => removeEventListener("audio-dropout", on);
  }, []);
  useEffect(() => {
    if (!report) return;
    const id = setTimeout(() => setReport(null), 12000);
    return () => clearTimeout(id);
  }, [report]);
  if (!report) return null;
  return (
    <div className="dropout-toast" role="status">
      <b>AUDIO DROPOUT · {String(report.when)}</b>
      <span>likely: {String(report.likely)}</span>
      <small>full report in the browser console ([audio-diag])</small>
    </div>
  );
}
