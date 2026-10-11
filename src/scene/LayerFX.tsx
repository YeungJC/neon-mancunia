import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { fx, LAYERS } from "../store";

const BASS_COLOR = new THREE.Color(LAYERS.find((l) => l.id === "bass")!.color);
const LEAD_COLOR = new THREE.Color(LAYERS.find((l) => l.id === "lead")!.color);

/** Each melodic layer owns a piece of the city: bass shakes the ground, the lead writes in the sky. */
export function LayerFX() {
  return (
    <>
      <BassShockwaves />
      <SkyPianoRoll />
    </>
  );
}

/** Every audible bass note: a ring of light races out across the wet road from under the camera. */
function BassShockwaves() {
  const camera = useThree((s) => s.camera);
  const POOL = 10;
  const LIFE = 0.8;
  const geo = useMemo(() => new THREE.RingGeometry(0.92, 1, 96), []);
  const items = useMemo(
    () =>
      [...Array(POOL)].map(() => ({
        mat: new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false, depthWrite: false, opacity: 0, side: THREE.DoubleSide }),
        age: LIFE,
        strength: 1,
      })),
    [],
  );
  const group = useRef<THREE.Group>(null!);
  const next = useRef(0);

  useFrame((_, dt) => {
    const meshes = group.current.children as THREE.Mesh[];
    while (fx.bassHits.length) {
      const midi = fx.bassHits.shift()!;
      const i = next.current++ % POOL;
      items[i].age = 0;
      items[i].strength = midi > 45 ? 0.7 : 1; // octave-up notes ripple smaller
      meshes[i].position.set(camera.position.x, 0.04, camera.position.z - 6);
    }
    items.forEach((it, i) => {
      it.age = Math.min(LIFE, it.age + dt);
      const t = it.age / LIFE;
      meshes[i].scale.setScalar((2 + t * 26) * it.strength);
      it.mat.color.copy(BASS_COLOR).multiplyScalar(3.5 * (1 - t));
      it.mat.opacity = 1 - t;
    });
  });

  return (
    <group ref={group}>
      {items.map((it, i) => (
        <mesh key={i} geometry={geo} material={it.mat} rotation-x={-Math.PI / 2} />
      ))}
    </group>
  );
}

/** Every audible lead note: a neon dash in the sky, higher for higher notes, drifting off down the street. */
function SkyPianoRoll() {
  const camera = useThree((s) => s.camera);
  const POOL = 48;
  const LIFE = 3.2;
  const geo = useMemo(() => new THREE.BoxGeometry(1.4, 0.07, 0.07), []);
  const items = useMemo(
    () =>
      [...Array(POOL)].map(() => ({
        mat: new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false, depthWrite: false, opacity: 0 }),
        age: LIFE,
      })),
    [],
  );
  const group = useRef<THREE.Group>(null!);
  const next = useRef(0);
  const lane = useRef(0);

  useFrame((_, dt) => {
    const meshes = group.current.children as THREE.Mesh[];
    while (fx.leadNotes.length) {
      const midi = fx.leadNotes.shift()!;
      const i = next.current++ % POOL;
      items[i].age = 0;
      // pitch → height (roughly D4..D6 → 6..14 units), notes march left→right like a piano roll
      const y = 6 + (midi - 62) * 0.32;
      const x = ((lane.current++ % 9) - 4) * 1.6;
      meshes[i].position.set(camera.position.x + x, y, camera.position.z - 18);
    }
    items.forEach((it, i) => {
      it.age = Math.min(LIFE, it.age + dt);
      const t = it.age / LIFE;
      meshes[i].position.z -= dt * 9; // drift away down the street
      meshes[i].scale.set(1 + t * 0.6, 1, 1);
      it.mat.color.copy(LEAD_COLOR).multiplyScalar(4 * (1 - t) * (1 - t));
      it.mat.opacity = 1 - t;
    });
  });

  return (
    <group ref={group}>
      {items.map((it, i) => (
        <mesh key={i} geometry={geo} material={it.mat} />
      ))}
    </group>
  );
}
