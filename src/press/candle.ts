import * as THREE from 'three';
import { candleWax } from './materials';
import { merge, turned } from './shapes';

/**
 * A tallow candle in a brass pan on an iron pricket stand, standing to the
 * left of the machine. The flame is a quad drawn with additive light in HDR, bright enough
 * that the bloom gives it its glow.
 */

const FLAME_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FLAME_FRAG = /* glsl */ `
varying vec2 vUv;
uniform float uTime;
uniform float uLean;
uniform float uPower;

float h1(float x) { return fract(sin(x * 127.1) * 43758.5453); }
float n1(float x) { float i = floor(x); float f = fract(x); return mix(h1(i), h1(i + 1.0), f * f * (3.0 - 2.0 * f)); }

void main() {
  // y runs from the wick (0) to the tip (1)
  vec2 q = vec2(vUv.x * 2.0 - 1.0, vUv.y);
  float y = q.y;
  // the flame leans in the draught and ripples, more toward the tip
  float sway = uLean * pow(y, 1.6) * 0.5 + (n1(uTime * 9.0 + y * 3.0) - 0.5) * 0.12 * y * y;
  float x = q.x - sway;
  // a teardrop: round at the base, drawn out to a point
  float w = 0.5 * pow(clamp(y / 0.28, 0.0, 1.0), 0.55) * pow(clamp((1.0 - y) / 0.72, 0.0, 1.0), 0.9);
  float d = abs(x) / max(w, 1e-4);
  float body = smoothstep(1.0, 0.35, d) * smoothstep(0.0, 0.07, y);
  // the white core sits low, over the dark zone round the wick
  float core = smoothstep(0.7, 0.0, d) * smoothstep(0.08, 0.3, y) * smoothstep(0.75, 0.3, y);
  float dark = smoothstep(0.45, 0.0, d) * smoothstep(0.24, 0.06, y);
  float blue = smoothstep(1.0, 0.4, d) * smoothstep(0.2, 0.02, y) * smoothstep(0.0, 0.05, y);
  vec3 col = vec3(1.0, 0.42, 0.08) * body * 2.2;
  col += vec3(1.0, 0.82, 0.5) * core * 5.5;
  col *= 1.0 - dark * 0.55;
  col += vec3(0.12, 0.2, 0.9) * blue * 0.9;
  // a faint warm haze round it
  float halo = exp(-length(vec2(x * 1.4, (y - 0.38) * 1.0)) * 5.0) * 0.18;
  col += vec3(1.0, 0.5, 0.18) * halo;
  gl_FragColor = vec4(col * uPower, 1.0);
}`;

export interface Candle {
  group: THREE.Group;
  flame: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  wax: THREE.MeshPhysicalMaterial;
  dispose(): void;
}

/**
 * `at` is where the flame burns, and `floor` the height the iron stand rises
 * from, below the bottom of the view.
 */
export function buildCandle(at: THREE.Vector3, floor: number, metal: { rubbed: THREE.Material; iron: THREE.Material }): Candle {
  const group = new THREE.Group();
  const rc = 11.5;
  const hc = 92;
  const top = at.y - 15;
  const base = top - hc;
  const wax = candleWax(hc + 12);

  // the candle: slightly uneven, its top melted into a cup with a raised lip
  const profile: [number, number][] = [
    [0, 0],
    [rc * 1.03, 0],
    [rc * 1.0, hc * 0.25],
    [rc * 0.97, hc * 0.55],
    [rc * 1.01, hc * 0.85],
    [rc * 0.99, hc - 3],
    [rc * 0.9, hc - 0.6],
    [rc * 0.74, hc - 1.8],
    [rc * 0.45, hc - 3.4],
    [0, hc - 3.8],
  ];
  const body = new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    40,
  );
  // drips down the side
  const drips: THREE.BufferGeometry[] = [body];
  const seeds = [0.3, 1.1, 1.9, 2.6, 3.3, 4.4, 5.2, 5.8];
  seeds.forEach((a, i) => {
    const len = 12 + ((i * 7) % 5) * 9;
    const rad = 1.7 + ((i * 3) % 4) * 0.45;
    const g = new THREE.CapsuleGeometry(rad, len, 4, 8);
    g.translate(0, hc - 2 - len / 2, 0);
    g.scale(1, 1, 0.7);
    g.translate(0, 0, rc - rad * 0.35);
    g.rotateY(a);
    drips.push(g);
  });
  // a pool of spilled wax in the pan
  drips.push(new THREE.SphereGeometry(rc * 1.45, 24, 12).scale(1, 0.18, 1).translate(0, 1.2, 0));
  const candle = new THREE.Mesh(merge(drips), wax);
  candle.position.set(at.x, base, at.z);

  // the wick, bent and charred
  const wickCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, hc - 4, 0), new THREE.Vector3(0.4, hc + 2, 0), new THREE.Vector3(1.6, hc + 6.5, 0.3)]);
  const wick = new THREE.Mesh(new THREE.TubeGeometry(wickCurve, 8, 0.75, 6), new THREE.MeshStandardMaterial({ color: 0x0b0806, roughness: 0.9 }));
  wick.position.copy(candle.position);

  // a brass drip pan with a pricket through it
  const pan = turned(
    [
      [0, -2.5],
      [6, -2.5],
      [8, -4.5],
      [10, -4.8],
      [rc * 1.75, -1],
      [rc * 1.95, 2.5],
      [rc * 2.0, 4],
      [rc * 1.9, 4.4],
      [rc * 1.7, 1.2],
      [0, 1.2],
    ],
    40,
  ).rotateX(-Math.PI / 2);
  const panMesh = new THREE.Mesh(pan.translate(at.x, base - 1, at.z), metal.rubbed);

  // the iron stand: a turned shaft with knops, rising from the floor
  const shaft = (base - 5 - floor) | 0;
  const stand: [number, number][] = [
    [7, 0],
    [4.2, 6],
    [3.6, shaft * 0.3],
    [7.5, shaft * 0.3 + 6],
    [8.5, shaft * 0.3 + 12],
    [4, shaft * 0.3 + 20],
    [3.4, shaft * 0.72],
    [6.5, shaft * 0.72 + 5],
    [7, shaft * 0.72 + 10],
    [3.6, shaft * 0.72 + 16],
    [3.4, shaft - 18],
    [6, shaft - 10],
    [9, shaft - 3],
    [9, shaft],
    [0, shaft],
  ];
  const standGeo = new THREE.LatheGeometry(
    stand.map(([r, y]) => new THREE.Vector2(r, y)),
    24,
  ).translate(at.x, floor, at.z);
  const armMesh = new THREE.Mesh(standGeo, metal.iron);
  const boss = new THREE.Mesh(new THREE.ConeGeometry(1.8, 14, 8).translate(at.x, base + 4, at.z), metal.iron);

  for (const mesh of [candle, panMesh, armMesh, boss]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }
  // the candle itself would shadow everything from its own flame
  candle.castShadow = false;
  wick.castShadow = false;

  const flame = new THREE.Mesh(
    new THREE.PlaneGeometry(13, 34).translate(0, 17, 0),
    new THREE.ShaderMaterial({
      vertexShader: FLAME_VERT,
      fragmentShader: FLAME_FRAG,
      uniforms: { uTime: { value: 0 }, uLean: { value: 0 }, uPower: { value: 1 } },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  flame.position.set(at.x + 1.6, top + 4, at.z + 0.3);
  flame.renderOrder = 2;

  group.add(candle, wick, panMesh, armMesh, boss, flame);
  return {
    group,
    flame,
    wax,
    dispose: () => {
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      wick.material.dispose();
      flame.material.dispose();
      wax.dispose();
    },
  };
}
