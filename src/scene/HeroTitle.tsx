import { Text } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useStore } from "../store";
import { FONT } from "./NeonSign";
import { NEON } from "./layout";

/**
 * The landing title as real neon in the scene: it strikes on like a tube when the page loads,
 * reflects in the wet road, and stutters out when you PLUG IN.
 */
export function HeroTitle() {
  const phase = useStore((s) => s.phase);
  // Unmount shortly after PLUG IN rather than trusting per-frame timing (frames can be sparse).
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (phase === "intro") return setGone(false);
    const id = setTimeout(() => setGone(true), 1400);
    return () => clearTimeout(id);
  }, [phase]);
  return gone ? null : <Title phase={phase} />;
}

function Title({ phase }: { phase: string }) {
  const { camera, viewport } = useThree();
  const group = useRef<THREE.Group>(null!);
  const top = useRef<THREE.MeshBasicMaterial>(null!);
  const bottom = useRef<THREE.MeshBasicMaterial>(null!);
  const anchor = useMemo(() => new THREE.Vector3(0, 4.2, 8.5), []);
  const pink = useMemo(() => new THREE.Color(NEON.magenta), []);
  const white = useMemo(() => new THREE.Color("#fff2fb"), []);
  const born = useRef(-1);
  const left = useRef(-1);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (born.current < 0) born.current = t;
    if (phase !== "intro" && left.current < 0) left.current = t;

    const vp = viewport.getCurrentViewport(camera, anchor);
    const portrait = vp.aspect < 1;
    const size = Math.min(1.15, vp.width / (portrait ? 7.2 : 16));
    group.current.position.set(portrait ? -vp.width * 0.42 : -vp.width * 0.43, portrait ? 5.6 : 4.55, anchor.z);
    group.current.scale.setScalar(size);

    // strike-on: random stutter for the first ~1.4s, then a steady buzz
    const age = t - born.current;
    let k = age < 1.4 ? (Math.random() > 0.55 - age * 0.3 ? 2.4 : 0.05) : 2.2 + Math.sin(t * 80) * 0.06;
    if (left.current >= 0) {
      const out = t - left.current;
      k = out < 0.6 ? (Math.random() > 0.5 ? 3 : 0) : Math.max(0, 2.2 - (out - 0.6) * 6);
      group.current.position.y += out * out * 2.5;
      group.current.visible = out < 1.2;
    }
    top.current.color.copy(white).multiplyScalar(k);
    bottom.current.color.copy(pink).multiplyScalar(k);
  });

  return (
    <group ref={group}>
      <Text font={FONT} fontSize={1} anchorX="left" anchorY="bottom" letterSpacing={0.04} outlineWidth={0.03} outlineBlur={0.35} outlineColor={NEON.magenta} outlineOpacity={0.6}>
        NEON
        <meshBasicMaterial ref={top} toneMapped={false} />
      </Text>
      <Text font={FONT} fontSize={1} anchorX="left" anchorY="top" position-y={-0.08} letterSpacing={0.04} outlineWidth={0.03} outlineBlur={0.35} outlineColor={NEON.magenta} outlineOpacity={0.6}>
        MANCUNIA
        <meshBasicMaterial ref={bottom} toneMapped={false} />
      </Text>
    </group>
  );
}
