import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import { fx, useStore } from "../store";
import { CAMERA_PATH, CHAPTER_LOOK, districtAt, uAtZ, zAtRig } from "./layout";

/** Parks at each chapter; flies between them on a spline with a warp; pointer adds parallax; drops shake it. */
export function CameraRig() {
  const pos = useMemo(() => new THREE.Vector3(), []);
  const ahead = useMemo(() => new THREE.Vector3(), []);
  const look = useMemo(() => new THREE.Vector3(), []);
  const smoothLook = useMemo(() => CHAPTER_LOOK[0].clone(), []);

  useFrame((state, dt) => {
    const u = uAtZ(zAtRig(fx.rigT));
    CAMERA_PATH.getPointAt(u, pos);
    CAMERA_PATH.getPointAt(Math.min(1, u + 0.05), ahead);
    ahead.y = pos.y + 0.2;

    // Parked: frame the chapter. Flying: look down the road.
    const i = Math.min(CHAPTER_LOOK.length - 2, Math.floor(fx.rigT));
    look.lerpVectors(CHAPTER_LOOK[i], CHAPTER_LOOK[i + 1], fx.rigT - i).lerp(ahead, fx.warp);

    const cam = state.camera as THREE.PerspectiveCamera;
    const shake = fx.flash * 0.3 + fx.kick * 0.02;
    pos.x += fx.pointer.x * 0.6 + (Math.random() - 0.5) * shake;
    pos.y += fx.pointer.y * 0.3 + (Math.random() - 0.5) * shake + Math.sin(state.clock.elapsedTime * 0.5) * 0.06;
    cam.position.lerp(pos, 1 - Math.pow(0.002, dt));
    smoothLook.lerp(look, 1 - Math.pow(0.004, dt));
    cam.lookAt(smoothLook);

    const d = districtAt(cam.position.z);
    if (d !== useStore.getState().district) useStore.getState().set({ district: d });

    const fov = 60 + fx.warp * 16 + fx.flash * 10 - fx.charge * 6;
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  });
  return null;
}
