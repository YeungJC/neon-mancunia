import { Environment, Lightformer } from "@react-three/drei";
import { NEON } from "./layout";

/** Neon light strips baked once into an env map (Lusion's trick) so chrome, road and bee get real reflections. */
export function Lighting() {
  return (
    <Environment resolution={256} frames={1}>
      <color attach="background" args={["#05010b"]} />
      <Lightformer form="rect" intensity={4} color={NEON.magenta} position={[-6, 3, -4]} rotation-y={Math.PI / 2} scale={[12, 0.6, 1]} />
      <Lightformer form="rect" intensity={4} color={NEON.cyan} position={[6, 3, -4]} rotation-y={-Math.PI / 2} scale={[12, 0.6, 1]} />
      <Lightformer form="rect" intensity={3} color={NEON.amber} position={[0, 6, -8]} rotation-x={Math.PI / 2} scale={[8, 2, 1]} />
      <Lightformer form="ring" intensity={2} color="#ffffff" position={[0, 2, 6]} scale={3} />
    </Environment>
  );
}
