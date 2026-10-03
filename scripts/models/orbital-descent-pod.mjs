// Orbital descent pod: six armoured petals blooming open around a crew core,
// ogive nose cone with swept stabilisers held aloft on the core column.
import {
  Builder, V, box, chamferBox, hull, cyl, cylBetween, lathe, latheLoop, sphere, torus, rivet, extrude,
  offsetPoly, tube, curveFrom, gothicArchPts, rivetLine,
} from './lib.mjs';

export default function build() {
  const B = new Builder('orbital-descent-pod', 2202);
  const N = 6;
  const APO = 20; // hinge apothem
  const HINGE_Y = 6.2;
  const OPEN = 52; // degrees from vertical
  const L = 31; // petal length
  const W0 = 23.4, W1 = 14.6; // petal widths (bottom/top)

  // ------------------------------------------------------------ base + floor
  B.add(lathe([[22.6, 0], [23.6, 1.0], [23.6, 4.6], [22.2, 6.0], [0, 6.0]], 6), {}, 'base');
  B.add(lathe([[17.5, 5.5], [17.5, 6.6], [16.2, 7.2]], 6), {}, 'floor');
  // retro-skirt band around base
  B.add(latheLoop([[23.4, 1.6], [24.4, 1.9], [24.4, 3.6], [23.4, 3.9]], 6), {}, 'baseband');

  // ------------------------------------------------------------ core column
  B.add(lathe([[7.2, 6], [7.2, 9], [6.2, 10], [6.2, 40], [8.5, 42], [8.5, 44]], 24), {}, 'core');
  for (const y of [14, 22, 30, 37]) B.add(latheLoop([[6.0, y], [7.3, y], [7.3, y + 1.4], [6.0, y + 1.4]], 24), {}, 'corering');
  // vertical conduits on the core between seats
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2; // at hex vertices (between seats)
    const x = Math.sin(a) * 6.6, z = Math.cos(a) * 6.6;
    B.add(cyl(1.0, 1.0, 30, 8), { p: [x, 24, z] }, 'conduit');
  }

  // ------------------------------------------------------------ upper hull + nose
  B.add(lathe([[8.0, 40.5], [13.0, 41.5], [14.8, 44.5], [14.8, 47.5], [11.9, 52.4]], 6), {}, 'collar');
  B.add(latheLoop([[14.6, 44.8], [15.8, 45.2], [15.8, 47.0], [14.6, 47.4]], 6), {}, 'collarband');
  // ogive nose
  const ogive = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    ogive.push([11.4 * Math.pow(Math.cos((t * Math.PI) / 2), 0.75), 52 + 23 * t]);
  }
  ogive[ogive.length - 1][0] = 1.4;
  B.add(lathe(ogive, 24), {}, 'nose');
  // armour bands on the nose
  for (const [t, w] of [[0.12, 1.6], [0.42, 1.3]]) {
    const y = 52 + 23 * t;
    const r = 11.4 * Math.pow(Math.cos((t * Math.PI) / 2), 0.75);
    B.add(latheLoop([[r - 1.2, y], [r + 0.8, y], [r + 0.6, y + w], [r - 1.2, y + w]], 24), {}, 'noseband');
  }
  // beacon spike
  B.add(lathe([[1.6, 73.5], [1.2, 78], [0.7, 82]], 10), {}, 'beacon');
  B.add(sphere(1.5, 10, 6), { p: [0, 82.5, 0] }, 'beacon');
  B.add(torus(2.0, 0.55, 5, 12), { p: [0, 76.5, 0], r: [90, 0, 0] }, 'beacon');

  // swept stabiliser fins (4)
  const fin = [[5.0, 70.0], [9.0, 55.0], [18.6, 46.4], [19.8, 48.6], [11.4, 63.0], [6.6, 71.0]];
  for (let i = 0; i < 4; i++) {
    B.group({ r: [0, 45 + i * 90, 0] }, () => {
      // fin profile in (z=r, y) plane -> extrude along x
      B.group({ r: [0, -90, 0] }, () => {
        B.add(extrude(fin, 2.4, { bevel: 0.6, center: true }), {}, 'fin');
      });
    });
  }

  // retro thrusters under the collar (between petals)
  for (let i = 0; i < N; i++) {
    B.group({ r: [0, (i * 360) / N, 0] }, () => {
      B.group({ p: [0, 42.2, 12.6], r: [28, 0, 0] }, () => {
        B.add(lathe([[1.8, 0.8], [1.8, 0], [2.2, -1.2], [3.0, -3.6], [3.2, -4.4]], 12), {}, 'thruster');
        B.add(latheLoop([[2.2, -4.4], [3.2, -4.4], [3.2, -3.8], [2.2, -3.8]], 12), {}, 'thruster');
      });
    });
  }

  // ------------------------------------------------------------ petals + seats
  const petal = [[-W0 / 2, 0], [W0 / 2, 0], [W1 / 2, L], [-W1 / 2, L]];
  const emblemShield = [[-3.6, 4.2], [3.6, 4.2], [3.6, 0.4], [0, -4.4], [-3.6, 0.4]];
  for (let i = 0; i < N; i++) {
    B.group({ r: [0, 30 + (i * 360) / N, 0] }, () => {
      // hinge knuckles on the base
      for (const x of [-8.6, 8.6]) B.add(chamferBox(4.4, 3.6, 4.0, 0.5), { p: [x, HINGE_Y - 0.6, APO - 1.0] }, 'hingeblock');
      B.group({ p: [0, HINGE_Y, APO], r: [OPEN, 0, 0] }, () => {
        B.add(cyl(1.9, 1.9, 21, 12), { p: [0, 0.6, -1.4], r: [0, 0, 90] }, 'hinge');
        // armour plate: z in [-2.6, 0]; inner face (z<-2.6) faces up/in once opened
        B.add(extrude(petal, 2.6, { bevel: 0.6 }), { p: [0, 0, -2.6] }, 'petal');
        // inner face: raised rim frame
        const outer = offsetPoly(petal, 0.4);
        const inner = offsetPoly(petal, 2.4);
        B.add(extrude(outer, 1.2, { holes: [inner] }), { p: [0, 0, -3.6] }, 'rim');
        // heavy side flanges + tip cap on the inner face
        const edgeAng = (Math.atan2((W0 - W1) / 2, L) * 180) / Math.PI;
        B.mirrorX(() => {
          B.add(chamferBox(1.8, L - 1.0, 2.6, 0.45), { p: [(W0 + W1) / 4 - 1.2, L / 2, -3.6], r: [0, 0, edgeAng] }, 'flange');
        });
        B.add(chamferBox(W1 + 0.6, 2.4, 3.0, 0.6), { p: [0, L - 1.2, -3.4] }, 'tipcap');
        // tread bars on the lower inner face
        for (const y of [4.0, 7.2]) B.add(chamferBox(15.6 - y * 0.25, 1.2, 1.2, 0.3), { p: [0, y, -3.1] }, 'tread');
        // emblem: shield plate with descending chevron and ring
        B.group({ p: [0, 18.5, -3.0] }, () => {
          B.add(extrude(emblemShield, 1.4, { bevel: 0.35 }), { p: [0, 0, -1.4], s: [1.3, 1.3, 1] }, 'emblem');
          B.add(extrude([[-3.0, 2.8], [0, -1.6], [3.0, 2.8], [2.2, 3.4], [0, 0.4], [-2.2, 3.4]], 1.0), { p: [0, -0.4, -2.2] }, 'chevron');
          B.add(torus(1.2, 0.45, 5, 10), { p: [0, 4.4, -1.8] }, 'emblemring');
        });
        // rivets around the rim
        rivetLine(B, [-9.0, 1.6, -3.6], [-5.6, 28.6, -3.6], 5, [0, 0, -1], 0.55);
        rivetLine(B, [9.0, 1.6, -3.6], [5.6, 28.6, -3.6], 5, [0, 0, -1], 0.55);
        // outer face: central spine + hydraulic lug
        B.add(chamferBox(3.0, L - 4, 1.4, 0.4), { p: [0, L / 2, 0.5] }, 'spine');
        for (const y of [6, 22]) B.add(chamferBox(W0 - 3 - y * 0.27, 2.2, 1.2, 0.4), { p: [0, y, 0.3] }, 'rib');
        B.add(chamferBox(5.0, 4.0, 3.0, 0.6), { p: [0, 13.5, 1.4] }, 'lug');
      });
      // hydraulic strut from base to petal underside
      const lug = V(0, HINGE_Y, APO).add(V(0, Math.cos((OPEN * Math.PI) / 180), Math.sin((OPEN * Math.PI) / 180)).multiplyScalar(13.5)).add(V(0, -Math.sin((OPEN * Math.PI) / 180), Math.cos((OPEN * Math.PI) / 180)).multiplyScalar(2.2));
      const foot = V(0, 3.0, APO + 2.0);
      const mid = foot.clone().lerp(lug, 0.55);
      B.add(cylBetween(foot, mid, 1.5, 10), {}, 'strut');
      B.add(cylBetween(mid.clone().lerp(foot, 0.1), lug, 0.85, 8), {}, 'strut');
      B.add(chamferBox(4, 2.6, 2.6, 0.4), { p: [0, 3.0, APO + 1.8] }, 'strutbase');

      // restraint seat facing outward
      B.group({ p: [0, 6.2, 0] }, () => {
        B.add(chamferBox(9.4, 17, 2.6, 0.6), { p: [0, 10.0, 7.4] }, 'seatback');
        B.add(chamferBox(7.0, 4.2, 2.4, 0.6), { p: [0, 19.6, 8.2] }, 'headrest');
        B.add(chamferBox(9.4, 2.0, 7.0, 0.5), { p: [0, 5.4, 11.6] }, 'seatpan');
        B.add(chamferBox(6.0, 4.4, 2.0, 0.4), { p: [0, 2.2, 13.6] }, 'seatleg');
        for (const x of [-4.4, 4.4]) B.add(chamferBox(1.2, 3.4, 6.6, 0.3), { p: [x, 7.6, 11.4] }, 'armrest');
        // over-the-shoulder restraint harness
        const h = curveFrom([[-3.4, 16.5, 8.6], [-3.6, 15.6, 11.4], [-2.6, 11.0, 13.4], [0, 9.8, 14.0], [2.6, 11.0, 13.4], [3.6, 15.6, 11.4], [3.4, 16.5, 8.6]]);
        B.add(tube(h, 0.8, 18, 6), {}, 'harness');
        B.add(chamferBox(2.6, 2.2, 1.6, 0.3), { p: [0, 10.0, 14.2] }, 'buckle');
      });
    });
  }

  return B;
}
