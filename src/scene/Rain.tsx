import { useFrame, useThree } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import { fx } from "../store";

const COUNT = 7000;

const vertex = /* glsl */ `
  attribute vec4 aSeed;   // x, y, z, w = density threshold
  attribute float aEnd;   // 0 = head, 1 = tail
  uniform float uTime;
  uniform float uCamZ;
  uniform float uDensity;
  uniform vec3 uMouse;
  uniform float uWind;
  uniform float uWarp;
  varying float vAlive;
  varying float vEnd;

  void main() {
    float speed = 20.0 + aSeed.w * 10.0;
    vec3 p = vec3(aSeed.x, mod(aSeed.y - uTime * speed, 32.0) - 1.0, 0.0);
    p.z = uCamZ + mod(aSeed.z - uCamZ, 80.0) - 66.0;
    p.y += aEnd * 0.9;
    p.z += aEnd * uWarp * 6.0; // streaks stretch into light-speed lines while flying
    p.x += aEnd * uWind + (p.y * uWind * 0.2);

    // the cursor is an umbrella: rain parts around it
    vec2 d = p.xy - uMouse.xy;
    float dist = length(d);
    float depth = 1.0 - clamp(abs(p.z - uMouse.z) / 9.0, 0.0, 1.0);
    p.xy += normalize(d + 1e-4) * max(0.0, 3.5 - dist) * 0.9 * depth;

    vAlive = step(aSeed.w, uDensity);
    vEnd = aEnd;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const fragment = /* glsl */ `
  uniform float uFlash;
  varying float vAlive;
  varying float vEnd;
  void main() {
    if (vAlive < 0.5) discard;
    vec3 c = mix(vec3(0.55, 0.8, 1.0), vec3(1.0, 0.4, 0.95), uFlash);
    gl_FragColor = vec4(c * (0.9 + uFlash * 2.0), mix(0.16, 0.0, vEnd));
  }
`;

export function Rain() {
  const camera = useThree((s) => s.camera);
  const { geometry, material } = useMemo(() => {
    const seeds = new Float32Array(COUNT * 2 * 4);
    const ends = new Float32Array(COUNT * 2);
    const pos = new Float32Array(COUNT * 2 * 3);
    for (let i = 0; i < COUNT; i++) {
      const s = [Math.random() * 64 - 32, Math.random() * 32, Math.random() * 80, Math.random()];
      for (let e = 0; e < 2; e++) {
        seeds.set(s, (i * 2 + e) * 4);
        ends[i * 2 + e] = e;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 4));
    g.setAttribute("aEnd", new THREE.BufferAttribute(ends, 1));
    const m = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uCamZ: { value: 0 },
        uDensity: { value: 0.6 },
        uMouse: { value: new THREE.Vector3(0, -100, 0) },
        uWind: { value: -0.12 },
        uWarp: { value: 0 },
        uFlash: { value: 0 },
      },
    });
    return { geometry: g, material: m };
  }, []);

  const tmp = useMemo(() => new THREE.Vector3(), []);
  useFrame((state) => {
    const u = material.uniforms;
    u.uTime.value = state.clock.elapsedTime;
    u.uCamZ.value = camera.position.z;
    // Greggs takeover: the rain makes way for sausage rolls
    u.uDensity.value = fx.rain * (0.75 + fx.highs * 0.5) * (1 - fx.theme.greggs * 0.9);
    u.uFlash.value = fx.flash;
    u.uWarp.value = fx.warp;
    // project the pointer 11 units into the scene
    tmp.set(fx.pointer.x, fx.pointer.y, 0.5).unproject(camera).sub(camera.position).normalize();
    u.uMouse.value.copy(camera.position).addScaledVector(tmp, 11);
  });

  return <lineSegments geometry={geometry} material={material} frustumCulled={false} />;
}
