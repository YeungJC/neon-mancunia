import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { fx } from "../store";
import { NEON } from "./layout";

const ZS = [...Array(15)].map((_, i) => 20 - i * 10.5);
const COLORS = [NEON.magenta, NEON.cyan].map((c) => new THREE.Color(c));

/**
 * Neon arches over the street (after troisjs' instanced torus tunnel).
 * Every kick fires a pulse of light that races away from the camera down the arches.
 */
export function Arches() {
  const mesh = useRef<THREE.InstancedMesh>(null!);
  const pulse = useRef({ born: -10, last: 0 });
  const tmp = useMemo(() => new THREE.Color(), []);
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
    ZS.forEach((z, i) => {
      const d = (z - front) / 7;
      const k = 0.22 + Math.exp(-d * d) * 2.6 + fx.flash * 2.5 + fx.charge * 0.8 + fx.warp * 1.2;
      mesh.current.setColorAt(i, tmp.copy(COLORS[i % 2]).multiplyScalar(k));
    });
    mesh.current.instanceColor!.needsUpdate = true;
  });

  return (
    <instancedMesh ref={setup} args={[geometry, undefined, ZS.length]} frustumCulled={false}>
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}
