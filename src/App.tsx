import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import { useAttract } from "./lib/attract";
import { useChapterNav } from "./lib/chapters";
import { useControls } from "./lib/input";
import { useTalk } from "./lib/talk";
import { Arches } from "./scene/Arches";
import { Bee } from "./scene/Bee";
import { CameraRig } from "./scene/CameraRig";
import { City } from "./scene/City";
import { Clusters } from "./scene/Cluster";
import { Districts } from "./scene/Districts";
import { HeroTitle } from "./scene/HeroTitle";
import { Effects } from "./scene/Effects";
import { FOG_COLOR, FOG_DENSITY } from "./scene/layout";
import { LayerFX } from "./scene/LayerFX";
import { Lighting } from "./scene/Lighting";
import { RainGarden } from "./scene/RainGarden";
import { RainDeck } from "./ui/RainDeck";
import { Rain } from "./scene/Rain";
import { Road } from "./scene/Road";
import { Splashes } from "./scene/Splashes";
import { Takeovers } from "./scene/Takeovers";
import { useStore } from "./store";
import { Chapter } from "./ui/Chapter";
import { Cursor } from "./ui/Cursor";
import { DropCountdown } from "./ui/DropCountdown";
import { DropoutToast } from "./ui/DropoutToast";
import { DJSubtitle } from "./ui/DJSubtitle";
import { HUD } from "./ui/HUD";
import { LayerBanner } from "./ui/LayerBanner";
import { Intro } from "./ui/Intro";
import { Outro } from "./ui/Outro";
import { TalkIndicator } from "./ui/Talk";

export function App() {
  const phase = useStore((s) => s.phase);
  const hq = useStore((s) => s.highQuality);
  const attract = useStore((s) => s.attract);
  useControls();
  useChapterNav();
  useAttract();
  useTalk();

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
          <RainGarden />
          <Splashes />
          <LayerFX />
          <Takeovers />
          <Districts />
          <Clusters />
          <HeroTitle />
          <Bee />
          <Effects />
        </Suspense>
      </Canvas>
      {phase === "live" && <Chapter />}
      {phase === "live" && <RainDeck />}
      {phase !== "intro" && <HUD />}
      {phase === "live" && <LayerBanner />}
      {phase === "live" && <DropCountdown />}
      {phase === "live" && <TalkIndicator />}
      {attract && (
        <div className="attract" aria-live="polite">
          <span className="attract__dot" />
          TOUCH ANYTHING TO PLAY
        </div>
      )}
      {phase !== "intro" && <DJSubtitle />}
      {phase === "outro" && <Outro />}
      <DropoutToast />
      <Intro />
      <Cursor />
    </>
  );
}
