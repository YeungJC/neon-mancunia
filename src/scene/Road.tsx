import { MeshReflectorMaterial } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { fx, useStore } from "../store";
import { NEON } from "./layout";

const LENGTH = 220;
const CENTER_Z = -75;

export function Road() {
  const hq = useStore((s) => s.highQuality);
  const edges = useRef<THREE.MeshBasicMaterial[]>([]);
  const dashes = useMemo(() => [...Array(44)].map((_, i) => 25 - i * 5), []);

  useFrame(() => {
    const k = 1.5 + fx.kick * 2.5 + fx.flash * 4;
    edges.current[0]?.color.set(NEON.cyan).multiplyScalar(k);
    edges.current[1]?.color.set(NEON.magenta).multiplyScalar(k);
  });

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, CENTER_Z]}>
        <planeGeometry args={[80, LENGTH]} />
        {hq ? (
          <MeshReflectorMaterial
            blur={[400, 80]}
            resolution={512}
            mixBlur={1}
            mixStrength={60}
            roughness={0.9}
            depthScale={1.1}
            minDepthThreshold={0.3}
            maxDepthThreshold={1.4}
            color="#07060c"
            metalness={0.6}
            mirror={0.8}
          />
        ) : (
          <meshStandardMaterial color="#07060c" roughness={0.25} metalness={0.85} />
        )}
      </mesh>
      {[-7, 7].map((x, i) => (
        <mesh key={x} rotation-x={-Math.PI / 2} position={[x, 0.02, CENTER_Z]}>
          <planeGeometry args={[0.12, LENGTH]} />
          <meshBasicMaterial ref={(m) => m && (edges.current[i] = m)} toneMapped={false} />
        </mesh>
      ))}
      {dashes.map((z) => (
        <mesh key={z} rotation-x={-Math.PI / 2} position={[0, 0.02, z]}>
          <planeGeometry args={[0.1, 2]} />
          <meshBasicMaterial color={new THREE.Color("#fff3c4").multiplyScalar(1.4)} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}
