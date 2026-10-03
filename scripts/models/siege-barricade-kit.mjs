// Siege barricade kit: sandbag wall, girder tank-trap, ribbed barrels, strapped
// ammo crates, razor-wire coil and a skull pike, clustered on a thin base.
import {
  Builder, V, box, chamferBox, hull, cyl, cylBetween, lathe, latheLoop, capsule, torus, rivet, extrude,
  roundPoly, tube, curveFrom, deform, addSkull, partsBBox, THREE,
} from './lib.mjs';

export default function build() {
  const B = new Builder('siege-barricade-kit', 4404);
  const rng = B.rng;
  const BT = 2.6; // base thickness

  // ------------------------------------------------------------ base
  const raw = [];
  const NB = 18;
  for (let i = 0; i < NB; i++) {
    const a = (i / NB) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    // superellipse-ish 100 x 60 footprint with slight irregularity
    const ex = Math.sign(ca) * Math.pow(Math.abs(ca), 0.45) * 50;
    const ez = Math.sign(sa) * Math.pow(Math.abs(sa), 0.45) * 30;
    const j = 1 + (rng() - 0.5) * 0.05;
    raw.push([ex * j, ez * j]);
  }
  const outline = roundPoly(raw, 4, 2);
  B.add(extrude(outline, BT, { bevel: 0.8, bevelT: 0.8 }), { r: [90, 0, 0], p: [0, BT, 0] }, 'base');
  // ground clutter: pebbles
  for (let i = 0; i < 26; i++) {
    const x = rng.range(-44, 44), z = rng.range(-24, 24);
    const s = rng.range(0.7, 1.6);
    const pts = [];
    for (let k = 0; k < 8; k++) pts.push([rng.range(-1, 1) * s, rng.range(0, 0.8) * s, rng.range(-1, 1) * s]);
    pts.push([0, -0.4, 0]);
    B.add(hull(pts), { p: [x, BT, z] }, 'pebble');
  }

  // ------------------------------------------------------------ sandbag wall
  const bag = () => {
    const g = capsule(3.0, 4.6, 3, 10);
    g.rotateZ(Math.PI / 2);
    const n = B.noise, o = rng() * 50;
    deform(g, (v) => {
      v.y *= 0.62;
      if (v.y < -0.8) v.y = -0.8 - (v.y + 0.8) * 0.35; // flattened underside
      const end = Math.min(1, Math.max(0, (Math.abs(v.x) - 2.0) / 3.2));
      v.y *= 1 - 0.35 * end * end;
      v.z *= 1 - 0.25 * end * end;
      const pinch = 1;
      v.z *= 1.08;
      v.y *= 1 - 0.06 * Math.abs(v.x / 6);
      v.multiplyScalar(1);
      v.z *= 0.96 + 0.04 * pinch;
      const k = 1 + n(v.x * 0.5 + o, v.y * 0.5, v.z * 0.5) * 0.12;
      v.x *= k;
      v.z *= k;
    });
    return g;
  };
  // the wall follows a gentle arc across the back
  const arc = (t) => {
    const x = -44 + t * 62;
    const z = -19 + Math.sin(t * Math.PI) * 4.5;
    return [x, z];
  };
  const layers = [[7, 0], [6, 0.5], [5, 1.0]];
  layers.forEach(([n, shift], li) => {
    for (let i = 0; i < n; i++) {
      const t = (i + shift + 0.5) / 7.0 + li * 0.01;
      const [x, z] = arc(t);
      const [x2, z2] = arc(t + 0.01);
      const yaw = (-Math.atan2(z2 - z, x2 - x) * 180) / Math.PI;
      const y = BT + 1.1 + li * 2.75;
      B.add(bag(), { p: [x + rng.range(-0.4, 0.4), y, z + rng.range(-0.5, 0.5) + li * 0.6], r: [rng.range(-4, 4), yaw + rng.range(-6, 6), rng.range(-3, 3)] }, 'sandbag');
    }
  });
  // a dropped bag in front of the wall
  B.add(bag(), { p: [3, BT + 1.6, -9.6], r: [0, 58, 4] }, 'sandbag');

  // skull pike rising out of the sandbags
  B.add(cylBetween(V(-27, BT, -23.5), V(-26, 33, -22.5), 0.9, 8), {}, 'pike');
  B.add(cyl(1.2, 0.7, 2, 8), { p: [-26.1, 31.5, -22.6] }, 'pike');
  addSkull(B, 6.2, { p: [-26.0, 30.2, -22.4], r: [-6, 18, 0] });
  for (let k = 0; k < 2; k++) B.add(torus(1.25, 0.42, 5, 10), { p: [-26.6 + k * 0.1, 21 + k * 2.2, -23.0], r: [90 + rng.range(-10, 10), 0, 0] }, 'pikebinding');

  // ------------------------------------------------------------ girder tank trap (hedgehog)
  const beamProfile = [[-1.8, -1.9], [1.8, -1.9], [1.8, -0.95], [0.55, -0.95], [0.55, 0.95], [1.8, 0.95], [1.8, 1.9], [-1.8, 1.9], [-1.8, 0.95], [-0.55, 0.95], [-0.55, -0.95], [-1.8, -0.95]];
  const hedgehog = (L, yaw) => {
    const parts = B.sub((S) => {
      const q = new THREE.Quaternion().setFromUnitVectors(V(1, 1, 1).normalize(), V(0, 1, 0));
      S.group({ q }, () => {
        // beam along x, y, z
        S.add(extrude(beamProfile, L, { center: true }), { r: [0, 90, 0] }, 'girder');
        S.add(extrude(beamProfile, L, { center: true }), { r: [90, 0, 90] }, 'girder');
        S.add(extrude(beamProfile, L, { center: true }), { r: [0, 0, 90] }, 'girder');
        S.add(chamferBox(4.6, 4.6, 4.6, 0.9), {}, 'gusset');
        // weld rivets on the gusset
        for (const n of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
          S.add(rivet(0.6), { p: [n[0] * 2.3, n[1] * 2.3, n[2] * 2.3], q: new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), V(...n)) }, 'rivet');
        }
      });
    });
    const bb = partsBBox(parts);
    return { parts, lift: -bb.min.y };
  };
  {
    const h = hedgehog(31, 0);
    B.addParts(h.parts, { p: [-30, BT - 0.6 + h.lift, 7], r: [0, 35, 0] });
  }

  // ------------------------------------------------------------ barrels
  const barrelGeo = () =>
    lathe([
      [4.6, 0], [5.0, 0.3], [5.0, 1.0], [4.8, 1.3], [5.1, 3.6], [5.5, 3.8], [5.5, 4.6], [5.2, 4.8],
      [5.35, 7.5], [5.2, 10.2], [5.5, 10.4], [5.5, 11.2], [5.1, 11.4], [4.8, 13.7], [5.0, 14.0], [5.0, 14.7], [4.6, 15.0],
    ], 20);
  const barrel = (t, lid = true) => {
    B.group(t, () => {
      B.add(barrelGeo(), {}, 'barrel');
      if (lid) {
        B.add(cyl(1.0, 1.1, 0.8, 8), { p: [2.2, 15.2, 0] }, 'bung');
        B.add(latheLoop([[3.9, 14.7], [4.6, 14.7], [4.6, 15.5], [3.9, 15.5]], 20), {}, 'barrelrim');
      }
    });
  };
  barrel({ p: [36, BT - 0.2, -17] });
  barrel({ p: [44.5, BT - 0.2, -8], r: [0, 40, 0] });
  barrel({ p: [47, BT - 0.4 + 5.4, 15.5], r: [0, -14, 90] }, false); // toppled, mouth facing -x
  // spilled puddle at the toppled barrel's mouth
  B.add(cyl(4.6, 5.0, 0.6, 16), { p: [29.0, BT + 0.1, 19.5], s: [1.0, 1, 0.75] }, 'puddle');

  // ------------------------------------------------------------ ammo crates
  const crate = (w, h, d, t, opts = {}) => {
    B.group(t, () => {
      if (opts.open) {
        // open crate: tray walls + floor, with shells inside
        const outer = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
        const inner = [[-w / 2 + 1.2, -d / 2 + 1.2], [w / 2 - 1.2, -d / 2 + 1.2], [w / 2 - 1.2, d / 2 - 1.2], [-w / 2 + 1.2, d / 2 - 1.2]];
        B.add(extrude(outer, h, { holes: [inner] }), { r: [-90, 0, 0] }, 'crate');
        B.add(box(w - 1, 1.2, d - 1), { p: [0, 0.6, 0] }, 'crate');
        const shell = lathe([[1.25, 0], [1.25, 0.6], [1.15, 0.7], [1.15, 4.6], [1.05, 5.4], [0.7, 6.9], [0.25, 7.6]], 10);
        for (let i = 0; i < 3; i++)
          for (let j = 0; j < 2; j++) {
            if (i === 2 && j === 1) continue;
            B.add(shell, { p: [-w / 2 + 3.2 + i * 3.3, 1.1, -d / 2 + 2.9 + j * 3.3] }, 'shell');
          }
        // lid leaning against it
        B.add(chamferBox(w, 1.2, d, 0.3), { p: [0, h * 0.5 + 0.4, d / 2 + 2.5], r: [62, 0, 0] }, 'lid');
        B.add(box(w + 0.4, 1.4, 1.4), { p: [0, h * 0.5 + 0.4, d / 2 + 2.5], r: [62, 0, 0] }, 'lidstrap');
        return;
      }
      B.add(chamferBox(w, h, d, 0.7), { p: [0, h / 2, 0] }, 'crate');
      // lid seam & battens
      B.add(chamferBox(w + 0.2, 0.9, d + 0.2, 0.25), { p: [0, h - 1.8, 0] }, 'crateband');
      // straps
      for (const sx of [-1, 1]) B.add(box(1.4, h + 0.5, d + 0.6), { p: [sx * w * 0.3, h / 2, 0] }, 'strap');
      for (const sx of [-1, 1]) B.add(box(2.0, 1.2, 0.8), { p: [sx * w * 0.3, h * 0.55, d / 2 + 0.5] }, 'buckle');
      // stencil plate + rope handles
      B.add(chamferBox(w * 0.32, h * 0.42, 0.8, 0.2), { p: [0, h * 0.48, d / 2 + 0.2] }, 'stencil');
      B.add(hull([[-1.2, h * 0.62, d / 2 + 0.5], [1.2, h * 0.62, d / 2 + 0.5], [0, h * 0.34, d / 2 + 0.5], [0, h * 0.48, d / 2 + 0.9]]), {}, 'stencil');
      for (const sx of [-1, 1]) B.add(torus(1.4, 0.45, 5, 10), { p: [sx * (w / 2 + 0.2), h * 0.62, 0], r: [0, 90, 0] }, 'handle');
    });
  };
  crate(15, 7.5, 9.5, { p: [14, BT - 0.2, -5.5], r: [0, -6, 0] });
  crate(13, 7, 9, { p: [14.6, BT - 0.2 + 7.5, -5.6], r: [0, 12, 0] });
  crate(15, 7.5, 9.5, { p: [24, BT - 0.2, 6], r: [0, 24, 0] });
  crate(12, 5.0, 9, { p: [-7, BT - 0.2, -2.5], r: [0, -14, 0] }, { open: true });

  // ------------------------------------------------------------ razor wire coil
  {
    const R = 5.6, turns = 8, len = 36;
    const x0 = -14, z0 = 21.5;
    const pts = [];
    const N = Math.round(turns * 14);
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const a = t * turns * Math.PI * 2;
      const wob = 1 + 0.06 * Math.sin(a * 0.5 + 1);
      pts.push(V(x0 + t * len, BT + R + 0.2 + Math.sin(a) * R * wob - 0.25, z0 + Math.cos(a) * R * wob - t * 4));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    B.add(tube(curve, 0.55, N * 2, 5), {}, 'razorwire');
    // barbs
    for (let i = 3; i < N; i += 3) {
      const p = curve.getPointAt(i / N);
      const tg = curve.getTangentAt(i / N);
      const q = new THREE.Quaternion().setFromUnitVectors(V(1, 0, 0), tg);
      B.add(hull([[-1.9, 0, 0], [1.9, 0, 0], [0, 1.0, 0], [0, -1.0, 0], [0, 0, 0.75], [0, 0, -0.75]]), { p: [p.x, p.y, p.z], q }, 'barb');
    }
    // crossed pickets holding each end
    for (const [px, pz] of [[x0 - 1.5, z0], [x0 + len + 1.5, z0 - 4]]) {
      B.add(box(1.4, 15.5, 1.4), { p: [px, BT + 6.6, pz], r: [22, 0, 0] }, 'picket');
      B.add(box(1.4, 15.5, 1.4), { p: [px, BT + 6.6, pz], r: [-22, 0, 0] }, 'picket');
    }
  }

  // ------------------------------------------------------------ battlefield litter
  // abandoned helmet
  B.group({ p: [-2, BT - 0.3, 9], r: [14, 30, -8] }, () => {
    B.add(lathe([[3.5, 0], [3.3, 1.6], [2.7, 3.0], [1.5, 3.9], [0, 4.2]], 14), {}, 'helmet');
    B.add(latheLoop([[3.0, 0], [4.4, 0], [4.4, 0.8], [3.0, 0.9]], 14), {}, 'helmet');
    B.add(chamferBox(1.2, 1.0, 6.4, 0.3), { p: [0, 3.6, 0] }, 'helmet');
  });
  // spent casings
  for (let i = 0; i < 6; i++) {
    const x = rng.range(-6, 6), z = rng.range(3, 14);
    B.add(cyl(0.9, 0.9, 3.6, 8), { p: [x + 4, BT + 0.6, z - 2], r: [90, rng.range(0, 360), 0], o: 'YXZ' }, 'casing');
  }
  // broken planks
  B.add(chamferBox(17, 1.1, 3.4, 0.3), { p: [37, BT + 0.5, 1], r: [0, 28, 2] }, 'plank');
  B.add(chamferBox(11, 1.1, 3.2, 0.3), { p: [36, BT + 1.6, -1.5], r: [0, -12, 8] }, 'plank');

  return B;
}
