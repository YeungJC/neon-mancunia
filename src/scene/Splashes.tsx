import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { fx } from "../store";
import { NEON } from "./layout";

const POOL = 40;
const LIFE = 0.9;
const COLORS = [NEON.cyan, NEON.magenta, NEON.amber].map((c) => new THREE.Color(c).multiplyScalar(3));

/** Every rain-arpeggio note lands as a neon ripple on the road, panned where you hear it. */
export function Splashes() {
  const camera = useThree((s) => s.camera);
  const group = useRef<THREE.Group>(null!);
  const pool = useMemo(
    () =>
      [...Array(POOL)].map(() => ({
        mat: new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false, depthWrite: false, opacity: 0 }),
        age: LIFE,
      })),
    [],
  );
  const geo = useMemo(() => new THREE.RingGeometry(0.16, 0.22, 48), []);
  const next = useRef(0);

  useFrame((_, dt) => {
    const meshes = group.current.children as THREE.Mesh[];
    while (fx.splashes.length) {
      const s = fx.splashes.shift()!;
      const i = next.current++ % POOL;
      const m = meshes[i];
      m.position.set(s.pan * 9, 0.03, camera.position.z - 9 - Math.random() * 16);
      pool[i].mat.color.copy(COLORS[s.color]);
      pool[i].age = 0;
    }
    pool.forEach((p, i) => {
      p.age = Math.min(LIFE, p.age + dt);
      const t = p.age / LIFE;
      meshes[i].scale.setScalar(1 + t * 9);
      p.mat.opacity = (1 - t) * (1 - t);
    });
  });

  return (
    <group ref={group}>
      {pool.map((p, i) => (
        <mesh key={i} geometry={geo} material={p.mat} rotation-x={-Math.PI / 2} />
      ))}
    </group>
  );
}
