import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { fx } from "../store";
import { FOG_COLOR, FOG_DENSITY, NEON, rng } from "./layout";

const vertex = /* glsl */ `
  attribute float aBin;
  attribute float aReact;
  attribute float aSeed;
  attribute vec3 aColor;
  uniform float uFFT[64];
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec3 vColor;
  varying float vSeed;
  varying float vLevel;
  varying float vTop;
  varying float vDepth;

  void main() {
    float lvl = uFFT[int(aBin)];
    vec3 p = position;
    p.y *= 1.0 + lvl * aReact;
    vec4 world = modelMatrix * instanceMatrix * vec4(p, 1.0);
    vec4 mv = viewMatrix * world;
    vWorld = world.xyz;
    vNormal = normal;
    vColor = aColor;
    vSeed = aSeed;
    vLevel = lvl;
    vTop = position.y;
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const fragment = /* glsl */ `
  uniform float uTime;
  uniform float uEnergy;
  uniform float uFlash;
  uniform float uGreggs;
  uniform float uMadchester;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec3 vColor;
  varying float vSeed;
  varying float vLevel;
  varying float vTop;
  varying float vDepth;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  void main() {
    vec3 col = vec3(0.012, 0.012, 0.028);
    if (abs(vNormal.y) < 0.5) {
      vec2 g = abs(vNormal.x) > 0.5 ? vWorld.zy : vWorld.xy;
      g *= vec2(2.3, 1.8);
      vec2 cell = floor(g);
      vec2 f = fract(g);
      float win = step(0.18, f.x) * step(f.x, 0.72) * step(0.22, f.y) * step(f.y, 0.68);
      float h = hash(cell + vSeed * 31.7);
      float lit = step(0.7 - vLevel * 0.25, h);
      // a few windows flicker like dying tubes
      float flick = h > 0.97 ? step(0.5, fract(uTime * (3.0 + h * 9.0))) : 1.0;
      vec3 tint = mix(vec3(1.0, 0.85, 0.6), vColor, 0.55 + 0.45 * step(0.8, h));
      // takeovers repaint the windows: bakery blue & gold, or acid-house yellow
      tint = mix(tint, h > 0.5 ? vec3(0.11, 0.36, 0.85) : vec3(1.0, 0.76, 0.1), uGreggs);
      tint = mix(tint, vec3(1.0, 0.92, 0.1), uMadchester * step(0.5, fract(h * 7.0 + uTime * 0.5)));
      col += tint * win * lit * flick * (0.16 + vLevel * 1.4 + uFlash * 0.8);
      // neon rim along the roofline
      col += mix(vColor, vec3(1.0, 0.76, 0.1), uGreggs) * smoothstep(0.975, 1.0, vTop) * (1.6 + vLevel * 3.0 + uEnergy);
    } else {
      col += vColor * 0.04;
    }
    float fog = 1.0 - exp(-uFogDensity * uFogDensity * vDepth * vDepth);
    gl_FragColor = vec4(mix(col, uFogColor, fog), 1.0);
  }
`;

type Tower = { x: number; z: number; w: number; d: number; h: number; bin: number; react: number; color: THREE.Color };

function buildTowers(): Tower[] {
  const r = rng(2087);
  const palette = [NEON.magenta, NEON.cyan, NEON.violet, NEON.amber, NEON.cyan, NEON.magenta].map((c) => new THREE.Color(c));
  const towers: Tower[] = [];
  let i = 0;
  for (let z = 30; z > -175; z -= 5.5) {
    for (const side of [-1, 1]) {
      for (let row = 0; row < 4; row++) {
        // leave the Haçienda plaza open at the end of the street
        if (z < -128 && row < 2) continue;
        const front = row === 0;
        towers.push({
          x: side * (9.5 + row * 8 + r() * 3),
          z: z + (r() - 0.5) * 2,
          w: 3 + r() * 3.5,
          d: 3 + r() * 2.5,
          h: front ? 5 + r() * 7 : 14 + row * 10 + r() * 30,
          // front row reads left→right like a spectrum analyser along the street
          bin: front ? 1 + (i++ % 28) : Math.floor(r() * 40),
          react: front ? 1.3 : 0.12,
          color: palette[Math.floor(r() * palette.length)],
        });
      }
    }
  }
  return towers;
}

export function City() {
  const mesh = useRef<THREE.InstancedMesh>(null!);
  const towers = useMemo(buildTowers, []);

  const { geometry, material } = useMemo(() => {
    const g = new THREE.BoxGeometry(1, 1, 1);
    g.translate(0, 0.5, 0); // base at y=0 so towers grow upward
    const n = towers.length;
    const bin = new Float32Array(n), react = new Float32Array(n), seed = new Float32Array(n), color = new Float32Array(n * 3);
    towers.forEach((t, i) => {
      bin[i] = t.bin;
      react[i] = t.react;
      seed[i] = i * 0.618;
      t.color.toArray(color, i * 3);
    });
    g.setAttribute("aBin", new THREE.InstancedBufferAttribute(bin, 1));
    g.setAttribute("aReact", new THREE.InstancedBufferAttribute(react, 1));
    g.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seed, 1));
    g.setAttribute("aColor", new THREE.InstancedBufferAttribute(color, 3));
    const m = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms: {
        uFFT: { value: fx.fft },
        uTime: { value: 0 },
        uEnergy: { value: 0 },
        uFlash: { value: 0 },
        uGreggs: { value: 0 },
        uMadchester: { value: 0 },
        uFogColor: { value: FOG_COLOR },
        uFogDensity: { value: FOG_DENSITY },
      },
    });
    return { geometry: g, material: m };
  }, [towers]);

  // Matrices are static; only uniforms change per frame.
  const setup = (im: THREE.InstancedMesh | null) => {
    if (!im) return;
    mesh.current = im;
    const o = new THREE.Object3D();
    towers.forEach((t, i) => {
      o.position.set(t.x, 0, t.z);
      o.scale.set(t.w, t.h, t.d);
      o.updateMatrix();
      im.setMatrixAt(i, o.matrix);
    });
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
  };

  useFrame((state) => {
    const u = material.uniforms;
    u.uTime.value = state.clock.elapsedTime;
    u.uEnergy.value = fx.energy;
    u.uFlash.value = fx.flash;
    u.uGreggs.value = fx.theme.greggs;
    u.uMadchester.value = fx.theme.madchester;
  });

  return <instancedMesh ref={setup} args={[geometry, material, towers.length]} frustumCulled={false} />;
}
