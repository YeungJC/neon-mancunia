import { Html, Text } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import * as Tone from 'tone';
import { playRain, rainEvents } from '../audio/rainInstrument';
import { RAIN_COLORS, RAIN_KEYS } from '../audio/rainPattern';
import { useStore } from '../store';
import { poke } from '../lib/dj';
import { FONT } from './NeonSign';

/** Each key plays this tone of whatever chord is sounding (root, 3rd, 5th, 7th, octave). */
const NUMERALS = ['1', '3', '5', '7', '8'];
const RIPPLES = 4; // concurrent ripple rings per puddle
const SPLASH = 8; // droplets thrown up per impact
/** Letter centre height: laid back ~70°, its lower edge just clears the water. */
const LETTER_Y = 0.1;
/** Small nudge toward the camera so the letter's projected centre meets the circle's centre. */
const LETTER_Z = 0.45;

/** Five generous hit surfaces. Audio events position both the falling bead and its impact. */
export function RainGarden() {
  const phase = useStore(s => s.phase);
  const group = useRef<THREE.Group>(null!);
  const lastLane = useRef(-1);
  useFrame(({ camera }) => {
    group.current.position.set(camera.position.x, 0.075, camera.position.z - 19);
    const perspective = camera as THREE.PerspectiveCamera;
    group.current.scale.x = Math.min(1, 2 * 19 * Math.tan(THREE.MathUtils.degToRad(perspective.fov / 2)) * perspective.aspect / 16);
  });
  const strike = (i: number, e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (lastLane.current !== i) playRain(i);
    lastLane.current = i;
    poke();
  };
  const live = phase === 'live';
  return <group ref={group} visible={live}>
    {RAIN_COLORS.map((color, i) => <Puddle key={color} lane={i} color={color} live={live}
      onDown={e => { lastLane.current = -1; strike(i, e); }}
      onMove={e => { if (e.buttons === 1) strike(i, e); }}
      onUp={() => { lastLane.current = -1; }} />)}
  </group>;
}

const waterVertex = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

// Dark glossy water: slow shimmer, a neon rim that flares on impact, and expanding ripple rings.
const waterFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uGlow;
  uniform float uAges[${RIPPLES}];
  varying vec2 vUv;
  void main() {
    float r = length(vUv - 0.5) * 2.0;
    if (r > 1.0) discard;
    vec3 col = vec3(0.008, 0.01, 0.025) + uColor * 0.04;
    // caustic shimmer and a soft sky reflection toward the far edge
    float shimmer = sin(r * 26.0 - uTime * 1.6) * sin(atan(vUv.y - 0.5, vUv.x - 0.5) * 7.0 + uTime * 0.7);
    col += uColor * 0.035 * (shimmer * 0.5 + 0.5);
    col += uColor * 0.08 * smoothstep(0.2, 1.0, vUv.y);
    // neon rim
    float rim = smoothstep(0.84, 0.97, r) * (1.0 - smoothstep(0.97, 1.0, r));
    col += uColor * rim * (0.9 + uGlow * 3.0);
    // ripples: each impact sends a bright ring and a fainter echo ring outward
    for (int i = 0; i < ${RIPPLES}; i++) {
      float a = uAges[i];
      if (a < 0.0 || a > 1.1) continue;
      float fade = 1.0 - a / 1.1;
      float ring = smoothstep(0.045, 0.0, abs(r - a * 1.05)) + 0.5 * smoothstep(0.03, 0.0, abs(r - a * 0.62));
      col += uColor * ring * fade * 2.6;
    }
    col += uColor * uGlow * 0.45 * (1.0 - r);
    gl_FragColor = vec4(col, 0.94);
  }
`;

// Additive light column: brightest at the water, fading upward.
const beamFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uFlash;
  varying vec2 vUv;
  void main() {
    float fall = pow(1.0 - vUv.y, 2.2);
    gl_FragColor = vec4(uColor * 2.2, fall * uFlash * 0.85);
  }
`;

function Puddle({ lane, color, live, onDown, onMove, onUp }: {
  lane: number; color: string; live: boolean; onDown: (e: ThreeEvent<PointerEvent>) => void;
  onMove: (e: ThreeEvent<PointerEvent>) => void; onUp: () => void;
}) {
  const neon = useMemo(() => new THREE.Color(color), [color]);
  const water = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: waterVertex,
    fragmentShader: waterFragment,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    uniforms: { uColor: { value: neon }, uTime: { value: 0 }, uGlow: { value: 0 }, uAges: { value: new Array(RIPPLES).fill(-1) } },
  }), [neon]);
  const beam = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: waterVertex,
    fragmentShader: beamFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
    uniforms: { uColor: { value: neon }, uFlash: { value: 0 } },
  }), [neon]);
  const beamGeo = useMemo(() => new THREE.CylinderGeometry(0.42, 0.75, 5, 32, 1, true).translate(0, 2.5, 0), []);
  const letter = useRef<THREE.MeshBasicMaterial>(null!);
  const letterGroup = useRef<THREE.Group>(null!);
  const bead = useRef<THREE.Group>(null!);
  const trail = useRef<THREE.Mesh>(null!);
  const splash = useRef<THREE.Group>(null!);
  const drops = useMemo(() => Array.from({ length: SPLASH }, () => ({ v: new THREE.Vector3(), p: new THREE.Vector3(), age: 9 })), []);
  const lastImpact = useRef(-Infinity);

  useFrame((state, dt) => {
    const now = Tone.immediate();
    const ages: number[] = [];
    let impact = -Infinity;
    let incoming = Infinity;
    for (const event of rainEvents) {
      if (event.lane !== lane) continue;
      if (event.time <= now) {
        impact = Math.max(impact, event.time);
        if (now - event.time < 1.1) ages.push(now - event.time);
      } else incoming = Math.min(incoming, event.time);
    }
    ages.sort((a, b) => a - b);
    const u = water.uniforms;
    for (let i = 0; i < RIPPLES; i++) u.uAges.value[i] = ages[i] ?? -1;
    u.uTime.value = state.clock.elapsedTime;
    const age = now - impact;
    const pulse = age >= 0 ? Math.max(0, 1 - age / 0.75) : 0;
    u.uGlow.value = pulse;
    beam.uniforms.uFlash.value = age >= 0 ? Math.exp(-age * 6) : 0;

    // a new impact throws a ring of droplets up out of the puddle
    if (impact > lastImpact.current && age < 0.1) {
      lastImpact.current = impact;
      drops.forEach((d, i) => {
        const a = (i / SPLASH) * Math.PI * 2 + Math.random() * 0.4;
        d.p.set(0, 0.05, 0);
        d.v.set(Math.cos(a) * (0.8 + Math.random() * 0.6), 2.2 + Math.random() * 1.4, Math.sin(a) * (0.6 + Math.random() * 0.4));
        d.age = 0;
      });
    }
    (splash.current.children as THREE.Mesh[]).forEach((m, i) => {
      const d = drops[i];
      d.age += dt;
      d.v.y -= 9 * dt;
      d.p.addScaledVector(d.v, dt);
      m.visible = d.age < 0.6 && d.p.y > 0;
      m.position.copy(d.p);
    });

    // incoming loop note: a glowing droplet with a light trail, landing on the beat
    const until = incoming - now;
    bead.current.visible = until < 0.6;
    if (bead.current.visible) {
      bead.current.position.y = Math.max(0.1, until * 10);
      trail.current.scale.y = 0.6 + (1 - until / 0.6) * 1.6;
    }

    // the key letter flares and hops on each hit
    letter.current.color.copy(neon).multiplyScalar(1.4 + pulse * 3);
    letterGroup.current.position.y = LETTER_Y + pulse * 0.12;
  });

  return <group position={[(lane - 2) * 2.7, 0, 0]}>
    <group scale={[1.2, 1, 1.8]}>
      <mesh rotation-x={-Math.PI / 2} material={water} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}>
        <circleGeometry args={[1.02, 64]} />
      </mesh>
      <mesh geometry={beamGeo} material={beam} />
    </group>
    <group ref={splash}>
      {drops.map((_, i) => <mesh key={i} visible={false}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshBasicMaterial color={neon.clone().multiplyScalar(2.5)} toneMapped={false} />
      </mesh>)}
    </group>
    <group ref={bead} visible={false}>
      <mesh>
        <sphereGeometry args={[0.1, 12, 12]} />
        <meshBasicMaterial color={neon.clone().multiplyScalar(3)} toneMapped={false} />
      </mesh>
      <mesh ref={trail} position-y={0.45}>
        <cylinderGeometry args={[0.012, 0.06, 0.9, 8, 1, true]} />
        <meshBasicMaterial color={neon.clone().multiplyScalar(1.6)} transparent opacity={0.55} toneMapped={false} depthWrite={false} />
      </mesh>
    </group>
    {/* big neon key letter centred in the puddle (same depth, so perspective can't push it off-centre),
        laid back toward the water so it reads as sitting inside the circle */}
    <group ref={letterGroup} position={[0, LETTER_Y, LETTER_Z]} rotation-x={-1.2}>
      <Text font={FONT} fontSize={0.62} anchorX="center" anchorY="middle" outlineWidth={0.02} outlineBlur={0.25} outlineColor={color} outlineOpacity={0.6}>
        {RAIN_KEYS[lane].toUpperCase()}
        <meshBasicMaterial ref={letter} toneMapped={false} />
      </Text>
      <Text font={FONT} fontSize={0.16} position={[0.5, -0.2, 0]} anchorX="left" color="#9aa6c8" letterSpacing={0.15}>
        {NUMERALS[lane]}
      </Text>
    </group>
    {/* accessible control: keyboard/screen-reader focusable, visually the 3D letter does the talking */}
    {live && <Html position={[0, 0.1, 0]} center>
      <button className="rain-key" style={{ color }} aria-label={`Play rain note ${lane + 1}, key ${RAIN_KEYS[lane]}`} onClick={() => { playRain(lane); poke(); }}>
        {RAIN_KEYS[lane].toUpperCase()}
      </button>
    </Html>}
  </group>;
}
