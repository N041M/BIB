/**
 * Builds public/blog/skull.bin, the bone of the servo skull on the blog, from
 * the "Skull" model by Vladimir Petkovic (CC0 1.0) in Khronos's glTF sample
 * assets:
 * https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/ScatteringSkull
 *
 *   node scripts/build-skull.mjs path/to/ScatteringSkull.glb
 *
 * The model is 189,000 triangles. This welds it, reduces it to about 24,000,
 * bakes the model's ambient occlusion texture into the vertices, and turns it
 * to face +z with y up, centred and in millimetres. The file holds positions
 * as 16-bit steps across the bounding box, normals as 8-bit, occlusion as
 * 8-bit and 16-bit indices. src/press/skull.ts reads it.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { MeshoptSimplifier } from 'meshoptimizer';

const TRIANGLES = 24000;
/** How wide the skull ends up, in the servo skull pattern's millimetres. */
const WIDTH = 19.5;
/**
 * Turns the model from its own axes into the skull's: x to the skull's left,
 * y up, z out of the face. Each row is the new axis written in the model's.
 */
const AXES = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

const src = process.argv[2];
if (!src) {
  console.error('usage: node scripts/build-skull.mjs path/to/ScatteringSkull.glb');
  process.exit(1);
}

/* ───────────── read the GLB ───────────── */

const glb = readFileSync(src);
const jsonLength = glb.readUInt32LE(12);
const gltf = JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf8'));
const bin = glb.subarray(20 + jsonLength + 8);

function accessor(index) {
  const a = gltf.accessors[index];
  const view = gltf.bufferViews[a.bufferView];
  const size = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
  const Type = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array }[a.componentType];
  const offset = (view.byteOffset || 0) + (a.byteOffset || 0);
  const stride = view.byteStride || size * Type.BYTES_PER_ELEMENT;
  const out = new Type(a.count * size);
  for (let i = 0; i < a.count; i++) {
    for (let k = 0; k < size; k++) {
      const at = offset + i * stride + k * Type.BYTES_PER_ELEMENT;
      out[i * size + k] = Type === Float32Array ? bin.readFloatLE(at) : Type === Uint32Array ? bin.readUInt32LE(at) : bin.readUInt16LE(at);
    }
  }
  return out;
}

const prim = gltf.meshes[0].primitives[0];
const position = accessor(prim.attributes.POSITION);
const normal = accessor(prim.attributes.NORMAL);
const uv = accessor(prim.attributes.TEXCOORD_0);
const index = Uint32Array.from(accessor(prim.indices));
const count = position.length / 3;

/* ───────────── the occlusion texture: a non-interlaced 8-bit RGB PNG, occlusion in red ───────────── */

function decodePng(png) {
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (png[24] !== 8 || png[25] !== 2 || png[28] !== 0) throw new Error('expected an 8-bit RGB PNG without interlacing');
  const chunks = [];
  for (let at = 8; at < png.length; ) {
    const len = png.readUInt32BE(at);
    const type = png.toString('ascii', at + 4, at + 8);
    if (type === 'IDAT') chunks.push(png.subarray(at + 8, at + 8 + len));
    at += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(chunks));
  const bpp = 3;
  const row = width * bpp;
  const out = new Uint8Array(width * height * bpp);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (row + 1)];
    const line = raw.subarray(y * (row + 1) + 1, (y + 1) * (row + 1));
    for (let x = 0; x < row; x++) {
      const a = x >= bpp ? out[y * row + x - bpp] : 0;
      const b = y > 0 ? out[(y - 1) * row + x] : 0;
      const c = x >= bpp && y > 0 ? out[(y - 1) * row + x - bpp] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[y * row + x] = v & 255;
    }
  }
  return { width, height, data: out };
}

const material = gltf.materials[prim.material];
const image = gltf.images[gltf.textures[material.occlusionTexture.index].source];
const imageView = gltf.bufferViews[image.bufferView];
const tex = decodePng(bin.subarray(imageView.byteOffset || 0, (imageView.byteOffset || 0) + imageView.byteLength));

function occlusion(u, v) {
  const x = Math.min(tex.width - 1.001, Math.max(0, u * tex.width - 0.5));
  const y = Math.min(tex.height - 1.001, Math.max(0, v * tex.height - 0.5));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const at = (xx, yy) => tex.data[(yy * tex.width + xx) * 3] / 255;
  return (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
}

/* ───────────── weld the vertices split at texture seams ───────────── */

const key = (i) => `${position[i * 3].toFixed(6)},${position[i * 3 + 1].toFixed(6)},${position[i * 3 + 2].toFixed(6)}`;
const welded = new Map();
const remap = new Uint32Array(count);
const pos = [];
const nrm = [];
const ao = [];
const uses = [];
for (let i = 0; i < count; i++) {
  const k = key(i);
  let j = welded.get(k);
  const o = occlusion(uv[i * 2], uv[i * 2 + 1]);
  if (j === undefined) {
    j = pos.length / 3;
    welded.set(k, j);
    pos.push(position[i * 3], position[i * 3 + 1], position[i * 3 + 2]);
    nrm.push(0, 0, 0);
    ao.push(0);
    uses.push(0);
  }
  nrm[j * 3] += normal[i * 3];
  nrm[j * 3 + 1] += normal[i * 3 + 1];
  nrm[j * 3 + 2] += normal[i * 3 + 2];
  ao[j] += o;
  uses[j]++;
  remap[i] = j;
}
const weldedIndex = index.map((i) => remap[i]);

/* ───────────── reduce ───────────── */

await MeshoptSimplifier.ready;
const positions = Float32Array.from(pos);
const [reduced, error] = MeshoptSimplifier.simplify(weldedIndex, positions, 3, TRIANGLES * 3, 0.02);
const [order, vertices] = MeshoptSimplifier.compactMesh(reduced);

/* ───────────── turn, centre, scale and pack ───────────── */

const out = { pos: new Float32Array(vertices * 3), nrm: new Float32Array(vertices * 3), ao: new Float32Array(vertices) };
for (let old = 0; old < order.length; old++) {
  const i = order[old];
  if (i === 0xffffffff || i >= vertices) continue;
  const p = [pos[old * 3], pos[old * 3 + 1], pos[old * 3 + 2]];
  const n = [nrm[old * 3], nrm[old * 3 + 1], nrm[old * 3 + 2]];
  const len = Math.hypot(...n) || 1;
  for (let a = 0; a < 3; a++) {
    out.pos[i * 3 + a] = AXES[a][0] * p[0] + AXES[a][1] * p[1] + AXES[a][2] * p[2];
    out.nrm[i * 3 + a] = (AXES[a][0] * n[0] + AXES[a][1] * n[1] + AXES[a][2] * n[2]) / len;
  }
  out.ao[i] = ao[old] / uses[old];
}
const min = [Infinity, Infinity, Infinity];
const max = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < vertices; i++) {
  for (let a = 0; a < 3; a++) {
    min[a] = Math.min(min[a], out.pos[i * 3 + a]);
    max[a] = Math.max(max[a], out.pos[i * 3 + a]);
  }
}
const scale = WIDTH / (max[0] - min[0]);
const centre = min.map((m, a) => (m + max[a]) / 2);
for (let a = 0; a < 3; a++) {
  min[a] = (min[a] - centre[a]) * scale;
  max[a] = (max[a] - centre[a]) * scale;
}

if (vertices > 65535) throw new Error(`${vertices} vertices do not fit 16-bit indices`);
const header = 4 + 4 + 4 + 24;
const size = header + vertices * 6 + reduced.length * 2 + vertices * 3 + vertices;
const file = Buffer.alloc(size);
file.write('SKL1', 0, 'ascii');
file.writeUInt32LE(vertices, 4);
file.writeUInt32LE(reduced.length, 8);
for (let a = 0; a < 3; a++) {
  file.writeFloatLE(min[a], 12 + a * 4);
  file.writeFloatLE(max[a], 24 + a * 4);
}
let at = header;
for (let i = 0; i < vertices; i++) {
  for (let a = 0; a < 3; a++) {
    const v = ((out.pos[i * 3 + a] - centre[a]) * scale - min[a]) / (max[a] - min[a]);
    file.writeUInt16LE(Math.round(Math.min(1, Math.max(0, v)) * 65535), at);
    at += 2;
  }
}
for (const i of reduced) {
  file.writeUInt16LE(i, at);
  at += 2;
}
for (let i = 0; i < vertices * 3; i++) file.writeInt8(Math.round(Math.max(-1, Math.min(1, out.nrm[i])) * 127), at++);
for (let i = 0; i < vertices; i++) file.writeUInt8(Math.round(Math.min(1, Math.max(0, out.ao[i])) * 255), at++);

mkdirSync(new URL('../public/blog/', import.meta.url), { recursive: true });
writeFileSync(new URL('../public/blog/skull.bin', import.meta.url), file);
console.log(`skull.bin: ${vertices} vertices, ${reduced.length / 3} triangles, error ${error.toFixed(4)}, ${(size / 1024).toFixed(0)} KB`);
console.log(`size in mm: ${(max[0] - min[0]).toFixed(1)} wide, ${(max[1] - min[1]).toFixed(1)} tall, ${(max[2] - min[2]).toFixed(1)} deep`);
