// Reliquary shrine: stepped plinth, two turned columns carrying a pointed-arch
// gable and pitched canopy with spire, reliquary urn, votive candles, banner.
import {
  Builder, V, box, chamferBox, hull, cyl, lathe, latheLoop, sphere, torus, extrude, capsule,
  archCurvePts, gothicArchHeight, bandLoft, addSkull, rivet, THREE,
} from './lib.mjs';

export default function build() {
  const B = new Builder('reliquary-shrine', 5505);
  const rng = B.rng;

  // ------------------------------------------------------------ plinth
  B.add(chamferBox(60, 4, 60, 0.8), { p: [0, 2, 0] }, 'step');
  B.add(chamferBox(51, 4, 50, 0.8), { p: [0, 6, -3] }, 'step');
  B.add(chamferBox(44, 3.2, 40, 0.7), { p: [0, 9.4, -7] }, 'step');
  const FL = 11; // floor level of the shrine
  // inscription plaque on the front of the lowest step
  B.add(chamferBox(26, 2.6, 1.0, 0.3), { p: [0, 2.0, 30.1] }, 'plaque');
  for (const [w, y] of [[20, 2.75], [14, 1.3]]) B.add(box(w, 0.8, 0.8), { p: [0, y, 30.6] }, 'plaquetext');
  // corner studs on the middle step
  for (const sx of [-1, 1]) B.add(lathe([[1.8, 0], [1.6, 0.8], [0.9, 1.6], [0, 2.0]], 8), { p: [sx * 23.5, 8, 19.5] }, 'stud');

  // ------------------------------------------------------------ back wall
  const BZ0 = -26, BZ1 = -21.5;
  const EAVE = 58, RIDGE = 79.5;
  const wallOutline = [[-21, FL - 0.5], [21, FL - 0.5], [21, EAVE], [0, RIDGE], [-21, EAVE]];
  B.add(extrude(wallOutline, BZ1 - BZ0, { bevel: 0.6 }), { p: [0, 0, BZ0] }, 'backwall');
  // blind arch relief on the inside face of the back wall
  {
    const outer = archCurvePts(28, 22, 22, 10, 0, FL + 1.0);
    const inner = archCurvePts(22, 22, 17, 10, 0, FL + 1.0);
    const frame = [...outer, ...inner.slice().reverse()];
    // close bottom between the legs: outer goes L->R, inner returns R->L
    B.add(extrude(frame, 1.6, { bevel: 0.3 }), { p: [0, 0, BZ1 - 0.6] }, 'blindarch');
  }
  // back face: blind arcade relief and string course
  {
    const outer = archCurvePts(26, 20, 20, 10, 0, FL + 2.0);
    const inner = archCurvePts(20, 20, 15, 10, 0, FL + 2.0);
    B.add(extrude([...outer, ...inner.slice().reverse()], 1.6, { bevel: 0.3 }), { p: [0, 0, BZ0 + 0.6], r: [0, 180, 0] }, 'backarch');
    B.add(chamferBox(42.6, 2.0, 2.0, 0.5), { p: [0, EAVE - 1.0, BZ0 - 0.2] }, 'backcourse');
    B.add(lathe([[3.4, 0], [3.4, 0.8], [2.6, 1.4], [0, 1.6]], 16), { p: [0, EAVE + 8.5, BZ0 + 0.4], r: [-90, 0, 0] }, 'backrose');
  }
  // pilasters
  for (const sx of [-1, 1]) {
    B.add(chamferBox(5, EAVE - FL, 4, 0.6), { p: [sx * 18.5, (EAVE + FL) / 2, BZ1 + 1.0] }, 'pilaster');
  }

  // ------------------------------------------------------------ front columns
  const CZ = 9.5, CX = 16.6;
  const colTop = 38;
  const colProf = [
    [4.4, 0], [4.4, 1.6], [3.6, 2.2], [3.9, 3.0], [3.0, 3.8], [2.6, 5.0], [2.6, 9.5], [3.1, 10.2], [2.6, 10.9],
    [2.5, 16.0], [3.1, 16.6], [2.5, 17.3], [2.4, 21.0], [3.0, 21.8], [3.6, 23.0], [4.4, 24.5], [4.4, colTop - FL - 1.6],
  ];
  for (const sx of [-1, 1]) {
    B.add(chamferBox(9.4, 2.2, 9.4, 0.5), { p: [sx * CX, FL + 1.0, CZ] }, 'colbase');
    B.add(lathe(colProf, 16), { p: [sx * CX, FL + 1.6, CZ] }, 'column');
    B.add(chamferBox(10, 2.2, 10, 0.5), { p: [sx * CX, colTop - 0.6, CZ] }, 'capital');
  }

  // ------------------------------------------------------------ gable with pointed arch
  const AW = 23.6, AH0 = 14, AR = 19;
  const arch = archCurvePts(AW, AH0, AR, 12, 0, colTop);
  const gable = [[-21.5, colTop], ...arch, [21.5, colTop], [21.5, EAVE + 1], [0, RIDGE + 2.5], [-21.5, EAVE + 1]];
  const GZ0 = CZ - 2.6, GZ1 = CZ + 2.6;
  B.add(extrude(gable, GZ1 - GZ0, { bevel: 0.7 }), { p: [0, 0, GZ0] }, 'gable');
  // inner arch moulding (proud of the gable face)
  {
    const outer = archCurvePts(AW + 3.6, AH0, AR + 1.8, 12, 0, colTop);
    const frame = [...outer, ...arch.slice().reverse()];
    B.add(extrude(frame, 1.4, { bevel: 0.3 }), { p: [0, 0, GZ1 - 0.2] }, 'archmould');
  }
  // gable coping along the sloped edges + crockets
  const slopeLen = Math.hypot(21.5, RIDGE + 2.5 - EAVE - 1);
  const slopeAng = (Math.atan2(RIDGE + 2.5 - EAVE - 1, 21.5) * 180) / Math.PI;
  for (const sx of [-1, 1]) {
    const mx = sx * 10.75, my = (EAVE + 1 + RIDGE + 2.5) / 2;
    B.add(chamferBox(slopeLen + 2, 2.2, GZ1 - GZ0 + 1.6, 0.5), { p: [mx - sx * 0.5, my + 0.9, CZ], r: [0, 0, sx * -slopeAng] }, 'coping');
    for (let k = 1; k <= 4; k++) {
      const t = k / 5;
      const x = sx * 21.5 * (1 - t), y = EAVE + 1 + (RIDGE + 1.5 - EAVE) * t;
      B.add(lathe([[1.4, 0], [1.1, 1.4], [0.5, 2.4], [0, 2.6]], 6), { p: [x + sx * 0.4, y + 1.5, CZ], r: [0, 0, sx * -30] }, 'crocket');
    }
  }
  // gable finial
  B.add(lathe([[1.8, 0], [2.2, 1.2], [1.2, 2.4], [1.7, 3.6], [1.5, 4.6], [0.6, 5.6], [0.4, 8.0]], 10), { p: [0, RIDGE + 3.6, CZ] }, 'finial');
  B.add(sphere(1.5, 10, 6), { p: [0, RIDGE + 8.6, CZ] }, 'finial');
  // tympanum skull above the arch
  addSkull(B, 6.0, { p: [0, colTop + gothicArchHeight(AW, AH0, AR) + 1.6, GZ1 - 0.4] });

  // ------------------------------------------------------------ pitched canopy
  const roofT = 2.4;
  for (const sx of [-1, 1]) {
    const pts = [];
    for (const z of [BZ0 - 0.6, GZ0 + 0.4]) {
      pts.push([sx * 23.2, EAVE - 2.0, z], [sx * 23.2, EAVE - 2.0 + roofT, z], [0, RIDGE - 0.3, z], [0, RIDGE - 0.3 - roofT * 1.3, z]);
    }
    B.add(hull(pts), {}, 'roof');
    // roof tiles: raised strips
    for (let k = 0; k < 4; k++) {
      const t = (k + 0.5) / 4;
      const x = sx * 23.2 * (1 - t), y = EAVE - 2.0 + roofT + (RIDGE - EAVE + 2.0 - roofT) * t;
      B.add(chamferBox(1.6, 1.4, GZ0 - BZ0 - 0.2, 0.3), { p: [x, y - 0.2, (BZ0 + GZ0) / 2], r: [0, 0, sx * -45] }, 'rooftile');
    }
  }
  B.add(chamferBox(3.0, 2.6, GZ0 - BZ0 + 0.6, 0.6), { p: [0, RIDGE + 0.2, (BZ0 + GZ0) / 2] }, 'ridge');
  // entablature beams along the eaves
  for (const sx of [-1, 1]) B.add(chamferBox(4.0, 4.6, GZ0 - BZ0 + 1, 0.6), { p: [sx * 19.8, EAVE - 2.4, (BZ0 + GZ0) / 2] }, 'beam');

  // spire on the ridge
  {
    const sz = (BZ0 + GZ0) / 2 - 2;
    B.add(chamferBox(6.4, 4.2, 6.4, 0.6), { p: [0, RIDGE + 2.6, sz] }, 'spirebase');
    B.add(cyl(3.0, 3.4, 3.2, 8, { thetaStart: Math.PI / 8 }), { p: [0, RIDGE + 6.2, sz] }, 'spire');
    B.add(cyl(0.05, 3.0, 9.6, 8, { thetaStart: Math.PI / 8 }), { p: [0, RIDGE + 9.4, sz] }, 'spire');
    B.add(sphere(1.2, 8, 6), { p: [0, RIDGE + 13.6, sz] }, 'spireorb');
    B.add(cyl(0.3, 0.7, 1.4, 6), { p: [0, RIDGE + 15.0, sz] }, 'spireorb');
  }

  // ------------------------------------------------------------ reliquary urn on pedestal
  const PZ = -9;
  B.add(chamferBox(13, 4, 12, 0.8), { p: [0, FL + 2, PZ] }, 'pedestal');
  B.add(chamferBox(15, 1.6, 14, 0.5), { p: [0, FL + 4.4, PZ] }, 'pedestal');
  addSkull(B, 3.4, { p: [0, FL + 0.3, PZ + 5.8] });
  B.add(lathe([
    [4.0, 0], [4.0, 0.8], [2.4, 1.4], [2.0, 2.6], [3.6, 3.6], [5.4, 6.0], [5.8, 8.2], [5.2, 10.6], [3.4, 12.0],
    [2.8, 12.6], [3.4, 13.0], [3.8, 13.6], [3.0, 14.4], [2.2, 15.6], [1.0, 16.4], [1.2, 17.0], [1.6, 17.8], [0, 19.4],
  ], 20), { p: [0, FL + 5.2, PZ], s: 0.9 }, 'urn');
  B.add(torus(5.2, 0.55, 5, 20), { p: [0, FL + 5.2 + 6.3, PZ], r: [90, 0, 0] }, 'urnband');
  for (const sx of [-1, 1]) B.add(torus(1.7, 0.55, 5, 10), { p: [sx * 5.4, FL + 5.2 + 8.5, PZ] }, 'urnhandle');

  // ------------------------------------------------------------ banner on the back wall
  {
    const W = 17, top = 54.5, notch = 32.5, bottom = 26.5;
    const wave = (x, y) => 0.6 * Math.sin(x * 0.42 + 0.6) + 0.25 * Math.sin((top - y) * 0.25);
    const bz = BZ1 + 1.4;
    const rows = [];
    for (let i = 0; i <= 7; i++) rows.push({ y: top - ((top - notch + 0.4) * i) / 7, x0: -W / 2, x1: W / 2 });
    B.add(bandLoft(rows, wave, 1.3, 9), { p: [0, 0, bz] }, 'banner');
    for (const side of [-1, 1]) {
      const trows = [];
      for (let i = 0; i <= 4; i++) {
        const t = i / 4;
        const y = notch + 0.4 - (notch + 0.4 - bottom) * t;
        const inner = side * (0.15 + (W / 2 - 1.1) * t);
        const outer = side * (W / 2);
        trows.push({ y, x0: Math.min(inner, outer), x1: Math.max(inner, outer) });
      }
      B.add(bandLoft(trows, wave, 1.3, 5), { p: [0, 0, bz] }, 'banner');
    }
    // emblem on the banner: ring + tower motif
    // emblem: ring around a votive flame over a bowl
    const ey = 44.5;
    B.add(torus(4.2, 0.6, 5, 18), { p: [0, ey, bz + 1.0] }, 'emblem');
    const flame = [];
    for (let i = 0; i <= 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const r = 1.5;
      const yy = Math.sin(a) > 0 ? Math.sin(a) * 3.2 : Math.sin(a) * 1.5;
      flame.push([Math.cos(a) * r * (Math.sin(a) > 0 ? 1 - Math.sin(a) * 0.65 : 1), yy]);
    }
    flame.pop();
    B.add(extrude(flame, 1.0, { bevel: 0.25 }), { p: [0, ey + 0.4, bz + 0.6] }, 'emblem');
    B.add(chamferBox(4.4, 1.2, 1.0, 0.3), { p: [0, ey - 2.0, bz + 1.0] }, 'emblem');
    B.add(box(W + 0.2, 1.2, 1.0), { p: [0, top - 3.0, bz + 0.6] }, 'bannertrim');
    // hanging rod with knobs and wall brackets
    B.add(cyl(0.8, 0.8, W + 6, 8), { p: [0, top + 0.6, bz], r: [0, 0, 90] }, 'rod');
    for (const sx of [-1, 1]) {
      B.add(sphere(1.4, 8, 6), { p: [sx * (W / 2 + 3.2), top + 0.6, bz] }, 'rodknob');
      B.add(chamferBox(1.6, 1.6, 3.4, 0.3), { p: [sx * (W / 2 + 1.2), top + 0.6, bz - 1.6] }, 'bracket');
    }
  }

  // ------------------------------------------------------------ candles
  const candle = (x, y, z, h, r) => {
    B.add(cyl(r * 1.9, r * 2.2, 0.8, 12), { p: [x, y + 0.3, z] }, 'waxpool');
    B.add(cyl(r, r * 1.04, h, 10), { p: [x, y + h / 2, z] }, 'candle');
    B.add(cyl(r * 1.08, r * 0.9, 0.6, 10), { p: [x, y + h - 0.2, z] }, 'candlelip');
    const nd = h > 6 ? 2 : 1;
    for (let k = 0; k < nd; k++) {
      const a = rng() * Math.PI * 2;
      const len = rng.range(1.5, Math.min(4.5, h * 0.55));
      B.add(capsule(0.45, len, 2, 6), { p: [x + Math.cos(a) * r * 0.92, y + h - 0.6 - len / 2, z + Math.sin(a) * r * 0.92] }, 'drip');
    }
    B.add(cyl(0.3, 0.3, 1.0, 5), { p: [x, y + h + 0.4, z] }, 'wick');
    B.add(lathe([[0.75, 0], [0.95, 0.9], [0.75, 1.9], [0.35, 3.0], [0, 3.8]], 8), { p: [x, y + h + 0.5, z] }, 'flame');
  };
  // cluster front-left on the lowest step
  candle(-24.5, 4, 24.0, 12, 1.6);
  candle(-20.4, 4, 25.8, 8, 1.4);
  candle(-25.6, 4, 19.6, 6.5, 1.5);
  candle(-17.2, 4, 27.4, 4.5, 1.3);
  // cluster front-right on the middle step
  candle(21.0, 8, 17.2, 10, 1.5);
  candle(17.2, 8, 18.6, 6, 1.3);
  candle(23.0, 8, 13.8, 4.5, 1.4);
  // pair flanking the urn
  candle(-8.4, FL, 0.5, 7, 1.2);
  candle(8.4, FL, 0.5, 5, 1.2);
  candle(25.5, 4, 26.5, 5.5, 1.3);

  return B;
}
