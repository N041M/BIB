import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import buildServo from '../../scripts/models/servo-skull-drone.mjs';
import { detailed } from './materials';
import { merge } from './shapes';

/**
 * A servo skull hovering over the top right of the machine, its claw holding
 * a placard on a ring, which is the way back to the main page.
 *
 * The skull is the CC0 "Skull" model by Vladimir Petkovic, reduced by
 * scripts/build-skull.mjs into public/blog/skull.bin. Its fittings are the store's
 * own Servo-Skull Drone pattern, from the same builder that writes the
 * pattern's STL (scripts/models/servo-skull-drone.mjs), in millimetres: the
 * optic, the cranial plate, the antennae, the anti-grav ring and the claw arm.
 * The pattern's own simpler skull and its flight stand are left out.
 */

/** Height of the skull's centre above the pattern's base, in millimetres. */
const CENTRE = 45;
/** The flight stand and its base, and the thruster under the ring, which made the skull look as if it stood on a pedestal. */
const STAND = new Set(['base', 'basering', 'rubble', 'cog', 'socket', 'rod', 'spine', 'thruster']);
/** The riveted plate on the pattern's crown, which sits on its own skull's shape and not on this one. */
const CROWN = new Set(['plate', 'port']);
/** The pattern's own simpler skull and the rims round its sockets, which the model replaces. */
const BONE = new Set(['cranium', 'brow', 'cheekbone', 'ramus', 'maxilla', 'teeth', 'nose', 'jaw', 'chin', 'socketring']);
/** The builder turns the whole skull 10 degrees about y. */
const TURN = THREE.MathUtils.degToRad(10);
/** Polished brass, and brass left to tarnish so its flat faces do not mirror the light. */
const BRASS = new Set(['bionic', 'lensring', 'rivet', 'vox', 'antennabase', 'antennadish']);
const TARNISHED = new Set(['gravring', 'emitter', 'mount']);
/** The optic and its lens, moved over from where the pattern's own socket is into the model's. */
const OPTIC = new Set(['bionic', 'lensring', 'lens']);
const OPTIC_SHIFT = new THREE.Vector3(0.8, 0, -0.4);
/** The antennae, lowered onto the model's crown, which is lower at the back than the pattern's. */
const ANTENNA = new Set(['antennabase', 'antenna', 'antennatip', 'antennadish']);
const ANTENNA_SHIFT = new THREE.Vector3(0, -2.6, 0.6);
/** How the model's skull is fitted to the pattern's fittings: a little larger, lower and further back. */
const BONE_SCALE = 1.12;
const BONE_OFFSET = new THREE.Vector3(0, -3.4, -2.6);

interface ServoParts {
  brass: THREE.BufferGeometry;
  tarnished: THREE.BufferGeometry;
  iron: THREE.BufferGeometry;
  lens: THREE.BufferGeometry;
  /** The tip of the claw, where the placard's ring hangs. */
  claw: THREE.Vector3;
}

let built: ServoParts | undefined;

/** Build the pattern's parts once, sorted by what they are made of, with the skull's centre at the origin. */
function servo(): ServoParts {
  if (built) return built;
  const groups: Record<'brass' | 'tarnished' | 'iron' | 'lens', THREE.BufferGeometry[]> = { brass: [], tarnished: [], iron: [], lens: [] };
  const claw = new THREE.Vector3(0, Infinity, 0);
  const v = new THREE.Vector3();
  for (const part of buildServo().parts) {
    const tag = String(part.userData.tag).replace(/~m$/, '');
    if (STAND.has(tag) || BONE.has(tag) || CROWN.has(tag)) continue;
    part.translate(0, -CENTRE, 0);
    if (OPTIC.has(tag)) part.translate(OPTIC_SHIFT.x, OPTIC_SHIFT.y, OPTIC_SHIFT.z);
    if (ANTENNA.has(tag)) part.translate(ANTENNA_SHIFT.x, ANTENNA_SHIFT.y, ANTENNA_SHIFT.z);
    // the rivets that held the pattern's crown plate
    if (tag === 'rivet') {
      part.computeBoundingBox();
      if (part.boundingBox!.max.y > 9) continue;
    }
    if (tag === 'claw') {
      const pos = part.attributes.position;
      for (let i = 0; i < pos.count; i++) if (v.fromBufferAttribute(pos, i).y < claw.y) claw.copy(v);
    }
    // smooth over gentle curves, sharp at the edges of the machined parts
    const g = toCreasedNormals(part, THREE.MathUtils.degToRad(32));
    (tag === 'lens' ? groups.lens : BRASS.has(tag) ? groups.brass : TARNISHED.has(tag) ? groups.tarnished : groups.iron).push(g);
  }
  built = { brass: merge(groups.brass), tarnished: merge(groups.tarnished), iron: merge(groups.iron), lens: merge(groups.lens), claw };
  return built;
}

let bone: Promise<THREE.BufferGeometry> | undefined;

/**
 * Load the skull's mesh once: positions in 16-bit steps across its box,
 * 8-bit normals, the model's ambient occlusion as an 8-bit grey, and 16-bit
 * indices. The layout is written by scripts/build-skull.mjs.
 */
function loadBone(): Promise<THREE.BufferGeometry> {
  bone ??= fetch(new URL('blog/skull.bin', document.baseURI))
    .then((r) => {
      if (!r.ok) throw new Error(`skull.bin: HTTP ${r.status}`);
      return r.arrayBuffer();
    })
    .then((buf) => {
      const dv = new DataView(buf);
      const vertices = dv.getUint32(4, true);
      const indices = dv.getUint32(8, true);
      const min = [0, 1, 2].map((a) => dv.getFloat32(12 + a * 4, true));
      const max = [0, 1, 2].map((a) => dv.getFloat32(24 + a * 4, true));
      let at = 36;
      const steps = new Uint16Array(buf, at, vertices * 3);
      at += vertices * 6;
      const index = new Uint16Array(buf, at, indices);
      at += indices * 2;
      const normal = new Int8Array(buf, at, vertices * 3);
      at += vertices * 3;
      const ao = new Uint8Array(buf, at, vertices);
      const position = new Float32Array(vertices * 3);
      const colour = new Float32Array(vertices * 3);
      for (let i = 0; i < vertices; i++) {
        for (let a = 0; a < 3; a++) position[i * 3 + a] = min[a] + (steps[i * 3 + a] / 65535) * (max[a] - min[a]);
        const o = Math.pow(ao[i] / 255, 1.4);
        colour.fill(o, i * 3, i * 3 + 3);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(position, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(normal, 3, true));
      g.setAttribute('color', new THREE.BufferAttribute(colour, 3));
      g.setIndex(new THREE.BufferAttribute(index, 1));
      g.computeBoundingSphere();
      return g;
    });
  return bone;
}

/** Old bone: ivory gone brown, stained, finely pitted and cracked. The model's occlusion darkens its hollows through the vertex colour. */
function boneMaterial(): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62, metalness: 0, vertexColors: true });
  return detailed(mat, {
    name: 'bone',
    body: /* glsl */ `
      float m = prFbm(p * 0.45);
      float stain = smoothstep(0.45, 0.8, prFbm(p * 0.18 + 9.0));
      vec3 col = mix(vec3(0.66, 0.58, 0.44), vec3(0.44, 0.35, 0.23), m);
      col = mix(col, vec3(0.32, 0.22, 0.13), stain * 0.6);
      float crack = smoothstep(0.03, 0.0, abs(prNoise(p * vec3(0.32, 0.8, 0.32)) - 0.5)) * smoothstep(0.5, 0.85, prNoise(p * 0.18 + 4.0));
      col = mix(col, vec3(0.14, 0.09, 0.05), crack * 0.8);
      prAlbedo = col;
      prRough = 0.5 + m * 0.3 + stain * 0.1;
      prHeight = (prNoise(p * 3.0) - 0.5) * 0.06 + (m - 0.5) * 0.05 - crack * 0.06;
    `,
  });
}

/** The placard's face: parchment with the label in ink, red while the pointer is on it. */
function drawPlacard(canvas: HTMLCanvasElement, label: string, lit: boolean): void {
  const g = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;
  const paper = g.createLinearGradient(0, 0, w, h);
  paper.addColorStop(0, '#d9c49c');
  paper.addColorStop(1, '#bfa577');
  g.fillStyle = paper;
  g.fillRect(0, 0, w, h);
  // browned toward the frame
  const edge = g.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, w * 0.6);
  edge.addColorStop(0, 'rgba(90, 55, 20, 0)');
  edge.addColorStop(1, 'rgba(90, 55, 20, 0.45)');
  g.fillStyle = edge;
  g.fillRect(0, 0, w, h);
  g.fillStyle = lit ? 'rgb(176, 30, 16)' : 'rgb(22, 16, 12)';
  g.font = `600 ${Math.round(h * 0.46)}px 'Cinzel', Georgia, serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(label, w / 2, h * 0.54);
}

export interface Skull {
  group: THREE.Group;
  /** Its box on screen with the eye at rest: the area that takes the click. */
  box: { x: number; y: number; w: number; h: number };
  /** Move it: `t` in seconds, `lit` from 0 to 1 while the pointer or the keyboard is on it, `arrive` from 0 (out of view above) to 1 (in place). */
  update(t: number, lit: number, arrive: number): void;
  dispose(): void;
}

export interface SkullMaterials {
  /** Tarnished brass for the placard's flat frame, which would mirror the light if it were polished. */
  brass: THREE.Material;
  rubbed: THREE.Material;
  iron: THREE.Material;
}

/**
 * Build the skull hovering with its centre at `at`, `scale` pixels to the
 * millimetre, turned a little toward the sheet on its left. The placard hangs
 * from its claw. `toScreen` turns a world point into screen pixels, for the
 * click area.
 */
export function buildSkull(
  at: THREE.Vector3,
  scale: number,
  label: string,
  metal: SkullMaterials,
  toScreen: (p: THREE.Vector3) => THREE.Vector2,
  onReady: () => void,
): Skull {
  const parts = servo();
  const group = new THREE.Group();
  group.position.copy(at);
  group.scale.setScalar(scale);
  // the body turns and tilts; the placard hangs from the claw and keeps upright
  const body = new THREE.Group();
  group.add(body);

  // the skull, once its mesh has loaded, turned like the pattern's own
  const boneMat = boneMaterial();
  let disposed = false;
  void loadBone().then((geometry) => {
    if (disposed) return;
    const mesh = new THREE.Mesh(geometry, boneMat);
    mesh.rotation.y = TURN;
    mesh.position.copy(BONE_OFFSET);
    mesh.scale.setScalar(BONE_SCALE);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    body.add(mesh);
    onReady();
  });

  const lensMat = new THREE.MeshStandardMaterial({ color: 0x120202, roughness: 0.1, metalness: 0, emissive: new THREE.Color('#e0200f'), emissiveIntensity: 1.1 });
  for (const [geo, mat] of [
    [parts.brass, metal.rubbed],
    [parts.tarnished, metal.brass],
    [parts.iron, metal.iron],
    [parts.lens, lensMat],
  ] as const) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = mat !== lensMat;
    mesh.receiveShadow = true;
    body.add(mesh);
  }

  // the placard, in pixels, hung by a ring from the claw's tip. It undoes the group's scale, so it keeps its own size.
  const pw = 104;
  const ph = 28;
  const ringR = 3;
  const placard = new THREE.Group();
  placard.scale.setScalar(1 / scale);
  group.add(placard);
  const hang = new THREE.Group();
  placard.add(hang);
  const frame = new THREE.Mesh(new RoundedBoxGeometry(pw, ph, 3.5, 2, 1.4).translate(0, -ringR * 2 - ph / 2, 0), metal.brass);
  frame.castShadow = true;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(ringR, 0.8, 8, 16).translate(0, -ringR, 0), metal.iron);
  ring.castShadow = true;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = Math.round((512 * (ph - 6)) / (pw - 6));
  drawPlacard(canvas, label, false);
  const face = new THREE.CanvasTexture(canvas);
  face.colorSpace = THREE.SRGBColorSpace;
  face.anisotropy = 4;
  const faceMat = new THREE.MeshStandardMaterial({ map: face, roughness: 0.85, metalness: 0 });
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(pw - 6, ph - 6).translate(0, -ringR * 2 - ph / 2, 1.85), faceMat);
  hang.add(frame, ring, paper);
  let wasLit = false;
  // the label is set in the page's capitals, which may still be loading
  void document.fonts.load("600 20px 'Cinzel'").then(() => {
    drawPlacard(canvas, label, wasLit);
    face.needsUpdate = true;
  });

  const tip = new THREE.Vector3();
  const placeTip = () => {
    body.updateMatrix();
    tip.copy(parts.claw).applyMatrix4(body.matrix);
    placard.position.copy(tip);
  };
  placeTip();

  // the click area: the skull's head and antennae, and the placard under the claw
  const corner = (x: number, y: number) => toScreen(new THREE.Vector3(x, y, 0).add(at));
  const tipX = tip.x * scale;
  const tipY = tip.y * scale;
  const head = corner(Math.min(-16 * scale, tipX - pw / 2), 24 * scale);
  const foot = corner(16 * scale, tipY - ringR * 2 - ph);
  const box = { x: head.x - 6, y: head.y - 6, w: foot.x - head.x + 12, h: foot.y - head.y + 12 };

  return {
    group,
    box,
    update: (t, lit, arrive) => {
      const e = 1 - Math.pow(1 - arrive, 3);
      group.position.set(at.x - (1 - e) * 60, at.y + (1 - e) * 260 + Math.sin(t * 1.15) * 2.4, at.z);
      // it drifts and looks about, and turns to face the viewer while the pointer is on it
      body.rotation.y = (-0.4 + Math.sin(t * 0.43) * 0.2 + Math.sin(t * 0.17 + 1) * 0.08) * (1 - lit) - 0.15 * lit;
      body.rotation.x = Math.sin(t * 0.61 + 2) * 0.05 - 0.08 * lit;
      body.rotation.z = Math.sin(t * 0.7) * 0.03;
      placeTip();
      hang.rotation.z = Math.sin(t * 1.3 + 0.5) * 0.05;
      hang.rotation.x = 0.14 + Math.sin(t * 0.9) * 0.04;
      lensMat.emissiveIntensity = 1.1 + 0.2 * Math.sin(t * 2.1) + 2.2 * lit;
      const on = lit > 0.5;
      if (on !== wasLit) {
        wasLit = on;
        drawPlacard(canvas, label, on);
        face.needsUpdate = true;
      }
    },
    dispose: () => {
      disposed = true;
      for (const m of [frame, ring, paper]) m.geometry.dispose();
      boneMat.dispose();
      lensMat.dispose();
      faceMat.dispose();
      face.dispose();
    },
  };
}
