import { Bloom, ChromaticAberration, EffectComposer, Glitch, HueSaturation, Noise, Scanline, Vignette } from "@react-three/postprocessing";
import { useFrame } from "@react-three/fiber";
import { BlendFunction, GlitchMode, type BloomEffect, type ChromaticAberrationEffect, type GlitchEffect, type HueSaturationEffect } from "postprocessing";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { fx, useStore } from "../store";

// @react-three/postprocessing 2.x types these refs as the effect class, not the instance — hence `as never`.
export function Effects() {
  const hq = useStore((s) => s.highQuality);
  const bloom = useRef<BloomEffect>(null!);
  const ca = useRef<ChromaticAberrationEffect>(null!);
  const glitch = useRef<GlitchEffect>(null!);
  const grade = useRef<HueSaturationEffect>(null!);
  const caOffset = useMemo(() => new THREE.Vector2(0.0006, 0.0006), []);

  useFrame((state) => {
    if (bloom.current) bloom.current.intensity = 0.6 + fx.energy * 0.3 + fx.kick * (0.35 + fx.dropping) + fx.flash * 2.5 + fx.charge * 0.8 + fx.warp * 0.8;
    const a = 0.0001 + fx.flash * 0.012 + fx.charge * 0.004 + fx.kick * 0.0012 + fx.warp * 0.006 + fx.levels.bass * 0.002;
    ca.current?.offset.set(a, a * 0.6);
    // Madchester: acid grade, hue drifting through the psychedelic range; Greggs: warm & saturated
    if (grade.current) {
      const m = fx.theme.madchester;
      grade.current.hue = m * Math.sin(state.clock.elapsedTime * 0.35) * 0.9;
      grade.current.saturation = m * 0.45 + fx.theme.greggs * 0.2;
    }
    if (glitch.current) glitch.current.mode = fx.flash > 0.75 ? GlitchMode.CONSTANT_WILD : fx.charge > 0.85 ? GlitchMode.SPORADIC : GlitchMode.DISABLED;
  });

  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <Bloom ref={bloom as never} mipmapBlur luminanceThreshold={0.65} luminanceSmoothing={0.3} intensity={1.2} levels={hq ? 8 : 5} />
      <HueSaturation ref={grade as never} hue={0} saturation={0} />
      <ChromaticAberration ref={ca as never} offset={caOffset} radialModulation modulationOffset={0.2} />
      <Glitch ref={glitch} delay={new THREE.Vector2(0.4, 1.2)} duration={new THREE.Vector2(0.05, 0.2)} strength={new THREE.Vector2(0.15, 0.4)} mode={GlitchMode.DISABLED} />
      <Scanline blendFunction={BlendFunction.OVERLAY} density={1.4} opacity={0.035} />
      <Noise premultiply blendFunction={BlendFunction.ADD} opacity={0.045} />
      <Vignette offset={0.25} darkness={0.75} />
    </EffectComposer>
  );
}
