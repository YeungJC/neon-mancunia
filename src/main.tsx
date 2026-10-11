import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(<App />);

if (import.meta.env.DEV) {
  // Debug handle for poking at live state from the console
  Promise.all([import("./store"), import("gsap")]).then(([{ fx, useStore }, { default: gsap }]) =>
    Object.assign(window, { __nm: { fx, useStore, gsap } }),
  );
}
