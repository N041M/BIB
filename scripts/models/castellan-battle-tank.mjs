// Castellan pattern heavy battle tank (~113 mm long incl. gun).
// Built Y-up, hull pointing +X, Z lateral.
import {
  Builder, V, box, chamferBox, hull, cyl, cylBetween, lathe, ring, sphere, torus, rivet, extrude,
  circlePts, roundPoly, offsetPoly, pathSampler, rivetLine, addSkull, gothicArchPts, qAlignY,
} from './lib.mjs';

export default function build() {
  const B = new Builder('castellan-battle-tank', 1101);

  // ------------------------------------------------------------------ tracks
  const loopRaw = [[-34, 1.4], [31, 1.4], [43, 12], [43.5, 20.5], [39.5, 25.2], [-40, 25.2], [-44.5, 20], [-44.5, 11]];
  const loop = roundPoly(loopRaw, 4.5, 3); // track centre-line (CCW)
  const TW = 15; // tread width
  const ZC = 22.6; // track unit centre (z)
  const FACE = ZC + 6.6; // outer face of the track frame

  B.mirrorZ(() => {
    B.group({ p: [0, 0, ZC] }, () => {
      // frame + band in one solid
      B.add(extrude(offsetPoly(loop, -0.9), 13.2, { bevel: 0.6, center: true }), {}, 'trackframe');
      // tread blocks with grousers
      const path = pathSampler(loop.slice().reverse(), true);
      const n = Math.round(path.length / 5.0);
      const step = path.length / n;
      for (let i = 0; i < n; i++) {
        const s = path.at(i * step);
        // outward normal for the reversed (CW) path is to the left
        const nx = -s.ty, ny = s.tx;
        const ang = Math.atan2(s.ty, s.tx) * (180 / Math.PI);
        const off = 0.9 + 0.8;
        B.add(box(4.0, 1.7, TW), { p: [s.x + nx * off, s.y + ny * off, 0], r: [0, 0, ang] }, 'tread');
        B.add(box(1.3, 1.0, TW - 1.0), { p: [s.x + nx * (off + 1.1), s.y + ny * (off + 1.1), 0], r: [0, 0, ang] }, 'grouser');
      }
    });

    // road wheels, sprocket and idler on the outer face
    for (let i = 0; i < 6; i++) {
      const x = -30 + i * 11.6;
      B.group({ p: [x, 7.6, FACE], r: [90, 0, 0] }, () => {
        B.add(lathe([[5.1, 0], [5.1, 2.0], [3.6, 2.7], [1.6, 3.2]], 14), { p: [0, -1.2, 0] }, 'wheel');
      });
    }
    // drive sprocket (front)
    const teeth = [];
    const NT = 11;
    for (let i = 0; i < NT * 2; i++) {
      const a = (i / (NT * 2)) * Math.PI * 2;
      const r = i % 2 ? 5.4 : 7.0;
      const da = i % 2 ? 0.1 : -0.1;
      teeth.push([Math.cos(a - 0.08) * r, Math.sin(a - 0.08) * r], [Math.cos(a + 0.08 + da * 0) * r, Math.sin(a + 0.08) * r]);
    }
    for (const [sx, sy, rad] of [[37.6, 16.2, 1], [-39.4, 15.6, 0]]) {
      B.group({ p: [sx, sy, FACE - 0.5] }, () => {
        if (rad) B.add(extrude(teeth, 2.4, { bevel: 0.3 }), {}, 'sprocket');
        else B.add(cyl(6.2, 6.2, 2.4, 18), { p: [0, 0, 1.2], r: [90, 0, 0] }, 'idler');
        B.add(cyl(3.4, 3.8, 1.6, 12), { p: [0, 0, 2.6], r: [90, 0, 0] }, 'hub');
        B.add(cyl(1.4, 1.6, 1.2, 8), { p: [0, 0, 3.6], r: [90, 0, 0] }, 'hub');
        for (const [cx, cy] of circlePts(2.6, 4, 0.4)) B.add(rivet(0.55), { p: [cx, cy, 3.3], r: [90, 0, 0] }, 'rivet');
      });
    }

    // armoured track skirt with gothic access hatch
    const skirt = [[-35.5, 14.2], [31.5, 14.2], [34, 16.5], [34, 26.5], [32.5, 28.2], [-34, 28.2], [-35.5, 26.5]];
    B.add(extrude(skirt, 3.2, { bevel: 0.7 }), { p: [0, 0, FACE - 0.4] }, 'skirt');
    // raised lower lip strip
    B.add(chamferBox(66, 1.6, 1.2, 0.35), { p: [-1, 15.6, FACE + 3.0] }, 'skirtstrip');
    B.add(chamferBox(66, 1.4, 1.2, 0.35), { p: [-1, 26.8, FACE + 3.0] }, 'skirtstrip');
    rivetLine(B, [-33, 15.6, FACE + 3.6], [30, 15.6, FACE + 3.6], 9, [0, 0, 1], 0.6);
    rivetLine(B, [-33, 26.8, FACE + 3.6], [30, 26.8, FACE + 3.6], 9, [0, 0, 1], 0.6);
    // pointed-arch hatch plate
    const arch = gothicArchPts(10, 2.5, 10, 6, 0, 0);
    B.add(extrude(arch, 1.6, { bevel: 0.45 }), { p: [-2, 17.0, FACE + 2.6] }, 'hatch');
    B.add(extrude(offsetPoly(arch, 1.5), 1.2, { bevel: 0.3 }), { p: [-2, 17.0, FACE + 3.8] }, 'hatch');
    B.add(box(3.4, 0.9, 1.0), { p: [-2, 20.5, FACE + 5.2] }, 'handle');
    // side vision/armour panels either side of the hatch
    for (const x of [-22, 18]) {
      B.add(chamferBox(13, 7.5, 1.2, 0.4), { p: [x, 21.2, FACE + 3.2] }, 'panel');
      for (const [dx, dy] of [[-5.3, -2.6], [5.3, -2.6], [-5.3, 2.6], [5.3, 2.6]]) {
        B.add(rivet(0.55), { p: [x + dx, 21.2 + dy, FACE + 3.75], r: [90, 0, 0] }, 'rivet');
      }
    }
  });

  // ------------------------------------------------------------------ hull
  const lower = [[-43, 5], [38, 5], [45.2, 15], [45.2, 19.5], [40, 26.5], [-44, 26.5], [-45.6, 22]];
  B.add(extrude(lower, 32.4, { bevel: 0.6, center: true }), {}, 'lowerhull');

  // upper casemate deck, overhanging the tracks
  const deckPts = [];
  for (const z of [-1, 1]) {
    deckPts.push(
      [-45.5, 25, z * 26.5], [35.5, 25, z * 26.5],
      [37, 27.4, z * 23], [-46.2, 28.4, z * 25.8],
      [-43.6, 33.5, z * 23], [22, 33.5, z * 23],
    );
  }
  B.add(hull(deckPts), {}, 'deck');
  // glacis plate (appliqué) & deck edge strips
  B.add(hull([[34, 26.2, -17], [34, 26.2, 17], [23, 33.4, -15], [23, 33.4, 15], [33, 27.4, -17], [33, 27.4, 17], [22.6, 34.5, -15], [22.6, 34.5, 15]]), {}, 'glacis');
  rivetLine(B, [33.8, 27.0, -15.5], [33.8, 27.0, 15.5], 6, [0.6, 1, 0], 0.6);
  rivetLine(B, [23.4, 34.3, -13.5], [23.4, 34.3, 13.5], 5, [0.6, 1, 0], 0.6);
  B.mirrorZ(() => {
    B.add(chamferBox(66, 1.2, 1.4, 0.35), { p: [-11, 33.4, 22.6] }, 'deckedge');
    rivetLine(B, [-42, 33.9, 22.6], [20, 33.9, 22.6], 10, [0, 1, 0], 0.55);
    rivetLine(B, [-44, 27.0, 25.9], [34, 27.0, 25.9], 11, [0, 0.4, 1], 0.6);
  });

  // front lower plate: hull gun in ball mount + headlights + skull
  B.add(sphere(3.8, 12, 8), { p: [45.0, 17.2, 0] }, 'ballmount');
  B.add(cyl(1.3, 1.5, 11, 10), { p: [52, 17.2, 0], r: [0, 0, -90] }, 'hullgun');
  B.add(cyl(1.9, 1.9, 2.0, 10), { p: [57.2, 17.2, 0], r: [0, 0, -90] }, 'hullgun');
  B.mirrorZ(() => {
    B.add(cyl(2.0, 2.4, 3.0, 10), { p: [45.6, 21.8, 10.5], r: [0, 0, -90] }, 'headlight');
    B.add(cyl(1.6, 1.6, 0.8, 10), { p: [47.4, 21.8, 10.5], r: [0, 0, -90] }, 'headlight');
  });
  addSkull(B, 7.2, { p: [42.3, 20.5, 0], r: [0, 90, 0], s: 1 });

  // driver hatch + vision block on the deck
  B.add(cyl(4.2, 4.6, 1.4, 12), { p: [14, 34.0, 10] }, 'hatch');
  B.add(cyl(2.4, 2.4, 0.9, 10), { p: [14, 35.0, 10] }, 'hatch');
  B.add(chamferBox(3, 2.2, 7, 0.5), { p: [20, 34.4, 10] }, 'vision');
  B.add(cyl(4.2, 4.6, 1.4, 12), { p: [14, 34.0, -10] }, 'hatch');
  B.add(cyl(2.4, 2.4, 0.9, 10), { p: [14, 35.0, -10] }, 'hatch');

  // engine grille
  B.add(chamferBox(14, 1.4, 30, 0.5), { p: [-35, 33.8, 0] }, 'grille');
  for (let i = 0; i < 6; i++) B.add(box(1.1, 1.2, 27), { p: [-40.5 + i * 2.2, 35.0, 0] }, 'slat');

  // rear plate, exhausts, rear stowage
  B.mirrorZ(() => {
    B.group({ p: [-48.6, 0, 17] }, () => {
      B.add(cyl(2.6, 2.6, 22, 14), { p: [0, 28, 0] }, 'exhaust');
      for (const y of [25, 31]) B.add(cyl(3.4, 3.4, 1.4, 12), { p: [0, y, 0] }, 'exhaustring');
      B.add(cyl(3.5, 2.7, 2.2, 14), { p: [0, 39.6, 0] }, 'exhaustcap');
      B.add(cyl(1.9, 3.5, 1.6, 14), { p: [0, 41.5, 0] }, 'exhaustcap');
      B.add(chamferBox(5, 3, 3, 0.5), { p: [2.2, 24, 0] }, 'bracket');
      B.add(chamferBox(5, 3, 3, 0.5), { p: [2.2, 34, 0] }, 'bracket');
    });
  });
  B.add(chamferBox(4, 10, 20, 0.6), { p: [-47.2, 16, 0] }, 'rearbox');
  for (const y of [12.5, 19.5]) B.add(box(1.0, 1.2, 21), { p: [-49.2, y, 0] }, 'strap');

  // stowage on the deck: crate + fuel drum + tarp roll
  B.add(chamferBox(11, 5.5, 7.5, 0.7), { p: [-23, 36.2, 16.5] }, 'crate');
  B.add(box(1.0, 6.0, 8.2), { p: [-25.5, 36.2, 16.5] }, 'strap');
  B.add(box(1.0, 6.0, 8.2), { p: [-20.5, 36.2, 16.5] }, 'strap');
  B.add(lathe([[3.0, 0], [3.2, 0.3], [3.2, 9.4], [3.0, 9.7]], 14), { p: [-23, 36.6, -16.5], r: [90, 0, 90] }, 'drum');
  for (const x of [-26, -20]) B.add(torus(3.2, 0.45, 5, 14), { p: [x, 36.6, -16.5], r: [0, 90, 0] }, 'drumrib');

  // ------------------------------------------------------------------ turret
  B.group({ p: [-5, 33.5, 0] }, () => {
    B.add(cyl(15.5, 16.2, 2.6, 28), { p: [0, 1.2, 0] }, 'turretring');
    const tp = [];
    for (const z of [-1, 1]) {
      tp.push(
        [-19.5, 2, z * 11], [-17, 2, z * 15.6], [10, 2, z * 16.2], [18.5, 2, z * 9],
        [-18, 12.4, z * 9], [-15, 12.4, z * 12.4], [7.5, 12.4, z * 12.6], [14, 12.4, z * 7],
      );
    }
    B.add(hull(tp), {}, 'turret');
    // appliqué cheek armour
    B.mirrorZ(() => {
      B.add(hull([[13.6, 3, 10.6], [5, 3, 16.9], [12, 10.4, 8.3], [5, 10.4, 13.3], [12.6, 3, 9.4], [4.6, 3, 15.8], [11.2, 10.4, 7.6], [4.6, 10.4, 12.5]]), {}, 'cheek');
      rivetLine(B, [-14, 12.4, 11.4], [6, 12.4, 11.6], 6, [0, 1, 0], 0.55);
      // smoke launchers
      B.add(chamferBox(5, 3.4, 4.2, 0.5), { p: [-2, 7.5, 16.2] }, 'smokebox');
      for (let i = 0; i < 3; i++) {
        B.add(cyl(0.95, 0.95, 4.6, 8), { p: [-0.6 + i * 0.1, 8.8 + i * 0.1, 15.0 + i * 1.3], r: [0, 0, -55] }, 'smoke');
      }
      // spare track links as appliqué
      for (let i = 0; i < 3; i++) B.add(box(4.0, 4.4, 1.4), { p: [-12 + i * 4.6, 6.5, 15.9], r: [0, -3, 0] }, 'sparelink');
    });
    // rear bustle stowage bin
    B.add(chamferBox(9, 7.5, 22, 0.8), { p: [-22, 7.0, 0] }, 'bustle');
    for (const z of [-6.5, 0, 6.5]) B.add(box(9.6, 8.0, 1.0), { p: [-22, 7.0, z] }, 'strap');

    // mantlet + main gun
    B.add(chamferBox(7, 9.6, 15, 1.4), { p: [19.2, 7.2, 0] }, 'mantlet');
    B.add(cyl(4.3, 4.3, 3.0, 16), { p: [23.6, 7.2, 0], r: [0, 0, -90] }, 'gunbase');
    B.group({ p: [24.5, 7.2, 0], r: [0, 0, -90] }, () => {
      B.add(lathe([[3.3, 0], [3.3, 3], [2.9, 4.2], [2.8, 11], [3.5, 11.6], [3.5, 16], [2.7, 16.6], [2.45, 34], [2.9, 34.4], [2.9, 35.4]], 18), {}, 'barrel');
    });
    // muzzle brake with real side vents
    const mb = [[0, -2.7], [7.2, -2.7], [7.2, 2.7], [0, 2.7]];
    const holes = [
      [[1.4, -1.6], [3.0, -1.6], [3.0, 1.6], [1.4, 1.6]].reverse(),
      [[4.2, -1.45], [5.8, -1.45], [5.8, 1.45], [4.2, 1.45]].reverse(),
    ];
    B.add(extrude(mb, 5.6, { bevel: 0.45, holes, center: true }), { p: [59.4, 7.2, 0] }, 'muzzle');
    B.add(cyl(1.9, 2.1, 0.8, 12), { p: [66.8, 7.2, 0], r: [0, 0, -90] }, 'muzzle');

    // commander cupola + hatch + pintle gun
    B.group({ p: [-6, 12.2, -5.5] }, () => {
      B.add(cyl(5.8, 6.3, 3.4, 18), { p: [0, 1.7, 0] }, 'cupola');
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.3;
        B.add(chamferBox(2.4, 1.4, 1.2, 0.3), { p: [Math.cos(a) * 6.0, 2.2, Math.sin(a) * 6.0], r: [0, -a * 57.3, 0] }, 'periscope');
      }
      B.add(cyl(5.2, 5.4, 1.2, 18), { p: [0, 4.0, 0] }, 'hatchlid');
      B.add(torus(1.5, 0.45, 5, 10, Math.PI), { p: [0, 4.7, 0] }, 'handle');
      B.add(cyl(0.9, 0.9, 4.0, 8), { p: [-5.2, 4.2, 0], r: [90, 0, 0] }, 'hinge');
      // pintle mount
      B.add(cyl(0.85, 0.85, 4.5, 8), { p: [3.5, 5.2, 3.5] }, 'pintle');
      B.group({ p: [3.5, 7.8, 3.5] }, () => {
        B.add(chamferBox(6, 2.4, 2.6, 0.4), { p: [0.5, 0, 0] }, 'stubber');
        B.add(cyl(0.65, 0.65, 7, 8), { p: [6.5, 0.4, 0.55], r: [0, 0, -90] }, 'stubber');
        B.add(cyl(0.65, 0.65, 7, 8), { p: [6.5, 0.4, -0.55], r: [0, 0, -90] }, 'stubber');
        B.add(chamferBox(2.6, 2.6, 2.2, 0.3), { p: [0.5, -1.4, -2.4] }, 'ammo');
        B.add(chamferBox(1.2, 3.6, 4.2, 0.25), { p: [3.2, 0.6, 0] }, 'gunshield');
      });
    });
    // loader hatch
    B.add(cyl(4.0, 4.3, 1.2, 16), { p: [-6, 12.9, 6.5] }, 'hatch');
    B.add(box(3.0, 0.9, 0.9), { p: [-6, 13.8, 6.5] }, 'handle');

    // searchlight on right cheek
    B.group({ p: [6, 13.6, 9.5] }, () => {
      B.add(chamferBox(2.0, 2.4, 2.0, 0.3), { p: [0, -0.2, 0] }, 'bracket');
      B.add(cyl(2.4, 2.0, 4.6, 14), { p: [1.0, 2.5, 0], r: [0, 0, -90] }, 'searchlight');
      B.add(cyl(2.7, 2.7, 0.8, 14), { p: [3.6, 2.5, 0], r: [0, 0, -90] }, 'searchlight');
      B.add(cyl(1.9, 1.9, 0.6, 14), { p: [4.1, 2.5, 0], r: [0, 0, -90] }, 'lens');
    });

    // antenna
    B.add(cyl(1.5, 1.8, 1.8, 10), { p: [-16, 12.6, -8] }, 'antennabase');
    B.add(cylBetween(V(-16, 13, -8), V(-19, 36, -9.5), 0.6, 6, 0.5), {}, 'antenna');
    B.add(sphere(1.0, 8, 6), { p: [-19, 36, -9.5] }, 'antennatip');
  });

  return B;
}
