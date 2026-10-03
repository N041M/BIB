// Ruined basilica wall section: broken gothic wall with a traceried lancet
// window, quatrefoil oculi, stepped buttresses, tiled plinth and debris.
import {
  Builder, V, box, chamferBox, hull, cyl, lathe, latheLoop, rivet, extrude, circlePts, sweep,
  gothicArchPts, gothicArchHeight, offsetPoly, addSkull, deform, THREE,
} from './lib.mjs';

function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export default function build() {
  const B = new Builder('basilica-ruin', 3303);
  const rng = B.rng;
  const PT = 4.0; // plinth top
  const WZ0 = -15, WZ1 = -3; // wall back/front faces
  const WALLC = (WZ0 + WZ1) / 2;

  // ------------------------------------------------------------ plinth
  B.add(hull([
    [-61, 0, -20], [61, 0, -20], [-61, 0, 20], [61, 0, 20],
    [-60, PT, -19], [60, PT, -19], [-60, PT, 19], [60, PT, 19],
  ]), {}, 'plinth');

  // ------------------------------------------------------------ wall outline
  const top = [
    [54, 56], [51.5, 59.5], [49, 57], [46.5, 58.5], [43, 64.5], [40.5, 62], [37, 63], [34.5, 68.5], [31, 67],
    [28.5, 71], [25, 70], [23, 75.5], [19.5, 78], [17, 76], [14, 77.5], [11.5, 84], [8, 83], [5.5, 86],
    [2.5, 91.5], [-1, 92.5], [-4, 95], [-7.5, 94], [-10.5, 97.5], [-14, 96.5], [-17, 100.5], [-21, 99],
    [-24.5, 101.5], [-27, 105], [-31, 103.5], [-34.5, 104.5], [-38, 108], [-41.5, 106.5], [-45, 108.5],
    [-48, 110.5], [-51, 109], [-54, 110],
  ];
  const outline = [[-54, PT - 0.5], [54, PT - 0.5], ...top];

  const AX = -6, AW = 30, AH0 = 36, SILL = 14;
  const archHole = gothicArchPts(AW, AH0, AW, 12, AX, SILL);
  const apex = SILL + gothicArchHeight(AW, AH0, AW);
  const oculi = [
    { x: -37, y: 80, r: 7 },
    { x: 33, y: 45, r: 6 },
  ];
  const holes = [archHole, ...oculi.map((o) => circlePts(o.r, 20, 0, o.x, o.y))];
  B.add(extrude(outline, WZ1 - WZ0, { holes, bevel: 0.6, curveSegments: 16 }), { p: [0, 0, WZ0] }, 'wall');

  // tracery inside the lancet: mullion, two sub-lancets and an oculus
  const lw = (AW - 2 * 1.8 - 2.6) / 2;
  const lh0 = AH0;
  const trOuter = offsetPoly(archHole, -0.6);
  const lancets = [-1, 1].map((sx) => gothicArchPts(lw, lh0 - 1.8 - sx * 0.04, lw, 8, AX + sx * (1.3 + lw / 2), SILL + 1.8 + sx * 0.04));
  const roseY = SILL + lh0 - 1.8 + gothicArchHeight(lw, 0, lw) + 5.6;
  const rose = circlePts(4.0, 16, 0, AX, roseY);
  B.add(extrude(trOuter, 5.5, { holes: [...lancets, rose], bevel: 0.4 }), { p: [0, 0, WALLC - 2.75] }, 'tracery');
  // small cusps inside the rose
  for (const [cx, cy] of circlePts(2.4, 4, Math.PI / 4)) {
    B.add(cyl(1.0, 1.0, 3.0, 8), { p: [AX + cx, roseY + cy, WALLC], r: [90, 0, 0] }, 'cusp');
  }
  // oculus tracery: disc with four round piercings (quatrefoil)
  for (const o of oculi) {
    const disc = circlePts(o.r + 0.6, 22, 0, o.x, o.y);
    const qh = circlePts(o.r * 0.45, 4, Math.PI / 4).map(([dx, dy]) => circlePts(o.r * 0.27, 12, 0.3, o.x + dx, o.y + dy));
    B.add(extrude(disc, 4.5, { holes: qh, bevel: 0.3 }), { p: [0, 0, WALLC - 2.25] }, 'oculus');
    // moulded ring on the front face
    B.add(latheLoop([[o.r + 0.1, 0], [o.r + 2.4, 0], [o.r + 2.0, 1.4], [o.r + 0.3, 1.4]], 22), { p: [o.x, o.y, WZ1 - 0.2], r: [90, 0, 0] }, 'oculusring');
  }

  // hood moulding: two swept halves meeting under a skull keystone
  {
    const hw = AW / 2 + 1.8, R = AW + 1.8;
    const cyS = SILL + AH0;
    const prof = [[-1.3, 0], [1.3, 0], [0.9, 1.7], [-0.9, 1.7]];
    for (const side of [-1, 1]) {
      const pts = [];
      pts.push(V(AX + side * hw, SILL + 4, WZ1 - 0.2));
      pts.push(V(AX + side * hw, cyS, WZ1 - 0.2));
      // arc from springing to apex (centre on the opposite side)
      const cx = AX - side * (R - hw);
      const dy = Math.sqrt(R * R - (R - hw) * (R - hw));
      const aStart = side > 0 ? 0 : Math.PI;
      const aEnd = side > 0 ? Math.atan2(dy, AX - cx) : Math.atan2(dy, AX - cx);
      for (let i = 1; i <= 10; i++) {
        const a = aStart + ((aEnd - aStart) * i) / 10;
        pts.push(V(cx + Math.cos(a) * R, cyS + Math.sin(a) * R, WZ1 - 0.2));
      }
      const path = new THREE.CurvePath();
      for (let i = 0; i < pts.length - 1; i++) path.add(new THREE.LineCurve3(pts[i], pts[i + 1]));
      B.add(sweep(path, prof, 22, { up: V(0, 0, 1) }), {}, 'hood');
      // label stop (corbel) at the bottom of each hood
      B.add(chamferBox(4.2, 3.4, 3.0, 0.6), { p: [AX + side * hw, SILL + 3.4, WZ1 + 1.0] }, 'corbel');
    }
    addSkull(B, 8.4, { p: [AX, apex + 0.6, WZ1 + 0.4] });
  }
  // window sill
  B.add(chamferBox(AW + 6, 2.6, 4.2, 0.7), { p: [AX, SILL - 0.6, WZ1 + 1.0] }, 'sill');

  // string courses
  B.add(chamferBox(108, 2.4, 3.0, 0.7), { p: [0, SILL - 4.4, WZ1 + 0.6] }, 'course');
  B.add(chamferBox(42, 2.2, 2.6, 0.6), { p: [-33, 91, WZ1 + 0.5] }, 'course');
  // base moulding
  B.add(chamferBox(108, 3.6, 15.5, 0.9), { p: [0, PT + 1.4, WALLC] }, 'basemould');

  // ashlar masonry blocks on the front face (some missing, plaster gone)
  const avoid = [
    { poly: offsetPoly(archHole, -4.5) },
    ...oculi.map((o) => ({ poly: circlePts(o.r + 3.4, 16, 0, o.x, o.y) })),
  ];
  const courseH = 5.2;
  const okBlock = (x0, x1, y, h) => {
    const corners = [[x0, y], [x1, y], [x0, y + h], [x1, y + h], [(x0 + x1) / 2, y + h]];
    if (!corners.every(([px, py]) => pointInPoly(px, py + (py > y ? 1.0 : 0), outline))) return false;
    if (avoid.some((a) => corners.some(([px, py]) => pointInPoly(px, py, a.poly)) || pointInPoly((x0 + x1) / 2, y + h / 2, a.poly))) return false;
    if (Math.abs(y + h / 2 - (SILL - 4.4)) < 3.6 || (Math.abs(y + h / 2 - 91) < 3.6 && x0 < -11)) return false;
    return true;
  };
  for (const face of [{ z: WZ1, dir: 1, thr: 0.32, seed: 3.1 }, { z: WZ0, dir: -1, thr: 0.12, seed: 9.7 }]) {
    let row = 0;
    for (let y = PT + 4.0; y < 112; y += courseH, row++) {
      const off = ((row + (face.dir < 0 ? 1 : 0)) % 2) * 5.5;
      for (let x = -54 + 0.6 - off; x < 54; x += 11) {
        const h = courseH - 0.8;
        const x0 = Math.max(x, -53.4), x1 = Math.min(x + 10.2, 53.4);
        if (x1 - x0 < 3) continue;
        let pieces = [[x0, x1]];
        if (!okBlock(x0, x1, y, h)) {
          const xm = (x0 + x1) / 2;
          pieces = [[x0, xm - 0.45], [xm + 0.45, x1]].filter(([a, b]) => b - a > 2.5 && okBlock(a, b, y, h));
        }
        for (const [a, b] of pieces) {
          const cx = (a + b) / 2;
          if (B.noise(cx * 0.07 + face.seed, (y + h / 2) * 0.09, 0.5) > face.thr) continue; // bare patches
          if (rng() < 0.06) continue;
          const depth = 0.9 + rng() * 0.5;
          B.add(chamferBox(b - a - 0.9, h, depth * 2, 0.35), { p: [cx, y + h / 2, face.z + face.dir * (depth * 0.5 - 0.3)] }, 'ashlar');
        }
      }
    }
  }

  // ------------------------------------------------------------ buttresses
  const butt = (x, broken) => {
    const z0 = WZ1 - 1;
    B.add(chamferBox(13, 46, 16, 0.8), { p: [x, PT + 23, z0 + 8] }, 'buttress');
    B.add(chamferBox(15, 4, 18, 0.8), { p: [x, PT + 2, z0 + 8.4] }, 'buttress');
    // sloped set-off
    B.add(hull([[x - 6.5, PT + 46, z0], [x + 6.5, PT + 46, z0], [x - 6.5, PT + 46, z0 + 16], [x + 6.5, PT + 46, z0 + 16],
      [x - 6.5, PT + 53, z0], [x + 6.5, PT + 53, z0], [x - 6.5, PT + 53, z0 + 10], [x + 6.5, PT + 53, z0 + 10]]), {}, 'setoff');
    if (!broken) {
      B.add(chamferBox(11, 26, 10, 0.7), { p: [x, PT + 66, z0 + 5] }, 'buttress');
      B.add(hull([[x - 5.5, PT + 79, z0], [x + 5.5, PT + 79, z0], [x - 5.5, PT + 79, z0 + 10], [x + 5.5, PT + 79, z0 + 10],
        [x - 5.5, PT + 83, z0], [x + 5.5, PT + 83, z0], [x - 5.5, PT + 83, z0 + 5], [x + 5.5, PT + 83, z0 + 5]]), {}, 'setoff');
      // pinnacle with crockets and finial
      const py = PT + 82, pz = z0 + 3.5;
      B.add(chamferBox(7.4, 6, 7.4, 0.5), { p: [x, py + 3, pz] }, 'pinnacle');
      B.add(cyl(0.01, 5.2, 16, 4, { thetaStart: Math.PI / 4 }), { p: [x, py + 6 + 8, pz] }, 'spire');
      for (let k = 0; k < 3; k++) {
        const yy = py + 9 + k * 4, rr = 4.2 - k * 1.2;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          B.add(chamferBox(1.6, 1.6, 1.6, 0.3), { p: [x + dx * rr, yy, pz + dz * rr], r: [0, 45, 45] }, 'crocket');
        }
      }
      B.add(sphere(1.4, 8, 6), { p: [x, py + 22.5, pz] }, 'finial');
      B.add(cyl(0.6, 0.9, 3.6, 6), { p: [x, py + 25, pz] }, 'finial');
    } else {
      // broken upper stage with a jagged top
      const pts = [];
      for (const dx of [-5.5, 5.5]) for (const dz of [0, 10]) pts.push([x + dx, PT + 52, z0 + dz]);
      pts.push([x - 5.5, PT + 63, z0], [x - 5.5, PT + 59, z0 + 9.5], [x + 5.5, PT + 58.5, z0], [x + 5.5, PT + 55, z0 + 9]);
      B.add(hull(pts), {}, 'buttress');
    }
  };
  butt(-52, false);
  butt(52, true);

  // ------------------------------------------------------------ floor tiles
  for (let ix = -7; ix <= 6; ix++) {
    for (let iz = 0; iz < 3; iz++) {
      const x = ix * 8.2 + 4.1, z = 0.6 + iz * 6.2 + 3.1;
      if (Math.abs(x) > 44 && z < 15) continue; // buttress footprint
      if (rng() < 0.12) continue;
      const tilt = rng() < 0.15 ? rng.range(-6, 6) : 0;
      const lift = tilt ? 0.4 : 0;
      B.add(chamferBox(7.4, 1.0, 5.6, 0.25), { p: [x + rng.range(-0.3, 0.3), PT + 0.35 + lift, z], r: [tilt, rng.range(-3, 3), tilt * 0.6] }, 'tile');
    }
  }

  // ------------------------------------------------------------ fallen column
  const colR = 4.6;
  const drum = (len, seed) => {
    const prof = [[colR * 0.55, -0.01], [colR, 0], [colR, len - 0.6], [colR * 0.5, len]];
    const g = lathe(prof, 12);
    const n = B.noise;
    deform(g, (v) => {
      if (v.y > len - 1.0) v.y += n(v.x * 0.5 + seed, v.z * 0.5, seed) * 2.6 - 0.4;
      if (v.y < 0.1) v.y += n(v.x * 0.5 - seed, v.z * 0.5, seed + 3) * 1.8 - 0.2;
    });
    return g;
  };
  B.add(drum(26, 1.3), { p: [-8, PT + 1.0 + colR - 0.4, 12.5], r: [0, 8, -90] }, 'column');
  B.add(drum(13, 4.1), { p: [24, PT + 1.0 + colR - 0.4, 13.5], r: [0, -24, 92] }, 'column');
  // fluting strips on the long drum
  {
    const ang = (8 * Math.PI) / 180;
    const cx = -8 + Math.cos(ang) * 13, cz = 12.5 - Math.sin(ang) * 13, cy = PT + 1.0 + colR - 0.4;
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + 0.2;
      if (Math.sin(a) < -0.5) continue; // underside, buried in the floor
      const off = colR - 0.15;
      B.add(box(23, 1.2, 1.2), { p: [cx + Math.sin(ang) * Math.cos(a) * off, cy + Math.sin(a) * off, cz + Math.cos(ang) * Math.cos(a) * off], r: [0, 8, 0] }, 'flute');
    }
  }
  // capital block lying near the wall
  B.group({ p: [36, PT + 0.6, 4.8], r: [0, 28, 0] }, () => {
    B.add(chamferBox(11, 3.0, 11, 0.6), { p: [0, 1.5, 0] }, 'capital');
    B.add(lathe([[3.6, 2.8], [5.2, 6.4], [4.4, 7.8]], 12), {}, 'capital');
    B.add(chamferBox(8, 1.8, 8, 0.5), { p: [0, 8.2, 0] }, 'capital');
  });

  // ------------------------------------------------------------ rubble
  const rock = (s) => {
    const pts = [];
    for (let i = 0; i < 10; i++) pts.push([rng.range(-1, 1) * s, rng.range(-0.6, 0.7) * s, rng.range(-1, 1) * s]);
    pts.push([0, -0.7 * s, 0]);
    return hull(pts);
  };
  const piles = [
    [44, 2.2, 10, 3.2], [40, 6, 6, 2.6], [30, 3, 5, 2.2], [16, 1, 6, 1.6], [-28, 1.6, 9, 1.6], [-20, 4.5, 7, 1.4], [46, 13, 12, 2],
  ];
  for (const [x, z, n, sc] of piles) {
    for (let i = 0; i < n; i++) {
      const s = rng.range(0.8, 1.6) * sc;
      B.add(rock(s), { p: [x + rng.range(-4, 4), PT + 0.5 + s * 0.35, z + rng.range(-2, 3)], r: [0, rng.range(0, 360), 0] }, 'rubble');
    }
  }
  // fallen masonry blocks
  B.add(chamferBox(10, 4.6, 6, 0.5), { p: [40, PT + 2.7, 8], r: [12, 34, 8] }, 'block');
  B.add(chamferBox(9.2, 4.6, 5.6, 0.5), { p: [-30, PT + 2.6, 5.5], r: [-6, -18, 4] }, 'block');
  B.add(chamferBox(8, 4.2, 5, 0.5), { p: [12, PT + 3.4, 4], r: [-14, 52, 18] }, 'block');

  return B;
}

function sphere(r, a, b) {
  return new THREE.SphereGeometry(r, a, b);
}
