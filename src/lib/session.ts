import { resetRain } from "../audio/rainInstrument";
import { resetLayers, restartRecording, stopRecording } from "../audio/engine";
import { useStore } from "../store";
import { nameTrack } from "./dj";
import { nextCatalogue } from "./poster";
import { resetHistory, startHistory, stopHistory } from "./setHistory";

/** END SET: freeze the history for the poster, stop the recording, let BEE-9 name it. */
export async function endSet() {
  resetRain();
  stopHistory();
  const url = await stopRecording();
  useStore.getState().set({ phase: "outro", recordingUrl: url, trackName: nameTrack(), catalogue: nextCatalogue() });
}

/** A fresh set: new recording, new history; `clean` also switches every layer off (kiosk / new visitor). */
export function newSet(clean = false) {
  resetRain();
  if (clean) resetLayers();
  resetHistory();
  startHistory();
  restartRecording();
  useStore.getState().set({ phase: "live", startedAt: Date.now(), drops: 0 });
}
