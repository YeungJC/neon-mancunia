import { Text } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { fx } from "../store";
import { FONT } from "./NeonSign";

/** The two layers that take over the whole city. Both fade with fx.theme, so they blend in/out and can stack. */
export function Takeovers() {
  return (
    <>
      <SausageRollRain />
      <GiantSausageRoll />
      <AcidSmileys />
      <PartyPeopleBillboard />
    </>
  );
}

function canvasTexture(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  paint(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const pastry = () =>
  canvasTexture(128, 64, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 64);
    grad.addColorStop(0, "#f2c06b");
    grad.addColorStop(0.5, "#d8902f");
    grad.addColorStop(1, "#a8621c");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 64);
    g.strokeStyle = "rgba(120,60,10,0.55)";
    g.lineWidth = 3;
    for (let x = 14; x < 128; x += 22) {
      // the scored top
      g.beginPath();
      g.moveTo(x, 10);
      g.lineTo(x + 10, 30);
      g.stroke();
    }
    g.fillStyle = "rgba(255,240,200,0.35)";
    for (let i = 0; i < 60; i++) g.fillRect(Math.random() * 128, Math.random() * 64, 3, 1); // flakes
  });

/** GREGGS: it's raining sausage rolls. Instanced, tumbling, recycled around the camera like the rain. */
function SausageRollRain() {
  const COUNT = 140;
  const camera = useThree((s) => s.camera);
  const mesh = useRef<THREE.InstancedMesh>(null!);
  const geo = useMemo(() => new THREE.CapsuleGeometry(0.16, 0.62, 6, 12).rotateZ(Math.PI / 2), []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ map: pastry(), roughness: 0.55, emissive: "#ff9a2a", emissiveIntensity: 0.25 }), []);
  const rolls = useMemo(
    () =>
      [...Array(COUNT)].map(() => ({
        x: (Math.random() - 0.5) * 30,
        y: Math.random() * 22,
        z: -Math.random() * 40,
        speed: 3 + Math.random() * 3,
        spin: new THREE.Vector3(Math.random(), Math.random(), Math.random()).multiplyScalar(3),
        rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
      })),
    [],
  );
  const o = useMemo(() => new THREE.Object3D(), []);

  useFrame((_, dt) => {
    const amount = fx.theme.greggs;
    mesh.current.visible = amount > 0.01;
    if (!mesh.current.visible) return;
    rolls.forEach((r, i) => {
      r.y -= r.speed * dt;
      if (r.y < 0) r.y += 22;
      r.rot.x += r.spin.x * dt;
      r.rot.y += r.spin.y * dt;
      r.rot.z += r.spin.z * dt;
      o.position.set(camera.position.x + r.x, r.y, camera.position.z - 4 + r.z);
      o.rotation.copy(r.rot);
      // grow in with the takeover; only the first N fall at partial amounts
      o.scale.setScalar(i / COUNT < amount ? 1 : 0);
      o.updateMatrix();
      mesh.current.setMatrixAt(i, o.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={mesh} args={[geo, mat, COUNT]} frustumCulled={false} />;
}

/** GREGGS: a colossal glowing sausage roll descends over the street. */
function GiantSausageRoll() {
  const camera = useThree((s) => s.camera);
  const group = useRef<THREE.Group>(null!);
  const tex = useMemo(pastry, []);
  const label = useRef<THREE.MeshBasicMaterial>(null!);

  useFrame((state) => {
    const a = fx.theme.greggs;
    group.current.visible = a > 0.01;
    if (!group.current.visible) return;
    const t = state.clock.elapsedTime;
    group.current.position.set(camera.position.x * 0.5, 30 - a * 18 + Math.sin(t * 0.8) * 0.3, camera.position.z - 26);
    group.current.rotation.set(Math.sin(t * 0.4) * 0.12, t * 0.25, Math.sin(t * 0.6) * 0.06);
    group.current.scale.setScalar(1 + fx.kick * 0.04);
    label.current.color.set("#ffc21a").multiplyScalar(2 + fx.kick * 2);
  });

  return (
    <group ref={group}>
      <mesh rotation-z={Math.PI / 2}>
        <capsuleGeometry args={[1.4, 5.5, 12, 32]} />
        <meshStandardMaterial map={tex} emissive="#ff8a1a" emissiveIntensity={0.55} roughness={0.5} />
      </mesh>
      <mesh rotation-z={Math.PI / 2} scale={1.04}>
        <capsuleGeometry args={[1.4, 5.5, 4, 16]} />
        <meshBasicMaterial color={new THREE.Color("#ffc21a").multiplyScalar(2)} wireframe toneMapped={false} transparent opacity={0.25} />
      </mesh>
      <Text font={FONT} fontSize={0.9} position={[0, -2.6, 0]} anchorX="center" letterSpacing={0.2}>
        GREGGS 2087
        <meshBasicMaterial ref={label} toneMapped={false} />
      </Text>
    </group>
  );
}

const smileyTexture = () =>
  canvasTexture(128, 128, (g) => {
    g.fillStyle = "#ffe600";
    g.beginPath();
    g.arc(64, 64, 60, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#111";
    g.beginPath();
    g.ellipse(44, 48, 8, 14, 0, 0, Math.PI * 2);
    g.ellipse(84, 48, 8, 14, 0, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 8;
    g.lineCap = "round";
    g.strokeStyle = "#111";
    g.beginPath();
    g.arc(64, 66, 34, 0.15 * Math.PI, 0.85 * Math.PI);
    g.stroke();
  });

/** MADCHESTER: acid-house smileys float over the street and bounce on the kick. */
function AcidSmileys() {
  const COUNT = 26;
  const camera = useThree((s) => s.camera);
  const group = useRef<THREE.Group>(null!);
  const mat = useMemo(() => new THREE.SpriteMaterial({ map: smileyTexture(), transparent: true, depthWrite: false, toneMapped: false }), []);
  const spots = useMemo(
    () =>
      [...Array(COUNT)].map((_, i) => ({
        x: (Math.random() - 0.5) * 26,
        y: 5 + Math.random() * 10,
        z: -8 - Math.random() * 34,
        phase: i * 0.7,
        size: 0.8 + Math.random() * 1.1,
      })),
    [],
  );

  useFrame((state) => {
    const a = fx.theme.madchester;
    group.current.visible = a > 0.01;
    if (!group.current.visible) return;
    const t = state.clock.elapsedTime;
    mat.opacity = a;
    mat.color.setScalar(1.2 + fx.kick * 1.2);
    mat.rotation = Math.sin(t * 1.5) * 0.25;
    group.current.children.forEach((sp, i) => {
      const s = spots[i];
      sp.position.set(camera.position.x + s.x + Math.sin(t * 0.6 + s.phase), s.y + Math.sin(t * 2 + s.phase) * 0.4 + fx.kick * 0.5, camera.position.z + s.z);
      sp.scale.setScalar(s.size * a * (1 + fx.kick * 0.25));
    });
  });

  return (
    <group ref={group}>
      {spots.map((_, i) => (
        <sprite key={i} material={mat} />
      ))}
    </group>
  );
}

/** MADCHESTER: Factory's motto as a neon billboard that strikes on over the street. */
function PartyPeopleBillboard() {
  const camera = useThree((s) => s.camera);
  const group = useRef<THREE.Group>(null!);
  const top = useRef<THREE.MeshBasicMaterial>(null!);
  const bottom = useRef<THREE.MeshBasicMaterial>(null!);

  useFrame((state) => {
    const a = fx.theme.madchester;
    group.current.visible = a > 0.01;
    if (!group.current.visible) return;
    const t = state.clock.elapsedTime;
    group.current.position.set(camera.position.x, 10.5, camera.position.z - 24);
    const strike = a < 0.95 ? (Math.random() > 0.5 ? 1 : 0.1) : 1; // stutters on while fading in
    const k = (2 + fx.kick * 2) * strike * a;
    top.current.color.setHSL((t * 0.15) % 1, 1, 0.55).multiplyScalar(k);
    bottom.current.color.set("#ffe600").multiplyScalar(k);
  });

  return (
    <group ref={group}>
      <Text font={FONT} fontSize={1.1} anchorX="center" letterSpacing={0.12}>
        24 HOUR
        <meshBasicMaterial ref={top} toneMapped={false} />
      </Text>
      <Text font={FONT} fontSize={1.3} position-y={-1.4} anchorX="center" letterSpacing={0.12}>
        PARTY PEOPLE
        <meshBasicMaterial ref={bottom} toneMapped={false} />
      </Text>
    </group>
  );
}
