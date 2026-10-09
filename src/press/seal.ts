import * as THREE from 'three';
import { detailed, sealWax } from './materials';
import { extrude } from './shapes';

/** The store's mark: a pointed arch inside a pointed arch, on a base line. The same paths as the brand mark in src/ui/page.ts. */
const MARK = ['M3 23V11.5C3 6.8 6 3.3 10 1.5c4 1.8 7 5.3 7 10V23', 'M7 23V12.5c0-2.6 1.2-4.6 3-5.8 1.8 1.2 3 3.2 3 5.8V23', 'M0 23h20'];

/** A height map of the mark pressed into the wax: the stamp's lines stand up, with a soft shoulder. */
function stampTexture(): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, size, size);
  // a raised rim round the edge of the stamp
  g.strokeStyle = '#fff';
  g.lineWidth = 10;
  g.filter = 'blur(3px)';
  g.beginPath();
  g.arc(size / 2, size / 2, size * 0.36, 0, Math.PI * 2);
  g.stroke();
  g.translate(size * 0.29, size * 0.26);
  g.scale(size * 0.021, size * 0.021);
  g.lineWidth = 1.6;
  g.lineCap = 'round';
  for (const d of MARK) g.stroke(new Path2D(d));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

/** Parchment strips with lines of tiny type, cut in a swallowtail at the bottom. */
function stripMaterial(): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
  return detailed(mat, {
    name: 'strip',
    body: /* glsl */ `
      float m = prFbm(p * 0.09);
      vec3 col = mix(vec3(0.62, 0.50, 0.31), vec3(0.42, 0.31, 0.17), m);
      float row = floor(p.y / 4.2);
      float f = fract(p.y / 4.2);
      float line = smoothstep(0.22, 0.34, f) * smoothstep(0.7, 0.58, f);
      float word = step(0.42, prNoise(vec3(p.x * 0.45, row * 3.1, 0.0)));
      float margin = step(abs(p.x), 3.4);
      col = mix(col, vec3(0.07, 0.05, 0.04), line * word * margin * 0.7);
      prAlbedo = col;
      prHeight = (m - 0.5) * 0.6;
    `,
  });
}

function strip(width: number, length: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-width / 2, 0);
  s.lineTo(width / 2, 0);
  s.lineTo(width / 2, -length);
  s.lineTo(0, -length + width * 0.7);
  s.lineTo(-width / 2, -length);
  s.lineTo(-width / 2, 0);
  return new THREE.ShapeGeometry(s, 1);
}

export interface Seal {
  group: THREE.Group;
  /** Sway it a little, as if in the draught that moves the candle's flame. */
  sway(t: number): void;
  dispose(): void;
}

/** A wax seal on a cord with two strips of typed parchment, hanging from `at`. */
export function buildSeal(at: THREE.Vector3, drop: number): Seal {
  const group = new THREE.Group();
  group.position.copy(at);

  const cordMat = new THREE.MeshStandardMaterial({ color: 0x3a1610, roughness: 0.8 });
  const cord = new THREE.Mesh(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.8, -drop * 0.5, 0.6), new THREE.Vector3(0, -drop, 1.5)]),
      16,
      0.9,
      6,
    ),
    cordMat,
  );

  // the wax: an uneven disc with a soft, rounded edge, the mark pressed into its face
  const r = 15;
  const blob = new THREE.Shape();
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const k = r * (1 + 0.06 * Math.sin(a * 3 + 1) + 0.04 * Math.sin(a * 7 + 2) + 0.03 * Math.sin(a * 11));
    if (i === 0) blob.moveTo(Math.cos(a) * k, Math.sin(a) * k);
    else blob.lineTo(Math.cos(a) * k, Math.sin(a) * k);
  }
  const waxGeo = extrude(blob, 2.5, 2.6, 4);
  const wax = sealWax();
  const stamp = stampTexture();
  stamp.repeat.set(1 / (2 * r), 1 / (2 * r));
  stamp.offset.set(0.5, 0.5);
  wax.bumpMap = stamp;
  wax.bumpScale = 3;
  const seal = new THREE.Mesh(waxGeo, wax);
  seal.position.set(0, -drop - r * 0.8, 2);
  seal.rotation.z = 0.08;

  // two strips hang from behind the wax, each swinging on its own
  const paper = stripMaterial();
  const strips: THREE.Mesh[] = [];
  for (const [dx, w, len, tilt] of [
    [-4.5, 10, 64, -0.06],
    [5, 9, 48, 0.09],
  ]) {
    const m = new THREE.Mesh(strip(w, len), paper);
    m.position.set(dx, -drop - r * 0.6, -0.5);
    m.rotation.z = tilt;
    strips.push(m);
  }

  for (const m of [cord, seal, ...strips]) {
    m.castShadow = true;
    m.receiveShadow = true;
  }
  group.add(cord, seal, ...strips);

  return {
    group,
    sway: (t) => {
      group.rotation.z = Math.sin(t * 0.9) * 0.03 + Math.sin(t * 2.3 + 1) * 0.008;
      group.rotation.x = Math.sin(t * 0.7 + 2) * 0.05;
      strips.forEach((m, i) => {
        m.rotation.z = (i ? 0.09 : -0.06) + Math.sin(t * (1.6 + i * 0.5) + i * 2) * 0.05;
        m.rotation.x = Math.sin(t * (1.1 + i * 0.3) + i) * 0.12;
      });
    },
    dispose: () => {
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      for (const mat of [cordMat, wax, paper]) mat.dispose();
      stamp.dispose();
    },
  };
}

