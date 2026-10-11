import { Bloom, ChromaticAberration, EffectComposer, Glitch, Noise, Scanline, Vignette } from "@react-three/postprocessing";
import { useFrame } from "@react-three/fiber";
import { BlendFunction, GlitchMode, type BloomEffect, type ChromaticAberrationEffect, type GlitchEffect } from "postprocessing";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { fx, useStore } from "../store";

// @react-three/postprocessing 2.x types these refs as the effect class, not the instance — hence `as never`.
export function Effects() {
  const hq = useStore((s) => s.highQuality);
  const bloom = useRef<BloomEffect>(null!);
  const ca = useRef<ChromaticAberrationEffect>(null!);
  const glitch = useRef<GlitchEffect>(null!);
  const caOffset = useMemo(() => new THREE.Vector2(0.0006, 0.0006), []);

  useFrame(() => {
    if (bloom.current) bloom.current.intensity = 1.1 + fx.energy * 0.9 + fx.kick * 0.35 + fx.flash * 2.5 + fx.charge * 0.8 + fx.warp * 0.8;
    const a = 0.0006 + fx.flash * 0.012 + fx.charge * 0.004 + fx.kick * 0.0012 + fx.warp * 0.006;
    ca.current?.offset.set(a, a * 0.6);
    if (glitch.current) glitch.current.mode = fx.flash > 0.75 ? GlitchMode.CONSTANT_WILD : fx.charge > 0.85 ? GlitchMode.SPORADIC : GlitchMode.DISABLED;
  });

  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <Bloom ref={bloom as never} mipmapBlur luminanceThreshold={0.22} luminanceSmoothing={0.3} intensity={1.2} levels={hq ? 8 : 5} />
      <ChromaticAberration ref={ca as never} offset={caOffset} radialModulation modulationOffset={0.2} />
      <Glitch ref={glitch} delay={new THREE.Vector2(0.4, 1.2)} duration={new THREE.Vector2(0.05, 0.2)} strength={new THREE.Vector2(0.15, 0.4)} mode={GlitchMode.DISABLED} />
      <Scanline blendFunction={BlendFunction.OVERLAY} density={1.4} opacity={0.12} />
      <Noise premultiply blendFunction={BlendFunction.ADD} opacity={0.35} />
      <Vignette offset={0.25} darkness={0.75} />
    </EffectComposer>
  );
}
