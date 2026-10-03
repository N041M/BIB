// Cogitator terminal: gothic lectern-console with a pointed-arch screen, slanted
// keyboard deck of individual keycaps, valve wheels, cables, skull and candles.
import {
  Builder, V, box, chamferBox, hull, cyl, lathe, latheLoop, sphere, torus, extrude, capsule, tube, curveFrom,
  gothicArchPts, addSkull, rivetLine, rivet, THREE,
} from './lib.mjs';

export default function build() {
  const B = new Builder('cogitator-terminal', 7707);
  const rng = B.rng;

  // ------------------------------------------------------------ stepped base
  B.add(chamferBox(70, 3, 55, 0.8), { p: [0, 1.5, 0] }, 'base');
  B.add(chamferBox(63, 2.6, 49, 0.7), { p: [0, 4.2, -0.5] }, 'base');
  const FL = 5.4;

  // ------------------------------------------------------------ cabinet (side profile extruded across X)
  const W = 56;
  const DECK_F = [23.5, 26.6]; // front lip (z, y)
  const DECK_B = [4.0, 33.4]; // back of the deck where the housing starts
  const prof = [
    [-19.5, FL - 0.4], [20.5, FL - 0.4], [20.5, FL + 2.6], [19.0, FL + 3.6], [19.0, 22.6], [23.5, 25.2],
    [DECK_F[0], DECK_F[1]], [DECK_B[0], DECK_B[1]], [-19.5, DECK_B[1]],
  ];
  B.add(extrude(prof, W, { bevel: 0.7, center: true }), { r: [0, -90, 0] }, 'cabinet');
  // deck trim strips along the sides
  const slope = Math.atan2(DECK_B[1] - DECK_F[1], DECK_F[0] - DECK_B[0]);
  const slopeDeg = (slope * 180) / Math.PI;
  const deckLen = Math.hypot(DECK_F[0] - DECK_B[0], DECK_B[1] - DECK_F[1]);
  const deckMid = V(0, (DECK_F[1] + DECK_B[1]) / 2, (DECK_F[0] + DECK_B[0]) / 2);
  for (const sx of [-1, 1]) {
    B.add(chamferBox(2.6, 2.4, deckLen + 1, 0.5), { p: [sx * (W / 2 - 1.0), deckMid.y + 0.9, deckMid.z], r: [slopeDeg, 0, 0] }, 'decktrim');
  }

  // keycaps on the slanted deck
  B.group({ p: [deckMid.x, deckMid.y, deckMid.z], r: [slopeDeg, 0, 0] }, () => {
    const key = cyl(1.45, 2.1, 1.6, 4, { thetaStart: Math.PI / 4 });
    const rows = 4, cols = 11, pitch = 4.0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = (c - (cols - 1) / 2) * pitch + (r % 2) * 0.9;
        if (Math.abs(x) > 22) continue;
        const z = (r - (rows - 1) / 2) * pitch - 1.2;
        B.add(key, { p: [x, 0.7, z], s: [1, 1, 1] }, 'key');
      }
    }
    // space bar + two large function levers
    B.add(chamferBox(20, 1.6, 3.2, 0.5), { p: [0, 0.7, 2 * pitch + 0.2] }, 'key');
    for (const sx of [-1, 1]) {
      B.add(chamferBox(5.5, 1.8, 3.2, 0.5), { p: [sx * 16, 0.8, 2 * pitch + 0.2] }, 'key');
    }
  });

  // front face: gothic access panel, rivets, valve wheels
  const FZ = 19.0;
  {
    const door = gothicArchPts(14, 5, 12, 8, 0, FL + 4.4);
    B.add(extrude(door, 1.4, { bevel: 0.4 }), { p: [0, 0, FZ - 0.3] }, 'door');
    B.add(extrude(gothicArchPts(10, 4, 9, 8, 0, FL + 6.2), 1.0, { bevel: 0.25 }), { p: [0, 0, FZ + 0.9] }, 'door');
    B.add(chamferBox(4.4, 1.2, 1.2, 0.3), { p: [0, FL + 9.4, FZ + 2.1] }, 'doorhandle');
    rivetLine(B, [-26, FL + 4.6, FZ], [-10, FL + 4.6, FZ], 4, [0, 0, 1], 0.6);
    rivetLine(B, [10, FL + 4.6, FZ], [26, FL + 4.6, FZ], 4, [0, 0, 1], 0.6);
    for (const sx of [-1, 1]) {
      const vx = sx * 18.5, vy = FL + 11.6;
      B.add(cyl(1.6, 1.8, 3.2, 10), { p: [vx, vy, FZ + 1.4], r: [90, 0, 0] }, 'valvestem');
      B.group({ p: [vx, vy, FZ + 3.4] }, () => {
        B.add(torus(4.6, 0.75, 6, 18), {}, 'valve');
        for (let k = 0; k < 4; k++) B.add(box(8.6, 0.9, 0.9), { r: [0, 0, 45 + k * 45 * 2] }, 'valve');
        B.add(cyl(1.4, 1.4, 1.6, 8), { r: [90, 0, 0] }, 'valve');
        B.add(sphere(0.9, 6, 4), { p: [0, 4.6, 0.4] }, 'valve');
      });
      // pressure gauge above each valve
      B.add(cyl(2.4, 2.4, 1.4, 14), { p: [sx * 9.2, FL + 15.6, FZ + 0.4], r: [90, 0, 0] }, 'gauge');
      B.add(latheLoop([[1.8, 0], [2.6, 0], [2.6, 0.8], [1.8, 0.8]], 14), { p: [sx * 9.2, FL + 15.6, FZ + 0.9], r: [90, 0, 0] }, 'gauge');
      B.add(box(0.7, 1.8, 0.5), { p: [sx * 9.2 + 0.3, FL + 16.2, FZ + 1.3], r: [0, 0, sx * 35] }, 'needle');
    }
  }
  // side panels on the cabinet: vents
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 4; k++) B.add(chamferBox(1.0, 1.2, 18, 0.25), { p: [sx * (W / 2 + 0.2), FL + 6 + k * 3.2, 0], r: [0, 0, 0] }, 'vent');
    B.add(chamferBox(1.4, 15, 22, 0.4), { p: [sx * (W / 2 - 0.1), FL + 10.6, 0] }, 'sidepanel');
  }

  // ------------------------------------------------------------ screen housing
  const HB = DECK_B[1] - 0.4, HT = 70, HZ0 = -20, HZ1 = 2.6;
  const HW = 50;
  B.add(chamferBox(HW, HT - HB, HZ1 - HZ0, 1.2), { p: [0, (HB + HT) / 2, (HZ0 + HZ1) / 2] }, 'housing');
  // bezel and screen
  const SPR = HB + 11.6;
  B.add(extrude(gothicArchPts(40, SPR - (HB + 1.6), 24, 12, 0, HB + 1.6), 2.6, { holes: [gothicArchPts(31, SPR - (HB + 3.6), 19.5, 12, 0, HB + 3.6)], bevel: 0.5 }), { p: [0, 0, HZ1 - 0.6] }, 'bezel');
  B.add(extrude(gothicArchPts(32, SPR - (HB + 3.0), 20, 12, 0, HB + 3.0), 1.2, { bevel: 0.2 }), { p: [0, 0, HZ1 - 0.5] }, 'screen');
  // glowing script lines on the screen
  const lines = [[-11, 14], [-11, 20], [-11, 9], [-11, 17], [-11, 12], [-11, 6]];
  lines.forEach(([x0, w], i) => {
    const y = HB + 6 + i * 2.6;
    B.add(box(w, 1.1, 1.4), { p: [x0 + w / 2, y, HZ1 + 0.8] }, 'text');
  });
  B.add(box(2.0, 1.6, 0.8), { p: [-11 + 8.5, HB + 6 + 6 * 2.6, HZ1 + 0.8] }, 'cursor');
  // skull-eye sensor in the arch head
  B.add(torus(2.2, 0.6, 5, 14), { p: [0, SPR + 12.2, HZ1 + 0.8] }, 'oculus');
  B.add(sphere(1.5, 10, 6), { p: [0, SPR + 12.2, HZ1 + 0.6] }, 'oculus');
  // corner pilasters with pinnacles
  for (const sx of [-1, 1]) {
    B.add(chamferBox(4.6, HT - HB + 2, 4.6, 0.6), { p: [sx * (HW / 2 - 0.6), (HB + HT) / 2 + 1, HZ1 - 1.4] }, 'pilaster');
    B.add(chamferBox(5.6, 2.0, 5.6, 0.5), { p: [sx * (HW / 2 - 0.6), HT + 2.6, HZ1 - 1.4] }, 'pilaster');
    B.add(cyl(0.05, 2.8, 6.5, 4, { thetaStart: Math.PI / 4 }), { p: [sx * (HW / 2 - 0.6), HT + 6.8, HZ1 - 1.4] }, 'pinnacle');
    B.add(sphere(0.9, 6, 4), { p: [sx * (HW / 2 - 0.6), HT + 10.2, HZ1 - 1.4] }, 'pinnacle');
  }
  // cornice + skull ornament
  B.add(chamferBox(HW - 4, 2.4, HZ1 - HZ0 + 1.6, 0.6), { p: [0, HT + 0.8, (HZ0 + HZ1) / 2] }, 'cornice');
  // pointed pediment with a quatrefoil rose, skull mounted in front
  {
    const ped = [[-17, 0], [17, 0], [17, 2.0], [0, 10.5], [-17, 2.0]];
    const rose = [[0, 5.6], ...[0, 1, 2, 3].map((k) => [Math.cos((k * Math.PI) / 2) * 1.5, 5.6 + Math.sin((k * Math.PI) / 2) * 1.5])];
    B.add(extrude(ped, 3.2, { bevel: 0.6 }), { p: [0, HT + 1.6, -9.5] }, 'pediment');
    B.add(torus(3.0, 0.65, 5, 16), { p: [0, HT + 1.6 + 5.0, -6.2] }, 'rose');
    for (const [dx, dy] of rose.slice(1)) B.add(torus(1.05, 0.42, 4, 10), { p: [dx, HT + 1.6 + 5.0 + dy - 5.6, -6.0] }, 'rose');
    // crockets on the pediment rakes
    for (const sx of [-1, 1]) {
      for (let k = 1; k <= 3; k++) {
        const t = k / 4;
        B.add(lathe([[1.1, 0], [0.8, 1.2], [0, 2.0]], 6), { p: [sx * 17 * (1 - t), HT + 1.6 + 2.0 + 8.5 * t + 0.3, -7.9], r: [0, 0, sx * -40] }, 'crocket');
      }
    }
    B.add(lathe([[1.3, 0], [1.5, 0.9], [0.8, 1.8], [1.0, 2.6], [0, 3.8]], 8), { p: [0, HT + 1.6 + 10.0, -7.9] }, 'finial');
  }
  B.add(chamferBox(14, 2.0, 7, 0.5), { p: [0, HT + 2.8, HZ1 - 4.5] }, 'skullplinth');
  addSkull(B, 9.0, { p: [0, HT + 3.6, HZ1 - 4.6], r: [-8, 0, 0] });
  // braces between housing sides and the cabinet top
  for (const sx of [-1, 1]) {
    B.add(hull([[sx * (HW / 2 - 1), HB, -18], [sx * (HW / 2 - 1), HB, -4], [sx * (HW / 2 - 1), HB + 16, -18], [sx * (HW / 2 + 2.6), HB, -18], [sx * (HW / 2 + 2.6), HB, -5], [sx * (HW / 2 + 2.6), HB + 1.5, -18]]), {}, 'brace');
  }
  // back vents + sockets
  for (let k = 0; k < 5; k++) B.add(chamferBox(30, 1.2, 1.0, 0.25), { p: [0, HB + 18 + k * 3, HZ0 - 0.3] }, 'backvent');
  // candle stubs on the housing top and deck corners
  const candle = (x, y, z, h, r) => {
    B.add(cyl(r * 1.7, r * 1.9, 0.7, 10), { p: [x, y + 0.3, z] }, 'waxpool');
    B.add(cyl(r, r * 1.05, h, 10), { p: [x, y + h / 2, z] }, 'candle');
    B.add(capsule(0.4, Math.min(2.4, h * 0.5), 2, 6), { p: [x + r * 0.9, y + h - 1.4, z + 0.2] }, 'drip');
    B.add(cyl(0.25, 0.25, 1.0, 5), { p: [x, y + h + 0.3, z] }, 'wick');
    B.add(lathe([[0.65, 0], [0.8, 0.8], [0.6, 1.7], [0.3, 2.6], [0, 3.2]], 8), { p: [x, y + h + 0.5, z] }, 'flame');
  };
  candle(-11.5, HT + 2, -2.5, 4.5, 1.3);
  candle(-19.5, HT + 2, -13.5, 3.0, 1.2);
  candle(11.0, HT + 2, -2.0, 5.5, 1.3);
  candle(19.0, HT + 2, -14.5, 3.5, 1.2);
  candle(-25.0, DECK_B[1] - 1.0, 0.8, 3.5, 1.2);

  // ------------------------------------------------------------ cables from the back down to the floor
  const cables = [
    { x: -15, y: HB + 9, r: 1.7, end: [-24, -24] },
    { x: -7, y: HB + 5, r: 1.3, end: [-9, -26] },
    { x: 4, y: HB + 8, r: 1.9, end: [12, -25] },
    { x: 14, y: HB + 13, r: 1.3, end: [24, -23] },
    { x: 19, y: HB + 5, r: 1.1, end: [28, -16] },
  ];
  for (const c of cables) {
    const zb = HZ0 - 0.2;
    const pts = [
      [c.x, c.y, zb + 0.6], [c.x, c.y - 1, zb - 3.2], [(c.x + c.end[0]) / 2, (c.y + FL) * 0.45, zb - 5.8],
      [c.end[0] * 0.95, FL + c.r + 1.6, c.end[1] - 1], [c.end[0], FL + c.r - 0.2, c.end[1] + 3.5],
    ];
    const curve = curveFrom(pts);
    B.add(tube(curve, c.r, 26, 8), {}, 'cable');
    // socket where it enters the housing
    B.add(cyl(c.r + 0.9, c.r + 0.9, 2.2, 10), { p: [c.x, c.y, zb - 0.4], r: [90, 0, 0] }, 'socket');
    // ribbed sleeve on the thick cables
    if (c.r > 1.5) {
      for (let k = 1; k <= 4; k++) {
        const t = 0.12 + k * 0.06;
        const p = curve.getPointAt(t), tg = curve.getTangentAt(t);
        B.add(cyl(c.r + 0.5, c.r + 0.5, 0.9, 10), { p: [p.x, p.y, p.z], q: new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), tg) }, 'cablerib');
      }
    }
  }
  // side feed cable: from the housing's right flank down to the base, visible from the front
  {
    const pts = [[HW / 2 + 0.2, HB + 12, -9], [29.2, HB + 8.5, -7], [30.4, FL + 16, -1], [30.2, FL + 3.2, 10], [29.8, FL + 1.5, 18.5]];
    const curve = curveFrom(pts);
    B.add(tube(curve, 1.5, 24, 8), {}, 'cable');
    B.add(cyl(2.4, 2.4, 2.4, 10), { p: [HW / 2 + 0.4, HB + 12, -9], r: [0, 0, 90] }, 'socket');
    for (let k = 1; k <= 5; k++) {
      const t = 0.15 + k * 0.1;
      const p = curve.getPointAt(t), tg = curve.getTangentAt(t);
      B.add(cyl(2.0, 2.0, 0.9, 10), { p: [p.x, p.y, p.z], q: new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), tg) }, 'cablerib');
    }
    B.add(chamferBox(3.6, 2.6, 4.4, 0.5), { p: [29.8, FL + 1.3, 20.0] }, 'plug');
  }
  // floor junction box the cables run into
  B.add(chamferBox(9, 4, 6, 0.6), { p: [-3, FL + 2, -24.5] }, 'junction');

  return B;
}
