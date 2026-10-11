import { Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { fx, useStore } from "../store";
import { DISTRICT_Z, NEON } from "./layout";
import { FONT, NeonSign } from "./NeonSign";

const L = -5.2; // left pavement
const R = 5.2; // right pavement
const TILT = 0.55; // signs angle toward the approaching camera

export function Districts() {
  return (
    <>
      <Piccadilly />
      <NorthernQuarter />
      <Hacienda />
      <Tram />
      <pointLight position={[0, 7, DISTRICT_Z[0]]} color={NEON.magenta} intensity={45} distance={60} decay={1.2} />
      <pointLight position={[0, 7, DISTRICT_Z[1]]} color={NEON.cyan} intensity={45} distance={60} decay={1.2} />
      <pointLight position={[0, 9, DISTRICT_Z[2] - 10]} color={NEON.amber} intensity={60} distance={70} decay={1.2} />
      <hemisphereLight args={["#3a2a6a", "#000000", 0.35]} />
    </>
  );
}

function Piccadilly() {
  return (
    <group>
      <NeonSign text="PICCADILLY" color={NEON.magenta} position={[L, 4.6, -4]} rotationY={TILT} size={0.85} />
      <NeonSign text="RAIN // ALWAYS" color={NEON.cyan} position={[R, 5.4, -16]} rotationY={-TILT} size={0.55} />
      <NeonSign text="MANCHESTER 2087" color={NEON.violet} position={[0, 12, -34]} size={1.5} />
    </group>
  );
}

/** All five layer signs frame the street in front of the chapter-2 camera stop (z = -50). */
function NorthernQuarter() {
  return (
    <group>
      <NeonSign text="DRUMS" layer="drums" sub="BREAKBEAT" color={NEON.magenta} position={[L, 3.3, -58]} rotationY={TILT} size={0.75} />
      <NeonSign text="BASS" layer="bass" sub="SUB" color={NEON.cyan} position={[R, 3.3, -58]} rotationY={-TILT} size={0.75} />
      <NeonSign text="LEAD" layer="lead" sub="SYNTH" color={NEON.lime} position={[L + 0.6, 5.5, -64]} rotationY={TILT * 0.7} size={0.75} />
      <NeonSign text="GREGGS" layer="greggs" sub="SAUSAGE ROLL" color={NEON.blue} position={[R - 0.6, 5.5, -64]} rotationY={-TILT * 0.7} size={0.68} />
      <NeonSign text="MADCHESTER" layer="madchester" sub="BAGGY" color={NEON.amber} position={[0, 6.6, -70]} size={0.72} />
      <NeonSign text="AFFLECKS" color={NEON.violet} position={[R + 0.6, 9.4, -92]} rotationY={-TILT} size={0.45} />
    </group>
  );
}

function hazardTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = "#111";
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = "#ffc400";
  for (let i = -64; i < 128; i += 32) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + 16, 0);
    g.lineTo(i + 16 + 64, 64);
    g.lineTo(i + 64, 64);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 6);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** FAC 51: Ben Kelly's hazard-striped pillars, reborn in neon. */
function Hacienda() {
  const Z = -162;
  const hazard = useMemo(hazardTexture, []);
  return (
    <group>
      <mesh position={[0, 9, Z]}>
        <boxGeometry args={[34, 18, 4]} />
        <meshStandardMaterial color="#0c0b12" roughness={0.6} metalness={0.4} />
      </mesh>
      <mesh position={[0, 2.6, Z + 2.05]}>
        <planeGeometry args={[5, 5.2]} />
        <meshBasicMaterial color={new THREE.Color(NEON.amber).multiplyScalar(1.6)} toneMapped={false} />
      </mesh>
      {[-11, -6.5, 6.5, 11].map((x) => (
        <mesh key={x} position={[x, 4, Z + 5]}>
          <cylinderGeometry args={[0.55, 0.55, 8, 24]} />
          <meshStandardMaterial map={hazard} emissiveMap={hazard} emissive="#ffffff" emissiveIntensity={0.35} roughness={0.5} />
        </mesh>
      ))}
      <NeonSign text="FAC 51" color={NEON.amber} position={[0, 13.6, Z + 2.1]} size={1.3} />
      <NeonSign text="THE HAÇIENDA" color={NEON.magenta} position={[0, 10.4, Z + 2.1]} size={1.9} />
      <HoldSpace position={[0, 6.2, Z + 2.1]} />
      <Lasers origin={[0, 16, Z + 2]} />
    </group>
  );
}

function HoldSpace({ position }: { position: [number, number, number] }) {
  const mat = useRef<THREE.MeshBasicMaterial>(null!);
  const c = useMemo(() => new THREE.Color(NEON.cyan), []);
  useFrame((s) => {
    const charging = fx.charge > 0.02;
    const blink = charging ? 1 + fx.charge * 4 : Math.sin(s.clock.elapsedTime * 4) > 0 ? 2 : 0.4;
    mat.current.color.copy(c).multiplyScalar(blink);
  });
  return (
    <Text font={FONT} fontSize={0.55} position={position} letterSpacing={0.25} anchorX="center">
      HOLD SPACE TO DROP
      <meshBasicMaterial ref={mat} toneMapped={false} />
    </Text>
  );
}

function Lasers({ origin }: { origin: [number, number, number] }) {
  const group = useRef<THREE.Group>(null!);
  const beams = useMemo(() => {
    const geo = new THREE.CylinderGeometry(0.035, 0.035, 90, 6, 1, true);
    geo.translate(0, -45, 0);
    const colors = [NEON.magenta, NEON.cyan, NEON.lime, NEON.amber];
    return [...Array(10)].map((_, i) => ({
      geo,
      mat: new THREE.MeshBasicMaterial({
        color: colors[i % colors.length],
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
      phase: i * 0.63,
    }));
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const inClub = state.camera.position.z < -95;
    const level = inClub ? 0.15 + fx.kick * 0.9 + fx.flash * 2 + fx.charge * 0.6 : 0;
    group.current.visible = level > 0.01;
    group.current.children.forEach((m, i) => {
      const b = beams[i];
      m.rotation.set(-1.1 + Math.sin(t * 0.7 + b.phase) * 0.45, 0, Math.sin(t * (0.9 + fx.charge * 3) + b.phase * 2) * 0.9);
      b.mat.color.set([NEON.magenta, NEON.cyan, NEON.lime, NEON.amber][i % 4]).multiplyScalar(level * 2);
      b.mat.opacity = Math.min(1, level);
    });
  });

  return (
    <group ref={group} position={origin}>
      {beams.map((b, i) => (
        <mesh key={i} geometry={b.geo} material={b.mat} />
      ))}
    </group>
  );
}

/** The 2087 tram still runs late. */
function Tram() {
  const group = useRef<THREE.Group>(null!);
  const live = useStore((st) => st.phase !== "intro");
  const t0 = useRef(-1);
  useFrame((s) => {
    // not during the landing hero: it would drive straight through the title shot
    group.current.visible = live;
    if (!live) return;
    if (t0.current < 0) t0.current = s.clock.elapsedTime + 6;
    group.current.position.z = 40 - ((Math.max(0, s.clock.elapsedTime - t0.current) * 9) % 230);
  });
  return (
    <group ref={group} position={[4.4, 0, 0]}>
      <mesh position={[0, 1.6, 0]}>
        <boxGeometry args={[2.5, 2.8, 15]} />
        <meshStandardMaterial color="#d8d4c8" metalness={0.7} roughness={0.35} />
      </mesh>
      <mesh position={[0, 2, 0]}>
        <boxGeometry args={[2.56, 0.8, 14]} />
        <meshBasicMaterial color={new THREE.Color("#ffe9a8").multiplyScalar(1.6)} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.25, 0]}>
        <boxGeometry args={[2.56, 0.12, 15]} />
        <meshBasicMaterial color={new THREE.Color(NEON.amber).multiplyScalar(2.5)} toneMapped={false} />
      </mesh>
      {[-0.8, 0.8].map((x) => (
        <mesh key={x} position={[x, 0.8, -7.55]}>
          <circleGeometry args={[0.18, 16]} />
          <meshBasicMaterial color={new THREE.Color("#ffffff").multiplyScalar(4)} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}
