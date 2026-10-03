// Oathbreaker relic blade: a winged-guard relic sword driven point-down into a
// stratified boulder on a hexagonal plinth, with chains and a wax oath-seal.
import {
  Builder, V, box, chamferBox, hull, cyl, lathe, latheLoop, sphere, torus, extrude, deform,
  bandLoft, addSkull, rivet, THREE,
} from './lib.mjs';

export default function build() {
  const B = new Builder('oathbreaker-relic-blade', 6606);
  const rng = B.rng;
  const noise = B.noise;

  // ------------------------------------------------------------ hex plinth
  B.add(lathe([[27, 0], [27, 2.4], [26.2, 3.2], [25.4, 3.2], [25.4, 4.2], [24.4, 5.2]], 6, Math.PI / 6), {}, 'base');
  // plaques on the three front faces
  for (const a of [-60, 0, 60]) {
    B.group({ r: [0, a, 0] }, () => {
      const apo = 27 * Math.cos(Math.PI / 6);
      B.add(chamferBox(16, 1.6, 1.2, 0.3), { p: [0, 1.3, apo - 0.2] }, 'plaque');
      B.add(box(11, 0.8, 0.8), { p: [0, 1.3, apo + 0.5] }, 'plaquetext');
    });
  }
  const BASE_TOP = 5.2;

  // ------------------------------------------------------------ boulder
  const rockGeo = (r, detail, sx, sy, sz, seed, amp, nPlanes = 24) => {
    const g = new THREE.IcosahedronGeometry(r, detail);
    // chisel planes give the boulder flat fractured facets
    const planes = [];
    for (let i = 0; i < nPlanes; i++) {
      const n = V(rng.range(-1, 1), rng.range(-0.6, 1), rng.range(-1, 1)).normalize();
      planes.push({ n, d: r * rng.range(0.84, 1.04) });
    }
    deform(g, (v) => {
      const n = v.clone().normalize();
      const f = noise.fbm(n.x * 1.6 + seed, n.y * 1.6, n.z * 1.6 - seed, 3);
      const ridge = 1 - Math.abs(noise(n.x * 2.6 - seed, n.y * 2.6, n.z * 2.6));
      let k = 1 + amp * f + amp * 0.45 * ridge;
      v.copy(n.multiplyScalar(r * k));
      for (const pl of planes) {
        const d = v.dot(pl.n);
        if (d > pl.d) v.addScaledVector(pl.n, -(d - pl.d));
      }
      // fine surface roughness
      const nn = v.clone().normalize();
      v.addScaledVector(nn, r * 0.05 * noise.fbm(v.x * 0.45 + seed, v.y * 0.45, v.z * 0.45, 2));
      v.x *= sx;
      v.y *= sy;
      v.z *= sz;
    });
    return g;
  };
  {
    const g = rockGeo(18.5, 9, 1.16, 0.95, 1.0, 2.3, 0.3);
    g.computeBoundingBox();
    const lift = BASE_TOP - 0.8 - g.boundingBox.min.y * 0.55;
    deform(g, (v) => {
      v.y = Math.max(v.y + lift, BASE_TOP - 0.6);
    });
    B.add(g, {}, 'rock');
  }
  // smaller stones around the boulder
  for (const [x, z, r, s] of [[-17, 12, 4.2, 7.1], [19, 9, 3.4, 3.3], [13, -15, 3.8, 5.9], [-8, 16.5, 2.4, 1.7], [-19, -9, 2.8, 9.2]]) {
    const g = rockGeo(r, 2, 1.2, 0.7, 1, s, 0.3, 6);
    g.computeBoundingBox();
    B.add(g, { p: [x, BASE_TOP - 0.4 - g.boundingBox.min.y * 0.7, z], r: [0, rng.range(0, 360), 0] }, 'stone');
  }

  // ------------------------------------------------------------ the sword
  const GUARD_Y = 100;
  B.group({ p: [0, GUARD_Y, 0], r: [0, 0, -3.5] }, () => {
    // blade: extruded cap outline, bevel produces the edge profile
    const bladeInner = [[-2.3, 0], [2.3, 0], [2.0, -58], [1.2, -72], [0.25, -84], [-0.25, -84], [-1.2, -72], [-2.0, -58]];
    B.add(extrude(bladeInner, 4.6, { bevel: 5.0, bevelT: 1.8, center: true }), { p: [0, 1.0, 0] }, 'blade');
    // raised fuller ridge on both faces
    for (const sz of [-1, 1]) {
      B.add(hull([[-1.0, -2, sz * 2.0], [1.0, -2, sz * 2.0], [0, -2, sz * 2.9], [-0.7, -54, sz * 2.0], [0.7, -54, sz * 2.0], [0, -54, sz * 2.6], [0, -60, sz * 2.0]]), {}, 'fuller');
      // rune studs
      for (let k = 0; k < 4; k++) {
        B.add(hull([[0, 1.4, 0], [0, -1.4, 0], [1.0, 0, 0], [-1.0, 0, 0], [0, 0, sz * 0.8]]), { p: [0, -14 - k * 6, sz * 2.75] }, 'rune');
      }
    }
    // ricasso collar
    B.add(chamferBox(15.6, 4, 6.4, 1.0), { p: [0, -1.0, 0] }, 'ricasso');

    // crossguard centre block with gem and skull
    B.add(chamferBox(12, 7.5, 8.6, 1.6), { p: [0, 3.6, 0] }, 'guard');
    B.add(hull([[0, 2.6, 0], [0, -2.6, 0], [2.0, 0, 0], [-2.0, 0, 0], [0, 0, 1.8], [0, 0, -1.2]]), { p: [0, 5.2, 4.3] }, 'gem');
    B.add(hull([[0, 2.6, 0], [0, -2.6, 0], [2.0, 0, 0], [-2.0, 0, 0], [0, 0, -1.8], [0, 0, 1.2]]), { p: [0, 5.2, -4.3] }, 'gem');
    addSkull(B, 4.6, { p: [0, -2.4, 3.2], r: [8, 0, 0] });

    // swept wings
    const wing = [
      [4.5, -1.5], [8.5, -5.4], [10.4, -2.8], [13.2, -6.6], [15.0, -3.2], [18.0, -7.0], [19.6, -2.8], [22.6, -5.4],
      [24.4, -0.6], [26.6, 6.0], [27.4, 13.6], [24.6, 11.4], [20.4, 9.6], [15.6, 8.6], [10.8, 7.6], [6.0, 6.0], [4.5, 4.5],
    ];
    const covert = [[5.0, 0.2], [9.5, -1.8], [14.0, -2.0], [18.5, -0.6], [22.0, 2.4], [24.6, 7.0], [21.0, 7.6], [15.0, 6.6], [9.0, 5.6], [5.0, 4.4]];
    const quill = [[5.0, 2.6], [12.0, 3.0], [19.0, 4.8], [24.0, 9.2], [25.2, 10.8], [19.4, 7.6], [12.0, 5.4], [5.0, 4.6]];
    B.mirrorX(() => {
      B.add(extrude(wing, 3.0, { bevel: 0.6, center: true }), { p: [0, 3.8, 0] }, 'wing');
      for (const sz of [-1, 1]) {
        B.add(extrude(covert, 1.1, { bevel: 0.3 }), { p: [0, 3.8, sz > 0 ? 1.2 : -2.3] }, 'covert');
        B.add(extrude(quill, 0.9, { bevel: 0.25 }), { p: [0, 3.8, sz > 0 ? 2.2 : -3.1] }, 'quill');
      }
      // eyelet under the wing for the chain
      B.add(torus(1.5, 0.6, 5, 10), { p: [16.6, -2.8, 0], r: [0, 90, 0] }, 'eyelet');
    });

    // grip
    const grip = [];
    grip.push([3.4, 0], [3.4, 1.4], [2.8, 1.8]);
    for (let i = 0; i < 10; i++) {
      const y = 2.2 + i * 2.1;
      grip.push([2.75, y], [3.2, y + 0.7], [3.2, y + 1.3], [2.75, y + 2.0]);
    }
    grip.push([2.9, 23.6], [3.6, 24.0], [3.6, 25.4], [2.6, 26.0]);
    B.add(lathe(grip, 14), { p: [0, 7.2, 0] }, 'grip');
    // pommel: flared collar, faceted orb, spike
    B.add(lathe([[2.4, 0], [4.2, 1.6], [4.6, 2.6], [3.0, 3.4]], 12), { p: [0, 32.6, 0] }, 'pommel');
    B.add(sphere(4.6, 8, 6), { p: [0, 39.6, 0] }, 'pommel');
    B.add(torus(4.6, 0.75, 5, 16), { p: [0, 39.6, 0] }, 'pommelband');
    B.add(lathe([[2.2, 0], [1.6, 1.6], [0.6, 4.2], [0, 5.0]], 8), { p: [0, 43.4, 0] }, 'pommelspike');
  });

  // ------------------------------------------------------------ chains from the wing eyelets
  const tiltQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, (-3.5 * Math.PI) / 180));
  for (const [side, n] of [[1, 6], [-1, 4]]) {
    const eye = V(side * 16.6, -2.8, 0).applyQuaternion(tiltQ).add(V(0, GUARD_Y, 0));
    for (let i = 0; i < n; i++) {
      const y = eye.y - 2.6 - i * 3.3;
      B.add(torus(1.45, 0.55, 5, 10), { p: [eye.x + Math.sin(i * 0.9) * 0.15, y, 0], r: [0, i % 2 ? 0 : 90, 0], s: [1, 1.55, 1] }, 'chain');
    }
    if (side > 0) {
      // padlock-style reliquary charm at the end of the long chain
      const y = eye.y - 2.6 - n * 3.3 - 1.6;
      B.add(chamferBox(4.4, 4.8, 2.6, 0.8), { p: [eye.x, y, 0] }, 'charm');
      B.add(hull([[0, 1.4, 0], [0, -1.4, 0], [0.9, 0, 0], [-0.9, 0, 0], [0, 0, 0.6]]), { p: [eye.x, y, 1.3] }, 'charm');
    }
  }

  // ------------------------------------------------------------ wax oath-seal with ribbons on the blade
  {
    const sealY = GUARD_Y - 9.5;
    const p = V(0.6, sealY, 0);
    const front = 2.8; // blade surface ~ z 2.4 + fuller
    // ribbons hang beneath the seal
    for (const [dx, len, ph] of [[-1.6, 17, 0.4], [1.8, 13, 1.7]]) {
      const rows = [];
      for (let i = 0; i <= 7; i++) {
        const t = i / 7;
        rows.push({ y: sealY - 1 - len * t, x0: dx - 1.4 + t * 0.4 * Math.sin(ph), x1: dx + 1.4 + t * 0.4 * Math.sin(ph) });
      }
      B.add(bandLoft(rows, (x, y) => 0.45 * Math.sin((sealY - y) * 0.35 + ph) + 0.15, 0.95, 4), { p: [p.x, 0, front + 0.3] }, 'ribbon');
      // swallow-cut ribbon ends
      const yEnd = sealY - 1 - len;
      B.add(hull([[dx - 1.4, yEnd + 0.4, 0], [dx + 1.4, yEnd + 0.4, 0], [dx - 1.4, yEnd - 1.6, 0], [dx + 1.4, yEnd - 0.6, 0], [dx - 1.4, yEnd + 0.4, 0.95], [dx + 1.4, yEnd + 0.4, 0.95], [dx - 1.4, yEnd - 1.6, 0.95], [dx + 1.4, yEnd - 0.6, 0.95]]), { p: [p.x, 0, front + 0.3 - 0.47 + 0.45 * Math.sin(len * 0.35 + ph) + 0.15] }, 'ribbon');
    }
    // the seal disc: irregular wax blob with stamped rim and sigil
    const seal = lathe([[4.6, 0], [4.9, 0.5], [4.7, 1.3], [4.0, 1.7], [3.4, 1.5], [3.0, 1.9], [0, 2.1]], 16);
    deform(seal, (v) => {
      const a = Math.atan2(v.z, v.x);
      const k = 1 + 0.07 * Math.sin(a * 5 + 1) + 0.04 * Math.sin(a * 9);
      v.x *= k;
      v.z *= k;
    });
    B.add(seal, { p: [p.x, p.y, front - 0.2], r: [90, 0, 0] }, 'seal');
    // sigil: small raised crown of three points over a bar
    B.add(chamferBox(3.6, 0.8, 0.8, 0.2), { p: [p.x, p.y - 0.8, front + 2.0] }, 'sigil');
    for (const dx of [-1.2, 0, 1.2]) B.add(hull([[dx - 0.5, -0.4, 0], [dx + 0.5, -0.4, 0], [dx, dx === 0 ? 1.8 : 1.2, 0], [dx, 0, 0.7]]), { p: [p.x, p.y, front + 1.75] }, 'sigil');
  }

  return B;
}
