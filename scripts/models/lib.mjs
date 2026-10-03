// Shared procedural-modelling toolkit for the STL product generator.
// Everything is built in three.js' Y-up space (ground at y = 0, model front
// facing +Z) and converted to slicer Z-up on export.

import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';

export { THREE };

export const DEG = Math.PI / 180;
export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const V2 = (x = 0, y = 0) => new THREE.Vector2(x, y);
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const smooth = (t) => t * t * (3 - 2 * t);

// ---------------------------------------------------------------------------
// Deterministic randomness
// ---------------------------------------------------------------------------

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed) {
  const r = mulberry32(seed);
  const rng = () => r();
  rng.range = (a, b) => a + (b - a) * r();
  rng.int = (a, b) => Math.floor(a + (b - a + 1) * r());
  rng.pick = (arr) => arr[Math.floor(r() * arr.length)];
  rng.sign = () => (r() < 0.5 ? -1 : 1);
  return rng;
}

// Seeded 3D value noise (smooth, deterministic, position based so shared
// vertices always receive identical displacement).
export function makeNoise3(seed) {
  const r = mulberry32(seed);
  const perm = new Uint8Array(512);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const vals = new Float32Array(256).map(() => r() * 2 - 1);
  const h = (x, y, z) => vals[perm[perm[perm[x & 255] + (y & 255)] + (z & 255)]];
  const noise = (x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = smooth(x - xi), yf = smooth(y - yi), zf = smooth(z - zi);
    const c = (dx, dy, dz) => h(xi + dx, yi + dy, zi + dz);
    const x00 = lerp(c(0, 0, 0), c(1, 0, 0), xf);
    const x10 = lerp(c(0, 1, 0), c(1, 1, 0), xf);
    const x01 = lerp(c(0, 0, 1), c(1, 0, 1), xf);
    const x11 = lerp(c(0, 1, 1), c(1, 1, 1), xf);
    return lerp(lerp(x00, x10, yf), lerp(x01, x11, yf), zf);
  };
  noise.fbm = (x, y, z, oct = 3) => {
    let a = 0, amp = 1, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) {
      a += amp * noise(x * f, y * f, z * f);
      norm += amp;
      amp *= 0.5;
      f *= 2.03;
    }
    return a / norm;
  };
  return noise;
}

// ---------------------------------------------------------------------------
// Transform helpers
// ---------------------------------------------------------------------------

// t: { p:[x,y,z], r:[rx,ry,rz] (degrees), o:'XYZ', q:Quaternion, s:number|[sx,sy,sz] }
export function toMatrix(t) {
  if (!t) return new THREE.Matrix4();
  if (t.isMatrix4) return t.clone();
  const pos = t.p ? V(...t.p) : V();
  let q;
  if (t.q) q = t.q.clone();
  else if (t.r) q = new THREE.Quaternion().setFromEuler(new THREE.Euler(t.r[0] * DEG, t.r[1] * DEG, t.r[2] * DEG, t.o || 'XYZ'));
  else q = new THREE.Quaternion();
  let s = V(1, 1, 1);
  if (t.s !== undefined) s = typeof t.s === 'number' ? V(t.s, t.s, t.s) : V(...t.s);
  if (s.x <= 0 || s.y <= 0 || s.z <= 0) throw new Error('Negative/zero scale is not allowed');
  return new THREE.Matrix4().compose(pos, q, s);
}

// Quaternion rotating +Y onto `dir`.
export function qAlignY(dir) {
  return new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.clone().normalize());
}

function cleanGeometry(geom) {
  let g = geom.index ? geom.toNonIndexed() : geom.clone();
  for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
  g.morphAttributes = {};
  g.clearGroups();
  return g;
}

export function signedVolume(g) {
  const p = g.attributes.position.array;
  let v = 0;
  for (let i = 0; i < p.length; i += 9) {
    const ax = p[i], ay = p[i + 1], az = p[i + 2];
    const bx = p[i + 3], by = p[i + 4], bz = p[i + 5];
    const cx = p[i + 6], cy = p[i + 7], cz = p[i + 8];
    v += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return v / 6;
}

export function flipWinding(g) {
  const p = g.attributes.position.array;
  for (let i = 0; i < p.length; i += 9) {
    for (let k = 0; k < 3; k++) {
      const t = p[i + 3 + k];
      p[i + 3 + k] = p[i + 6 + k];
      p[i + 6 + k] = t;
    }
  }
  g.attributes.position.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// Builder: collects closed shells with a transform stack
// ---------------------------------------------------------------------------

export class Builder {
  constructor(name, seed = 1) {
    this.name = name;
    this.parts = [];
    this.stack = [new THREE.Matrix4()];
    this.rng = makeRng(seed);
    this.noise = makeNoise3(seed * 7 + 3);
  }
  get top() {
    return this.stack[this.stack.length - 1];
  }
  group(t, fn) {
    this.stack.push(this.top.clone().multiply(toMatrix(t)));
    try {
      fn();
    } finally {
      this.stack.pop();
    }
  }
  add(geom, t, tag) {
    const g = cleanGeometry(geom);
    const m = this.top.clone().multiply(toMatrix(t));
    if (m.determinant() <= 0) throw new Error(`${this.name}: non-positive determinant transform`);
    g.applyMatrix4(m);
    if (signedVolume(g) < 0) flipWinding(g);
    g.userData.tag = tag || geom.userData?.tag || '';
    this.parts.push(g);
    return g;
  }
  // Duplicate every part added inside fn, mirrored across the X = 0 (or Z = 0)
  // plane of the *current group's local frame*. The mirror is built
  // explicitly (coordinates negated + winding re-ordered), never with a
  // negative scale.
  _mirror(fn, axis) {
    const start = this.parts.length;
    fn();
    const end = this.parts.length;
    const M = this.top.clone();
    const Mi = M.clone().invert();
    for (let i = start; i < end; i++) {
      const g = this.parts[i].clone();
      g.applyMatrix4(Mi);
      const p = g.attributes.position.array;
      for (let k = axis; k < p.length; k += 3) p[k] = -p[k];
      g.applyMatrix4(M);
      flipWinding(g);
      if (signedVolume(g) < 0) flipWinding(g);
      g.userData.tag = this.parts[i].userData.tag + '~m';
      this.parts.push(g);
    }
  }
  mirrorX(fn) {
    this._mirror(fn, 0);
  }
  mirrorZ(fn) {
    this._mirror(fn, 2);
  }
  // Rotational copies around the world Y axis of everything built in fn.
  radial(n, fn, phase = 0) {
    for (let i = 0; i < n; i++) {
      this.group({ r: [0, phase + (360 / n) * i, 0] }, () => fn(i));
    }
  }
  // Build parts in an isolated sub-builder (local space) and return them.
  sub(fn) {
    const S = new Builder(this.name + '/sub', 1);
    S.rng = this.rng;
    S.noise = this.noise;
    fn(S);
    return S.parts;
  }
  addParts(parts, t) {
    const m = this.top.clone().multiply(toMatrix(t));
    for (const p of parts) {
      const g = p.clone();
      g.applyMatrix4(m);
      g.userData.tag = p.userData.tag;
      this.parts.push(g);
    }
  }
  triCount() {
    return this.parts.reduce((s, g) => s + g.attributes.position.count / 3, 0);
  }
}

// ---------------------------------------------------------------------------
// Primitive factories (all return closed shells)
// ---------------------------------------------------------------------------

export const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

// Box whose bottom sits at y = 0.
export const boxB = (w, h, d) => new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);

export function chamferBox(w, h, d, c = 0.5) {
  c = Math.min(c, w / 2.01, h / 2.01, d / 2.01);
  const pts = [];
  for (const sx of [-1, 1])
    for (const sy of [-1, 1])
      for (const sz of [-1, 1]) {
        const x = (sx * w) / 2, y = (sy * h) / 2, z = (sz * d) / 2;
        pts.push(V(x - sx * c, y, z - sz * c), V(x, y - sy * c, z - sz * c), V(x - sx * c, y - sy * c, z));
      }
  return new ConvexGeometry(pts);
}

export const hull = (pts) => new ConvexGeometry(pts.map((p) => (p.isVector3 ? p : V(...p))));

export function cyl(rt, rb, h, seg = 24, opts = {}) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, false, opts.thetaStart || 0);
  if (opts.base) g.translate(0, h / 2, 0);
  return g;
}

// Cylinder from point a to point b.
export function cylBetween(a, b, r, seg = 12, r2) {
  const dir = b.clone().sub(a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r2 ?? r, r, len, seg);
  g.applyQuaternion(qAlignY(dir));
  const mid = a.clone().add(b).multiplyScalar(0.5);
  g.translate(mid.x, mid.y, mid.z);
  return g;
}

// pts: [[r, y], ...] from bottom to top. Endpoints are closed to the axis.
export function lathe(pts, seg = 32, phiStart = 0) {
  const p = pts.map(([r, y]) => V2(Math.max(0, r), y));
  if (p[0].x > 1e-6) p.unshift(V2(0, p[0].y));
  if (p[p.length - 1].x > 1e-6) p.push(V2(0, p[p.length - 1].y));
  return new THREE.LatheGeometry(p, seg, phiStart, Math.PI * 2);
}

// Closed-loop lathe (profile polygon not touching the axis, e.g. rings).
export function latheLoop(pts, seg = 32, phiStart = 0) {
  const p = pts.map(([r, y]) => V2(r, y));
  p.push(p[0].clone());
  return new THREE.LatheGeometry(p, seg, phiStart, Math.PI * 2);
}

export function ring(rOut, rIn, h, seg = 32) {
  return latheLoop([[rIn, 0], [rOut, 0], [rOut, h], [rIn, h]], seg);
}

export function sphere(r, ws = 12, hs = 8) {
  return new THREE.SphereGeometry(r, ws, hs);
}

export function torus(R, r, rs = 8, ts = 24) {
  return new THREE.TorusGeometry(R, r, rs, ts);
}

export function capsule(r, len, cs = 4, rs = 10) {
  return new THREE.CapsuleGeometry(r, len, cs, rs, 1);
}

export function partsBBox(parts) {
  const bb = new THREE.Box3();
  for (const g of parts) {
    g.computeBoundingBox();
    bb.union(g.boundingBox);
  }
  return bb;
}

// A low-poly rivet dome (base at y=0, top at y=h).
export function rivet(r = 0.7, h, seg = 6) {
  h = h ?? r * 0.75;
  return lathe([[r, -r * 0.35], [r * 0.62, h]], seg, Math.PI / 6);
}

export function shapeFrom(pts, holes = []) {
  const s = new THREE.Shape(pts.map((p) => (p.isVector2 ? p : V2(p[0], p[1]))));
  for (const h of holes) s.holes.push(new THREE.Path(h.map((p) => (p.isVector2 ? p : V2(p[0], p[1])))));
  return s;
}

// Extrude a 2D outline (XY plane) along +Z. opts: {bevel, bevelT, bevelSeg, holes, center, curveSegments}
export function extrude(outline, depth, opts = {}) {
  const shape = outline.isShape ? outline : shapeFrom(outline, opts.holes || []);
  const bevel = opts.bevel || 0;
  const bt = opts.bevelT ?? bevel;
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(1e-3, depth - 2 * bt),
    bevelEnabled: bevel > 0,
    bevelSize: bevel,
    bevelThickness: bt,
    bevelOffset: opts.bevelOffset || 0,
    bevelSegments: opts.bevelSeg || 1,
    curveSegments: opts.curveSegments || 12,
    steps: opts.steps || 1,
  });
  g.translate(0, 0, bevel > 0 ? bt : 0);
  if (opts.center) g.translate(0, 0, -depth / 2);
  return g;
}

// Regular polygon / circle points.
export function circlePts(r, n, start = 0, cx = 0, cy = 0) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = start + (i / n) * Math.PI * 2;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}

// Pointed (gothic) arch outline, CCW, base at y = y0.
// w: span, h0: springing height above y0, R: arc radius (>= w/2; w = equilateral).
export function gothicArchPts(w, h0, R = w, seg = 10, cx = 0, y0 = 0) {
  const pts = [];
  const hw = w / 2;
  const dy = Math.sqrt(Math.max(0, R * R - (R - hw) * (R - hw)));
  pts.push([cx - hw, y0], [cx + hw, y0]);
  // right arc: centre at (cx + hw - R, y0 + h0)
  const crx = cx + hw - R;
  const aEnd = Math.atan2(dy, cx - crx);
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * aEnd;
    pts.push([crx + Math.cos(a) * R, y0 + h0 + Math.sin(a) * R]);
  }
  // left arc: centre at (cx - hw + R, y0 + h0), from apex down to springing
  const clx = cx - hw + R;
  const aStart = Math.atan2(dy, cx - clx); // angle to apex
  for (let i = 1; i <= seg; i++) {
    const a = aStart + (i / seg) * (Math.PI - aStart);
    pts.push([clx + Math.cos(a) * R, y0 + h0 + Math.sin(a) * R]);
  }
  // remove duplicate apex
  return dedupe(pts);
}

export function gothicArchHeight(w, h0, R = w) {
  const hw = w / 2;
  return h0 + Math.sqrt(Math.max(0, R * R - (R - hw) * (R - hw)));
}

function dedupe(pts) {
  const out = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(q[0] - p[0], q[1] - p[1]) > 1e-4) out.push(p);
  }
  const f = out[0], l = out[out.length - 1];
  if (Math.hypot(f[0] - l[0], f[1] - l[1]) < 1e-4) out.pop();
  return out;
}

// Offset a convex-ish/simple polygon inward by d (simple miter offset).
export function offsetPoly(pts, d) {
  const n = pts.length;
  // orientation
  let area = 0;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % n];
    area += x1 * y2 - x2 * y1;
  }
  const s = area > 0 ? 1 : -1; // CCW => inward normal is to the left
  const out = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
    const e1 = V2(p1[0] - p0[0], p1[1] - p0[1]).normalize();
    const e2 = V2(p2[0] - p1[0], p2[1] - p1[1]).normalize();
    const n1 = V2(-e1.y * s, e1.x * s);
    const n2 = V2(-e2.y * s, e2.x * s);
    const bis = n1.clone().add(n2);
    const len = bis.length();
    if (len < 1e-6) {
      out.push([p1[0] + n1.x * d, p1[1] + n1.y * d]);
      continue;
    }
    bis.divideScalar(len);
    const cos = bis.dot(n1);
    const k = d / Math.max(cos, 0.35);
    out.push([p1[0] + bis.x * k, p1[1] + bis.y * k]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Sweeps & lofts
// ---------------------------------------------------------------------------

// Build a closed mesh from rings of equal vertex count. Rings are arrays of
// Vector3. Caps are fan-triangulated from the ring centroid (rings must be
// star-shaped around their centroid). closed=true joins last ring to first.
export function loftRings(rings, { caps = true, closed = false } = {}) {
  const n = rings[0].length;
  const pos = [];
  const push = (a, b, c) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  const R = closed ? rings.length : rings.length - 1;
  for (let i = 0; i < R; i++) {
    const r0 = rings[i], r1 = rings[(i + 1) % rings.length];
    for (let j = 0; j < n; j++) {
      const a = r0[j], b = r1[j], c = r1[(j + 1) % n], d = r0[(j + 1) % n];
      push(a, b, d);
      push(b, c, d);
    }
  }
  if (caps && !closed) {
    const first = rings[0], last = rings[rings.length - 1];
    const c0 = first.reduce((s, v) => s.add(v), V()).divideScalar(n);
    const c1 = last.reduce((s, v) => s.add(v), V()).divideScalar(n);
    for (let j = 0; j < n; j++) {
      push(c0, first[j], first[(j + 1) % n]);
      push(c1, last[(j + 1) % n], last[j]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

// Sweep a 2D profile ([[u,v],...]) along a curve. Frames use a stable
// reference "up" vector (opts.up) unless opts.frenet is set.
// opts.scale(t) -> number|[su,sv]; opts.twist(t) -> radians.
export function sweep(curve, profile, segs = 24, opts = {}) {
  const rings = [];
  const up = opts.up ? opts.up.clone().normalize() : V(0, 1, 0);
  let frames = null;
  if (opts.frenet) frames = curve.computeFrenetFrames(segs, false);
  let prevN = null;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const P = curve.getPointAt(t);
    let T, N, B;
    if (frames) {
      T = frames.tangents[i];
      N = frames.normals[i];
      B = frames.binormals[i];
    } else {
      T = curve.getTangentAt(t).normalize();
      let ref = up;
      if (Math.abs(T.dot(ref)) > 0.98) ref = prevN || V(1, 0, 0);
      B = ref.clone().sub(T.clone().multiplyScalar(ref.dot(T))).normalize(); // "v" axis ~ up
      N = B.clone().cross(T).normalize(); // "u" axis
      prevN = B.clone();
    }
    let su = 1, sv = 1;
    if (opts.scale) {
      const s = opts.scale(t);
      if (Array.isArray(s)) [su, sv] = s;
      else su = sv = s;
    }
    const tw = opts.twist ? opts.twist(t) : 0;
    const ct = Math.cos(tw), st = Math.sin(tw);
    rings.push(
      profile.map(([u, v]) => {
        const uu = (u * ct - v * st) * su, vv = (u * st + v * ct) * sv;
        return P.clone().add(N.clone().multiplyScalar(uu)).add(B.clone().multiplyScalar(vv));
      }),
    );
  }
  return loftRings(rings, { caps: !opts.closed, closed: !!opts.closed });
}

// Capped tube along a curve.
export function tube(curve, r, segs = 32, rs = 8, opts = {}) {
  const prof = circlePts(r, rs);
  return sweep(curve, prof, segs, { frenet: opts.frenet ?? true, ...opts });
}

export function curveFrom(points, closed = false, tension = 0.5) {
  return new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p : V(...p))), closed, 'catmullrom', tension);
}

// Deform a geometry's vertices in place with fn(Vector3) -> void.
export function deform(geom, fn) {
  const p = geom.attributes.position;
  const v = V();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    fn(v);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  p.needsUpdate = true;
  return geom;
}

// ---------------------------------------------------------------------------
// Reusable ornaments
// ---------------------------------------------------------------------------

// A compact stylised skull (front faces +Z, base of jaw at y=0). size ~ height.
export function addSkull(B, size, t = {}) {
  const s = size / 10;
  B.group(t, () => {
    // cranium: deformed sphere
    const cr = new THREE.SphereGeometry(4.2 * s, 14, 10);
    deform(cr, (v) => {
      v.x *= 0.92;
      v.z *= 1.05;
      if (v.y < 0) v.y *= 0.75;
    });
    B.add(cr, { p: [0, 6 * s, -0.4 * s] }, 'skull');
    // face / maxilla block
    B.add(hull([
      [-3.1 * s, 5.2 * s, 2.1 * s], [3.1 * s, 5.2 * s, 2.1 * s],
      [-2.6 * s, 2.2 * s, 2.6 * s], [2.6 * s, 2.2 * s, 2.6 * s],
      [-2.9 * s, 2.0 * s, -0.5 * s], [2.9 * s, 2.0 * s, -0.5 * s],
      [-3.4 * s, 5.4 * s, -0.5 * s], [3.4 * s, 5.4 * s, -0.5 * s],
    ]), {}, 'skull');
    // jaw
    B.add(hull([
      [-2.3 * s, 0, 1.6 * s], [2.3 * s, 0, 1.6 * s],
      [-2.7 * s, 2.3 * s, 2.0 * s], [2.7 * s, 2.3 * s, 2.0 * s],
      [-2.8 * s, 0.4 * s, -0.8 * s], [2.8 * s, 0.4 * s, -0.8 * s],
      [-3.0 * s, 2.5 * s, -0.8 * s], [3.0 * s, 2.5 * s, -0.8 * s],
    ]), {}, 'skull');
    // brow ridge
    B.add(chamferBox(6.8 * s, 1.0 * s, 1.2 * s, 0.35 * s), { p: [0, 6.0 * s, 3.1 * s], r: [-12, 0, 0] }, 'skull');
    // eye socket rims (rings) + nose; ring/teeth sizes are clamped so tiny
    // skulls never get sub-0.8 mm slivers
    const tr = Math.max(0.38 * s, 0.42);
    for (const sx of [-1, 1]) {
      const rg = torus(Math.max(1.0 * s, tr * 1.6), tr, 5, 10);
      B.add(rg, { p: [sx * 1.5 * s, 4.8 * s, 3.05 * s], r: [-10, 0, 0] }, 'skull');
    }
    B.add(hull([[0, 3.95 * s, 3.25 * s], [-0.65 * s, 2.85 * s, 3.05 * s], [0.65 * s, 2.85 * s, 3.05 * s], [0, 3.4 * s, 2.3 * s]]), {}, 'skull');
    // teeth (fewer, chunkier on small skulls)
    const nT = size >= 7 ? 2 : 1;
    const step = (4.5 * s) / (2 * nT + 1);
    const tw = Math.max(step * 0.82, 0.8);
    for (let i = -nT; i <= nT; i++) {
      B.add(box(tw, Math.max(1.0 * s, 0.8), Math.max(0.6 * s, 0.8)), { p: [i * step, 1.9 * s, 2.55 * s - Math.abs(i) * (0.4 / nT) * s] }, 'skull');
    }
  });
}

// ---------------------------------------------------------------------------
// Finalise: merge, Z-up, centre, export
// ---------------------------------------------------------------------------

export function mergeParts(parts) {
  let total = 0;
  for (const g of parts) total += g.attributes.position.array.length;
  const out = new Float32Array(total);
  let o = 0;
  for (const g of parts) {
    out.set(g.attributes.position.array, o);
    o += g.attributes.position.array.length;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(out, 3));
  return g;
}

function removeDegenerate(g, eps = 1e-10) {
  const p = g.attributes.position.array;
  const keep = [];
  const a = V(), b = V(), c = V(), ab = V(), ac = V();
  for (let i = 0; i < p.length; i += 9) {
    a.fromArray(p, i);
    b.fromArray(p, i + 3);
    c.fromArray(p, i + 6);
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    if (ab.cross(ac).lengthSq() > eps) keep.push(i);
  }
  const out = new Float32Array(keep.length * 9);
  keep.forEach((i, k) => out.set(p.subarray(i, i + 9), k * 9));
  const ng = new THREE.BufferGeometry();
  ng.setAttribute('position', new THREE.BufferAttribute(out, 3));
  return ng;
}

// Per-part QA: closed-shell check (edge manifoldness after welding).
export function openEdgeCount(g) {
  const w = mergeVertices(g.clone(), 1e-4);
  const idx = w.index.array;
  const edges = new Map();
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], c = idx[i + 2];
    if (a === b || b === c || a === c) continue;
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      const k = u < v ? u * 1e7 + v : v * 1e7 + u;
      edges.set(k, (edges.get(k) || 0) + 1);
    }
  }
  let bad = 0;
  for (const n of edges.values()) if (n !== 2) bad++;
  // orientation consistency: every directed edge must appear exactly once
  const dir = new Map();
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], c = idx[i + 2];
    if (a === b || b === c || a === c) continue;
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      const k = u * 1e7 + v;
      dir.set(k, (dir.get(k) || 0) + 1);
    }
  }
  for (const n of dir.values()) if (n > 1) bad++;
  return bad;
}

// Floating-part check: parts are connected if their AABBs touch/overlap;
// anything not connected to a part resting on the ground is reported.
export function floatingParts(parts, tol = 0.05) {
  const boxes = parts.map((g) => {
    g.computeBoundingBox();
    return g.boundingBox.clone().expandByScalar(tol);
  });
  let minY = Infinity;
  for (const b of boxes) minY = Math.min(minY, b.min.y + tol);
  const seen = new Array(parts.length).fill(false);
  const queue = [];
  boxes.forEach((b, i) => {
    if (b.min.y + tol <= minY + 0.3) {
      seen[i] = true;
      queue.push(i);
    }
  });
  while (queue.length) {
    const i = queue.pop();
    for (let j = 0; j < parts.length; j++) {
      if (!seen[j] && boxes[i].intersectsBox(boxes[j])) {
        seen[j] = true;
        queue.push(j);
      }
    }
  }
  return parts.map((g, i) => (seen[i] ? null : i)).filter((i) => i !== null);
}

export function finalize(B, { check = true } = {}) {
  const issues = [];
  if (check) {
    B.parts.forEach((g, i) => {
      const n = openEdgeCount(g);
      if (n) issues.push(`part ${i} (${g.userData.tag}) has ${n} open/non-manifold edges`);
      const vol = signedVolume(g);
      if (vol <= 1e-6) issues.push(`part ${i} (${g.userData.tag}) has non-positive volume ${vol.toFixed(4)}`);
    });
    const fl = floatingParts(B.parts);
    for (const i of fl) issues.push(`part ${i} (${B.parts[i].userData.tag}) appears to float`);
  }
  let g = mergeParts(B.parts);
  g = removeDegenerate(g);
  // Y-up -> Z-up: rotate +90deg about X
  g.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2));
  g.computeBoundingBox();
  const bb = g.boundingBox;
  g.translate(-(bb.min.x + bb.max.x) / 2, -(bb.min.y + bb.max.y) / 2, -bb.min.z);
  g.computeBoundingBox();
  return { geometry: g, issues, parts: B.parts.length };
}

export function toBinarySTL(geometry) {
  const mesh = new THREE.Mesh(geometry);
  mesh.updateMatrixWorld(true);
  const dv = new STLExporter().parse(mesh, { binary: true });
  const buf = Buffer.from(dv.buffer);
  // header text
  const header = 'Reliquary Pattern Archive - procedural STL (mm, Z-up)';
  buf.write(header.padEnd(80, ' '), 0, 80, 'ascii');
  return buf;
}

// Fillet the corners of a 2D polygon (array of [x,y]) with radius r.
export function roundPoly(pts, r, seg = 4, closed = true) {
  const out = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = V2(...pts[i]);
    if (!closed && (i === 0 || i === n - 1)) {
      out.push([p.x, p.y]);
      continue;
    }
    const a = V2(...pts[(i - 1 + n) % n]), b = V2(...pts[(i + 1) % n]);
    const da = a.clone().sub(p), db = b.clone().sub(p);
    const la = da.length(), lb = db.length();
    da.normalize();
    db.normalize();
    const ang = Math.acos(clamp(da.dot(db), -1, 1));
    const rr = Math.min(r, (Math.min(la, lb) * 0.45) * Math.tan(ang / 2));
    const t = rr / Math.tan(ang / 2);
    const p1 = p.clone().add(da.clone().multiplyScalar(t));
    const p2 = p.clone().add(db.clone().multiplyScalar(t));
    // quadratic bezier from p1 via p to p2 approximates fillet
    for (let k = 0; k <= seg; k++) {
      const u = k / seg;
      const x = (1 - u) * (1 - u) * p1.x + 2 * (1 - u) * u * p.x + u * u * p2.x;
      const y = (1 - u) * (1 - u) * p1.y + 2 * (1 - u) * u * p.y + u * u * p2.y;
      out.push([x, y]);
    }
  }
  return out;
}

// Polyline length-parameterised sampler for a closed/open 2D path.
export function pathSampler(pts, closed = true) {
  const segs = [];
  let total = 0;
  const n = pts.length;
  const m = closed ? n : n - 1;
  for (let i = 0; i < m; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    segs.push({ a, b, len, start: total });
    total += len;
  }
  return {
    length: total,
    at(s) {
      s = closed ? ((s % total) + total) % total : clamp(s, 0, total);
      let lo = 0;
      while (lo < segs.length - 1 && segs[lo].start + segs[lo].len < s) lo++;
      const g = segs[lo];
      const u = g.len ? (s - g.start) / g.len : 0;
      const x = lerp(g.a[0], g.b[0], u), y = lerp(g.a[1], g.b[1], u);
      return { x, y, tx: (g.b[0] - g.a[0]) / (g.len || 1), ty: (g.b[1] - g.a[1]) / (g.len || 1) };
    },
  };
}

// Place n rivets along segment a->b (Vector3/arrays), rivet axis along `normal`.
export function rivetLine(B, a, b, n, normal = [0, 1, 0], r = 0.7, tag = 'rivet') {
  const A = Array.isArray(a) ? V(...a) : a, Bv = Array.isArray(b) ? V(...b) : b;
  const q = qAlignY(Array.isArray(normal) ? V(...normal) : normal);
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const p = A.clone().lerp(Bv, t);
    B.add(rivet(r), { p: [p.x, p.y, p.z], q }, tag);
  }
}

// Thin wavy plate (banner / ribbon) built from horizontal cross-sections.
// rows: [{ y, x0, x1 }] top to bottom (or any order along y); wave(x, y) -> z
// offset; t thickness; n samples across. Caps are strip-triangulated.
export function bandLoft(rows, wave, t = 1.2, n = 8) {
  const rings = rows.map(({ y, x0, x1 }) => {
    const front = [], back = [];
    for (let i = 0; i < n; i++) {
      const x = lerp(x0, x1, i / (n - 1));
      const z = wave(x, y);
      front.push(V(x, y, z + t / 2));
      back.push(V(x, y, z - t / 2));
    }
    return [...front, ...back.reverse()];
  });
  const g = loftRings(rings, { caps: false });
  // strip caps
  const pos = Array.from(g.attributes.position.array);
  const push = (a, b, c) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  const m = 2 * n;
  for (const [ring, flip] of [[rings[0], true], [rings[rings.length - 1], false]]) {
    for (let i = 0; i < n - 1; i++) {
      const f0 = ring[i], f1 = ring[i + 1], b0 = ring[m - 1 - i], b1 = ring[m - 2 - i];
      if (!flip) {
        push(f0, b1, f1);
        push(f0, b0, b1);
      } else {
        push(f0, f1, b1);
        push(f0, b1, b0);
      }
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return out;
}

// Points of a pointed arch from the left base, over the apex, to the right base.
export function archCurvePts(w, h0, R = w, seg = 10, cx = 0, y0 = 0) {
  const p = gothicArchPts(w, h0, R, seg, cx, y0);
  // p: [BL, BR, right side up..., apex..., left side down to (cx-hw, y0+h0)]
  const rest = p.slice(2); // from (cx+hw, y0+h0) over to (cx-hw, y0+h0)
  return [[cx - w / 2, y0], ...rest.reverse(), [cx + w / 2, y0]];
}
