import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import { useChapterNav } from "./lib/chapters";
import { useControls } from "./lib/input";
import { Arches } from "./scene/Arches";
import { Bee } from "./scene/Bee";
import { CameraRig } from "./scene/CameraRig";
import { City } from "./scene/City";
import { Clusters } from "./scene/Cluster";
import { Districts } from "./scene/Districts";
import { HeroTitle } from "./scene/HeroTitle";
import { Effects } from "./scene/Effects";
import { FOG_COLOR, FOG_DENSITY } from "./scene/layout";
import { Lighting } from "./scene/Lighting";
import { Rain } from "./scene/Rain";
import { Road } from "./scene/Road";
import { Splashes } from "./scene/Splashes";
import { useStore } from "./store";
import { Chapter } from "./ui/Chapter";
import { Cursor } from "./ui/Cursor";
import { DJSubtitle } from "./ui/DJSubtitle";
import { HUD } from "./ui/HUD";
import { Intro } from "./ui/Intro";
import { Outro } from "./ui/Outro";

export function App() {
  const phase = useStore((s) => s.phase);
  const hq = useStore((s) => s.highQuality);
  useControls();
  useChapterNav();

  return (
    <>
      <Canvas
        className="stage"
        dpr={hq ? [1, 1.5] : 1}
        gl={{ antialias: false, powerPreference: "high-performance" }}
        camera={{ position: [0, 3.4, 16], fov: 62, near: 0.1, far: 320 }}
      >
        <color attach="background" args={[FOG_COLOR]} />
        <fogExp2 attach="fog" args={[FOG_COLOR, FOG_DENSITY]} />
        <Suspense fallback={null}>
          <CameraRig />
          <Lighting />
          <City />
          <Arches />
          <Road />
          <Rain />
          <Splashes />
          <Districts />
          <Clusters />
          <HeroTitle />
          <Bee />
          <Effects />
        </Suspense>
      </Canvas>
      {phase === "live" && <Chapter />}
      {phase !== "intro" && <HUD />}
      {phase !== "intro" && <DJSubtitle />}
      {phase === "outro" && <Outro />}
      <Intro />
      <Cursor />
    </>
  );
}
