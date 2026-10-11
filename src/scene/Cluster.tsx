import { useFrame, useThree } from "@react-three/fiber";
import { BallCollider, CuboidCollider, Physics, RigidBody, type RapierRigidBody } from "@react-three/rapier";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import * as THREE from "three";
import { fx, useStore } from "../store";
import { NEON } from "./layout";

/**
 * A homage to Lusion's "connectors": chrome crosses floating in zero-g.
 * Pulled to their centre, shoved by your cursor, blown apart by every kick, recoloured on click.
 * It stars in the landing hero, then blows apart on PLUG IN.
 */
const ACCENTS = [NEON.magenta, NEON.cyan, NEON.amber, NEON.lime];

const palette = (accent: number) => [
  { color: "#1c1a24", roughness: 0.15 },
  { color: "#1c1a24", roughness: 0.6 },
  { color: "#1c1a24", roughness: 0.6 },
  { color: "#e8e6f0", roughness: 0.12 },
  { color: "#e8e6f0", roughness: 0.6 },
  { color: "#e8e6f0", roughness: 0.12 },
  { color: ACCENTS[accent], roughness: 0.12, accent: true },
  { color: ACCENTS[accent], roughness: 0.6, accent: true },
  { color: ACCENTS[accent], roughness: 0.12, accent: true },
  { color: "#1c1a24", roughness: 0.15 },
  { color: "#e8e6f0", roughness: 0.3 },
  { color: ACCENTS[accent], roughness: 0.3, accent: true },
];

/** Lives on the landing hero only; once it has exploded away after PLUG IN, the physics world unmounts. */
export function Clusters() {
  const phase = useStore((s) => s.phase);
  // The hero cluster stays mounted a moment after PLUG IN so it can explode away.
  const [hero, setHero] = useState(true);
  useEffect(() => {
    if (phase === "intro") return setHero(true);
    const id = setTimeout(() => setHero(false), 1800);
    return () => clearTimeout(id);
  }, [phase]);

  if (!hero) return null;
  return (
    <Physics gravity={[0, 0, 0]} timeStep="vary">
      <HeroCluster leaving={phase !== "intro"} />
    </Physics>
  );
}

/** Sits on the right of the landing hero; its x follows the screen edge so it frames nicely at any aspect. */
function HeroCluster({ leaving }: { leaving: boolean }) {
  const { camera, viewport } = useThree();
  const center = useMemo(() => new THREE.Vector3(2.8, 3.6, 7.5), []);
  useFrame(() => {
    const vp = viewport.getCurrentViewport(camera, center);
    center.x = vp.aspect < 1 ? 0 : vp.width * 0.24;
    center.y = vp.aspect < 1 ? 2.2 : 3.6;
  });
  return <Cluster center={center} scale={0.42} leaving={leaving} />;
}

function Cluster({ center, scale, leaving = false }: { center: THREE.Vector3; scale: number; leaving?: boolean }) {
  const [accent, cycle] = useReducer((a: number) => (a + 1) % ACCENTS.length, 0);
  const pieces = useMemo(() => palette(accent), [accent]);
  const arm = useMemo(() => new THREE.BoxGeometry(0.76 * scale, 2.54 * scale, 0.76 * scale), [scale]);

  return (
    <>
      <Pointer center={center} />
      <group
        onClick={(e) => {
          e.stopPropagation();
          cycle();
        }}
        onPointerOver={() => {
          fx.pointerOnSign = true;
          fx.hoverLabel = "SHOVE ME · CLICK TO RECOLOUR";
        }}
        onPointerOut={() => {
          fx.pointerOnSign = false;
          fx.hoverLabel = "";
        }}
      >
        {pieces.map((p, i) => (
          <Connector key={i} index={i} center={center} scale={scale} arm={arm} leaving={leaving} {...p} />
        ))}
      </group>
    </>
  );
}

type ConnectorProps = {
  index: number;
  center: THREE.Vector3;
  scale: number;
  arm: THREE.BoxGeometry;
  leaving: boolean;
  color: string;
  roughness: number;
  accent?: boolean;
};

function Connector({ index, center, scale, arm, leaving, color, roughness, accent }: ConnectorProps) {
  const api = useRef<RapierRigidBody>(null);
  const vec = useMemo(() => new THREE.Vector3(), []);
  const lastKick = useRef(0);
  const exploded = useRef(false);
  const start = useMemo(() => {
    const r = () => (Math.random() - 0.5) * 4;
    return [center.x + r(), center.y + r() * 0.6, center.z + r() * 0.5] as [number, number, number];
  }, []);

  useFrame(() => {
    const body = api.current;
    if (!body) return;
    const p = body.translation();
    if (leaving) {
      // PLUG IN: one big blast outward, then let them fly
      if (!exploded.current) {
        exploded.current = true;
        vec.set(p.x - center.x, p.y - center.y, p.z - center.z + 0.5).normalize().multiplyScalar(4 + Math.random() * 3);
        body.applyImpulse(vec, true);
        body.applyTorqueImpulse({ x: Math.random() * 0.3, y: Math.random() * 0.3, z: Math.random() * 0.3 }, true);
      }
      return;
    }
    // pull home
    body.applyImpulse(vec.set(center.x - p.x, center.y - p.y, center.z - p.z).multiplyScalar(0.06), true);
    // every audible kick drum: burst outward, a little different each time
    if (fx.kick > 0.9 && lastKick.current <= 0.9) {
      vec.set(p.x - center.x, p.y - center.y, p.z - center.z).normalize().multiplyScalar(0.35 + fx.bass * 0.4 + fx.flash * 1.5);
      vec.x += Math.sin(index * 12.9) * 0.1;
      body.applyImpulse(vec, true);
      body.applyTorqueImpulse({ x: 0.01 * Math.sin(index), y: 0.01, z: 0.01 * Math.cos(index) }, true);
    }
    lastKick.current = fx.kick;
  });

  return (
    <RigidBody ref={api} position={start} linearDamping={leaving ? 0.5 : 3} angularDamping={1} friction={0.1} colliders={false}>
      <CuboidCollider args={[0.38 * scale, 1.27 * scale, 0.38 * scale]} />
      <CuboidCollider args={[1.27 * scale, 0.38 * scale, 0.38 * scale]} />
      <CuboidCollider args={[0.38 * scale, 0.38 * scale, 1.27 * scale]} />
      <Cross arm={arm} color={color} roughness={roughness} />
      {accent && <pointLight intensity={3} distance={2} color={color} />}
    </RigidBody>
  );
}

function Cross({ arm, color, roughness }: { arm: THREE.BoxGeometry; color: string; roughness: number }) {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ metalness: 0.85, envMapIntensity: 1.6 }), []);
  mat.color.set(color);
  mat.roughness = roughness;
  return (
    <group>
      <mesh geometry={arm} material={mat} />
      <mesh geometry={arm} material={mat} rotation-z={Math.PI / 2} />
      <mesh geometry={arm} material={mat} rotation-x={Math.PI / 2} />
    </group>
  );
}

/** The cursor is a kinematic ball on its cluster's plane. */
function Pointer({ center }: { center: THREE.Vector3 }) {
  const ref = useRef<RapierRigidBody>(null);
  const dir = useMemo(() => new THREE.Vector3(), []);
  const hit = useMemo(() => new THREE.Vector3(0, -50, 0), []);
  useFrame(({ camera }) => {
    dir.set(fx.pointer.x, fx.pointer.y, 0.5).unproject(camera).sub(camera.position).normalize();
    const t = (center.z - camera.position.z) / dir.z;
    if (t > 0) hit.copy(camera.position).addScaledVector(dir, t);
    else hit.set(0, -50, 0);
    ref.current?.setNextKinematicTranslation(hit);
  });
  return (
    <RigidBody ref={ref} type="kinematicPosition" colliders={false} position={[0, -50, 0]}>
      <BallCollider args={[0.7]} />
    </RigidBody>
  );
}
