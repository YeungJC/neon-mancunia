import { createRoot } from "react-dom/client";
import { lazy, Suspense } from "react";
import "./styles.css";

// ?remote=CODE is the phone controller: a light page with no 3D, loaded on its own
const remoteCode = new URLSearchParams(location.search).get("remote");
const Root = remoteCode
  ? lazy(() => import("./remote/RemoteApp").then((m) => ({ default: () => <m.RemoteApp code={remoteCode} /> })))
  : lazy(() => import("./App").then((m) => ({ default: m.App })));

createRoot(document.getElementById("root")!).render(
  <Suspense fallback={null}>
    <Root />
  </Suspense>,
);

if (import.meta.env.DEV) {
  // Debug handle for poking at live state from the console
  Promise.all([import("./store"), import("gsap"), import("tone")]).then(([{ fx, useStore }, { default: gsap }, Tone]) =>
    Object.assign(window, { __nm: { fx, useStore, gsap, Tone } }),
  );
}
