import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { fx, useStore } from "../store";
import { NEON } from "./layout";

function stripes() {
  const c = document.createElement("canvas");
  c.width = 8;
  c.height = 64;
  const g = c.getContext("2d")!;
  for (let i = 0; i < 4; i++) {
    g.fillStyle = i % 2 ? "#0a0a0a" : "#ffc400";
    g.fillRect(0, i * 16, 8, 16);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** BEE-9: Manchester's worker bee, upgraded. Rides along bottom-right of frame and lights up to talk. */
export function Bee() {
  const camera = useThree((s) => s.camera);
  const group = useRef<THREE.Group>(null!);
  const wingL = useRef<THREE.Mesh>(null!);
  const wingR = useRef<THREE.Mesh>(null!);
  const eye = useRef<THREE.MeshBasicMaterial>(null!);
  const halo = useRef<THREE.Mesh>(null!);
  const tex = useMemo(stripes, []);
  const offset = useMemo(() => new THREE.Vector3(), []);
  const target = useMemo(() => new THREE.Vector3(), []);
  const eyeColor = useMemo(() => new THREE.Color(NEON.cyan), []);
  const face = useMemo(() => new THREE.Quaternion(), []);
  const turn = useMemo(() => new THREE.Euler(), []);
  const turnQ = useMemo(() => new THREE.Quaternion(), []);

  const live = useStore((s) => s.phase !== "intro");

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    // BEE-9 arrives after PLUG IN, swooping in from off-screen
    group.current.visible = live;
    if (!live) {
      group.current.position.set(6, 6, 6);
      return;
    }
    offset.set(1.25 + Math.sin(t * 0.7) * 0.08, -0.6 + Math.sin(t * 2.1) * 0.06, -3.6);
    target.copy(offset).applyMatrix4(camera.matrixWorld);
    group.current.position.lerp(target, 1 - Math.pow(0.0001, dt));
    // Face the viewer (camera rotation + a fixed half-turn), with a gentle sway. Built fresh each
    // frame and eased toward, so it never accumulates into a spin.
    turn.set(Math.sin(t * 0.9) * 0.06, Math.PI + 0.5 + Math.sin(t * 0.6) * 0.12, Math.sin(t * 1.3) * 0.06);
    face.copy(camera.quaternion).multiply(turnQ.setFromEuler(turn));
    group.current.quaternion.slerp(face, 1 - Math.pow(0.02, dt));

    // Soft hover flutter rather than a strobing flap
    const flap = Math.sin(t * 16) * 0.22;
    wingL.current.rotation.z = 0.45 + flap;
    wingR.current.rotation.z = -0.45 - flap;

    const talk = fx.speaking ? 2.2 + Math.abs(Math.sin(t * 9)) * 1.6 + fx.mids * 2 : 1.4 + fx.kick * 0.5;
    eye.current.color.copy(eyeColor).multiplyScalar(talk);
    halo.current.visible = fx.speaking > 0;
    halo.current.rotation.z += dt * 0.4;
    halo.current.scale.setScalar(1 + Math.sin(t * 3) * 0.04);
  });

  return (
    <group ref={group} scale={0.38}>
      <mesh rotation-x={Math.PI / 2}>
        <capsuleGeometry args={[0.32, 0.5, 8, 24]} />
        <meshStandardMaterial map={tex} emissiveMap={tex} emissive="#ffffff" emissiveIntensity={0.5} metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.06, -0.55]}>
        <sphereGeometry args={[0.24, 24, 16]} />
        <meshStandardMaterial color="#111018" metalness={0.9} roughness={0.2} />
      </mesh>
      <mesh position={[0, 0.1, -0.76]}>
        <planeGeometry args={[0.3, 0.08]} />
        <meshBasicMaterial ref={eye} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.1, 0.32, -0.62]} rotation-z={-s * 0.4}>
          <cylinderGeometry args={[0.012, 0.012, 0.3]} />
          <meshBasicMaterial color={new THREE.Color(NEON.magenta).multiplyScalar(3)} toneMapped={false} />
        </mesh>
      ))}
      <mesh ref={wingL} position={[-0.18, 0.3, -0.05]}>
        <planeGeometry args={[0.7, 0.3]} />
        <meshBasicMaterial color={new THREE.Color(NEON.cyan).multiplyScalar(1.5)} transparent opacity={0.35} side={THREE.DoubleSide} toneMapped={false} depthWrite={false} />
      </mesh>
      <mesh ref={wingR} position={[0.18, 0.3, -0.05]}>
        <planeGeometry args={[0.7, 0.3]} />
        <meshBasicMaterial color={new THREE.Color(NEON.cyan).multiplyScalar(1.5)} transparent opacity={0.35} side={THREE.DoubleSide} toneMapped={false} depthWrite={false} />
      </mesh>
      <mesh ref={halo} rotation-x={0}>
        <torusGeometry args={[0.9, 0.012, 8, 64]} />
        <meshBasicMaterial color={new THREE.Color(NEON.cyan).multiplyScalar(3)} toneMapped={false} />
      </mesh>
      <pointLight color={NEON.amber} intensity={2} distance={3} />
    </group>
  );
}
