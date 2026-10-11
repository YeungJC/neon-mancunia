import { Text } from "@react-three/drei";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { toggleLayer } from "../audio/engine";
import { poke } from "../lib/dj";
import { fx, useStore, type LayerId } from "../store";

export const FONT = "/fonts/orbitron-900.woff";

type Props = {
  text: string;
  color: string;
  position: [number, number, number];
  rotationY?: number;
  size?: number;
  /** Clickable signs drive a music layer; the rest are scenery. */
  layer?: LayerId;
  sub?: string;
};

export function NeonSign({ text, color, position, rotationY = 0, size = 1, layer, sub }: Props) {
  const on = useStore((s) => (layer ? s.layers[layer] : true));
  const pending = useStore((s) => (layer ? s.pending[layer] : undefined));
  const mat = useRef<THREE.MeshBasicMaterial>(null!);
  const group = useRef<THREE.Group>(null!);
  const base = useMemo(() => new THREE.Color(color), [color]);
  const [hover, setHover] = useState(false);
  const seed = useMemo(() => Math.random() * 100, []);
  const ring = useRef<THREE.Mesh>(null);
  const ringMat = useRef<THREE.MeshBasicMaterial>(null);
  const burst = useRef(-10);
  const targetScale = useMemo(() => new THREE.Vector3(), []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    let k: number;
    if (pending !== undefined) {
      // a tube striking: rapid stutter until the next bar lands
      k = Math.sin(t * 60 + seed) > 0.2 ? 2.6 : 0.15;
    } else if (on) {
      const buzz = Math.sin(t * 90 + seed) * 0.08 + (Math.random() > 0.995 ? -1.2 : 0);
      k = 2.2 + fx.kick * 1.4 + fx.flash * 3 + buzz;
    } else {
      k = 0.12; // dead tube, still faintly coloured
    }
    if (hover) k += 0.8;
    mat.current.color.copy(base).multiplyScalar(Math.max(0.05, k));
    const target = hover ? 1.08 : 1;
    group.current.scale.lerp(targetScale.setScalar(target), 0.15);

    // click shockwave
    if (burst.current === -1) burst.current = t;
    if (ring.current && ringMat.current) {
      const age = t - burst.current;
      ring.current.visible = age < 0.7;
      if (ring.current.visible) {
        ring.current.scale.setScalar(1 + age * 7);
        ringMat.current.color.copy(base).multiplyScalar(3 * (1 - age / 0.7));
      }
    }
  });

  const interactive = layer
    ? {
        onPointerOver: (e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          setHover(true);
          fx.pointerOnSign = true;
          fx.hoverLabel = `${useStore.getState().layers[layer] ? "TURN OFF" : "TURN ON"} ${text}`;
        },
        onPointerOut: () => {
          setHover(false);
          fx.pointerOnSign = false;
          fx.hoverLabel = "";
        },
        onClick: (e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          burst.current = -1; // start the shockwave on the next frame
          toggleLayer(layer);
          fx.hoverLabel = `${useStore.getState().pending[layer] ? "TURN OFF" : "TURN ON"} ${text}`;
          poke();
        },
      }
    : {};

  return (
    <group position={position} rotation-y={rotationY} ref={group}>
      <Text
        font={FONT}
        fontSize={size}
        letterSpacing={0.06}
        anchorX="center"
        anchorY="middle"
        outlineWidth={size * 0.04}
        outlineBlur={size * 0.35}
        outlineColor={color}
        outlineOpacity={on ? 0.45 : 0.05}
      >
        {text}
        <meshBasicMaterial ref={mat} toneMapped={false} />
      </Text>
      {sub && (
        <Text font={FONT} fontSize={size * 0.22} position={[0, -size * 0.85, 0]} color="#8a86a8" anchorX="center" letterSpacing={0.3}>
          {on ? `● ${sub} ON` : `○ ${sub} — CLICK`}
        </Text>
      )}
      {layer && (
        <mesh ref={ring} visible={false} position-z={-0.05}>
          <ringGeometry args={[size * 0.9, size * 0.96, 64]} />
          <meshBasicMaterial ref={ringMat} transparent toneMapped={false} depthWrite={false} />
        </mesh>
      )}
      {layer && (
        // generous invisible hit area so small signs are easy to click
        <mesh position-z={0.05} {...interactive}>
          <planeGeometry args={[text.length * size * 0.85, size * 2]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}
