import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { fx } from "../store";
import { NEON } from "./layout";

const ZS = [...Array(15)].map((_, i) => 20 - i * 10.5);
const COLORS = [NEON.magenta, NEON.cyan].map((c) => new THREE.Color(c));
// Greggs takeover: bakery blue & gold
const GREGGS = ["#1d5bd8", "#ffc21a"].map((c) => new THREE.Color(c));

/**
 * Neon arches over the street (after troisjs' instanced torus tunnel).
 * Every kick fires a pulse of light that races away from the camera down the arches.
 */
export function Arches() {
  const mesh = useRef<THREE.InstancedMesh>(null!);
  const pulse = useRef({ born: -10, last: 0 });
  const tmp = useMemo(() => new THREE.Color(), []);
  const rainbow = useMemo(() => new THREE.Color(), []);
  const geometry = useMemo(() => new THREE.TorusGeometry(8.6, 0.045, 6, 72, Math.PI), []);

  const setup = (im: THREE.InstancedMesh | null) => {
    if (!im) return;
    mesh.current = im;
    const o = new THREE.Object3D();
    ZS.forEach((z, i) => {
      o.position.set(0, 0, z);
      o.updateMatrix();
      im.setMatrixAt(i, o.matrix);
      im.setColorAt(i, COLORS[i % 2]);
    });
    im.instanceMatrix.needsUpdate = true;
  };

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (fx.kick > 0.9 && pulse.current.last <= 0.9) pulse.current.born = t;
    pulse.current.last = fx.kick;
    const front = state.camera.position.z - (t - pulse.current.born) * 70;
    const drums = fx.levels.drums > 0.05 ? 1 : 0;
    ZS.forEach((z, i) => {
      const d = (z - front) / 7;
      // dim and still without drums; racing pulses with them
      // after a drop: the arches strobe on alternate eighths for the whole 8 bars
      const strobe = fx.dropping > 0.05 ? ((Math.floor(t * 8) + i) % 2) * 2.5 * fx.dropping : 0;
      const k = 0.18 + drums * (0.15 + Math.exp(-d * d) * 3) + fx.flash * 2.5 + fx.charge * 1.5 + fx.warp * 1.2 + strobe;
      tmp.copy(COLORS[i % 2]).lerp(GREGGS[i % 2], fx.theme.greggs);
      // Madchester: arches cycle the rainbow
      if (fx.theme.madchester > 0.01) tmp.lerp(rainbow.setHSL((t * 0.25 + i * 0.07) % 1, 1, 0.55), fx.theme.madchester);
      mesh.current.setColorAt(i, tmp.multiplyScalar(k));
    });
    mesh.current.instanceColor!.needsUpdate = true;
  });

  return (
    <instancedMesh ref={setup} args={[geometry, undefined, ZS.length]} frustumCulled={false}>
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}
