// Void knight helm bust: armoured helm with slatted mouth grille, angled eye
// lenses and crest, gorget, breastplate and rimmed pauldrons on a turned plinth.
import {
  Builder, V, box, chamferBox, hull, cyl, cylBetween, lathe, latheLoop, sphere, torus, extrude, tube, curveFrom,
  deform, addSkull, rivet, qAlignY, THREE,
} from './lib.mjs';

export default function build() {
  const B = new Builder('void-knight-helm-bust', 8808);

  // ------------------------------------------------------------ turned plinth
  B.add(lathe([
    [21.8, 0], [21.8, 2.0], [20.6, 2.8], [20.6, 4.0], [19.0, 5.0], [17.0, 5.6], [16.2, 7.0], [16.2, 16.0],
    [17.0, 17.0], [18.8, 17.8], [18.8, 20.2], [17.8, 21.0],
  ], 36), {}, 'plinth');
  B.add(latheLoop([[15.9, 8.2], [16.9, 8.4], [16.9, 9.6], [15.9, 9.8]], 36), {}, 'plinthring');
  B.add(latheLoop([[15.9, 13.6], [16.9, 13.8], [16.9, 15.0], [15.9, 15.2]], 36), {}, 'plinthring');
  // name plate on the plinth front
  B.add(chamferBox(15, 3.4, 2.2, 0.5), { p: [0, 11.7, 16.0] }, 'nameplate');
  for (const [w, y] of [[11, 12.4], [7, 10.9]]) B.add(box(w, 0.85, 0.8), { p: [0, y, 17.2] }, 'nametext');
  const PT = 21.0;

  // ------------------------------------------------------------ torso & breastplate
  const ringPts = (y, rx, rz, front = 0, n = 14) => {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      const fz = s > 0 ? front * Math.pow(s, 3) : 0;
      pts.push([c * rx, y, s * rz + fz]);
    }
    return pts;
  };
  B.add(hull([...ringPts(PT - 0.4, 13.5, 9.5), ...ringPts(PT + 9, 16, 11, 1.5), ...ringPts(PT + 19, 18, 12, 2.5), ...ringPts(PT + 27, 16, 10.5, 1)]), {}, 'torso');
  // abdominal bands
  for (let k = 0; k < 2; k++) {
    const y = PT + 1.4 + k * 3.4;
    B.add(hull([...ringPts(y, 14.0 + k * 0.6, 10.4 + k * 0.3, 0.6), ...ringPts(y + 2.6, 14.2 + k * 0.6, 10.6 + k * 0.3, 0.8)]), {}, 'abbands');
  }
  // breastplate: two angled pectoral plates meeting at a central keel
  B.mirrorX(() => {
    B.add(hull([
      [0, PT + 9.0, 12.2], [0, PT + 27.0, 11.8], [13.0, PT + 25.6, 9.2], [15.6, PT + 17, 10.0], [12.0, PT + 9.0, 10.8],
      [0, PT + 9.0, 9], [0, PT + 27.0, 8.6], [13.0, PT + 25.6, 6.4], [15.6, PT + 17, 6.8], [12.0, PT + 9.0, 7.6],
    ]), {}, 'breastplate');
  });
  B.add(hull([[-1.2, PT + 8.8, 12.6], [1.2, PT + 8.8, 12.6], [-1.2, PT + 27.0, 12.2], [1.2, PT + 27.0, 12.2], [0, PT + 8.8, 13.6], [0, PT + 27.0, 13.2], [0, PT + 8.8, 10], [0, PT + 27.0, 10]]), {}, 'keel');
  // chest emblem: haloed skull medallion
  B.add(lathe([[5.2, 0], [5.4, 0.6], [4.6, 1.4], [0, 1.6]], 20), { p: [0, PT + 19.2, 12.4], r: [86, 0, 0] }, 'medallion');
  B.add(torus(5.6, 0.7, 5, 20), { p: [0, PT + 19.2, 12.9], r: [-4, 0, 0] }, 'medallion');
  addSkull(B, 6.0, { p: [0, PT + 16.0, 13.4], r: [-4, 0, 0] });
  // halo spikes around the medallion
  for (let k = 0; k < 7; k++) {
    const a = Math.PI * (0.12 + (0.76 * k) / 6);
    const x = Math.cos(a) * 7.4, y = Math.sin(a) * 7.4;
    B.add(hull([[-0.8, 0, 0], [0.8, 0, 0], [0, 2.4, 0], [0, 0.4, 0.8], [0, 0.4, -0.6]]), { p: [x, PT + 19.2 + y, 12.4], r: [0, 0, (a * 180) / Math.PI - 90] }, 'halo');
  }

  // back armour plate with rivets
  B.add(hull([
    [-11, PT + 6, -10.6], [11, PT + 6, -10.6], [-12.5, PT + 24, -10.6], [12.5, PT + 24, -10.6],
    [-11, PT + 6, -8], [11, PT + 6, -8], [-12.5, PT + 24, -8], [12.5, PT + 24, -8], [0, PT + 15, -11.8],
  ]), {}, 'backplate');
  for (const [x, y] of [[-9, PT + 8], [9, PT + 8], [-10.5, PT + 22], [10.5, PT + 22]]) B.add(rivet(0.7), { p: [x, y, -10.9], r: [-90, 0, 0] }, 'rivet');

  // ------------------------------------------------------------ gorget / collar
  B.add(latheLoop([[7.5, PT + 24.5], [15.2, PT + 24.5], [15.8, PT + 27.0], [13.2, PT + 31.0], [9.6, PT + 32.0], [7.5, PT + 30.0]], 32), { s: [1, 1, 0.92] }, 'gorget');
  B.add(latheLoop([[12.8, PT + 30.4], [14.0, PT + 30.8], [13.4, PT + 32.6], [12.0, PT + 32.4]], 32), { s: [1, 1, 0.92] }, 'gorgetrim');
  // neck
  B.add(cyl(7.4, 8.4, 6, 20), { p: [0, PT + 30.5, -1] }, 'neck');

  // ------------------------------------------------------------ pauldrons
  B.mirrorX(() => {
    const dir = V(0.68, 0.73, 0).normalize();
    const q = qAlignY(dir);
    const c = V(14.4, PT + 23.0, -0.5);
    B.group({ p: [c.x, c.y, c.z], q, s: 0.92 }, () => {
      B.add(lathe([[12.0, -1.0], [12.0, 0.4], [11.2, 3.2], [9.6, 6.0], [7.0, 8.4], [3.8, 9.8], [0, 10.3]], 28), { s: [1, 1, 1.12] }, 'pauldron');
      B.add(latheLoop([[11.2, -1.8], [13.6, -1.8], [13.6, 0.0], [12.7, 1.2], [11.4, 1.2]], 28), { s: [1, 1, 1.12] }, 'pauldronrim');
      // rivets on the rim
      for (let k = 0; k < 9; k++) {
        const a = Math.PI * (0.15 + k * 0.1);
        const n = V(Math.sin(a), 0.55, Math.cos(a) * 1.12).normalize();
        B.add(rivet(0.7), { p: [Math.sin(a) * 13.0, 0.75, Math.cos(a) * 13.0 * 1.12], q: qAlignY(n) }, 'rivet');
      }
      // raised trim band across the dome
      B.add(latheLoop([[10.3, 4.2], [11.0, 4.2], [10.0, 6.0], [9.4, 6.0]], 28), { s: [1, 1, 1.12] }, 'pauldronband');
    });
    // upper arm under the pauldron
    B.add(cylBetween(V(16.4, PT + 24, -0.5), V(18.0, PT + 12.5, -0.5), 5.4, 16, 6.0), {}, 'arm');
    B.add(sphere(5.4, 16, 8), { p: [18.0, PT + 12.5, -0.5], s: [1, 0.55, 1] }, 'arm');
    // armoured bicep band
    B.add(latheLoop([[5.4, 0], [6.3, 0], [6.3, 1.8], [5.4, 1.8]], 16), { p: [17.6, PT + 14.2, -0.5], r: [0, 0, 8] }, 'armband');
  });
  // purity seal on the front of the left pauldron
  {
    const q = qAlignY(V(0.68, 0.73, 0));
    const toWorld = (v) => v.multiplyScalar(0.92).applyQuaternion(q).add(V(14.4, PT + 23.0, -0.5));
    const p = toWorld(V(0, 4.6, 10.2 * 1.12));
    const n = V(0, 4.6, 10.2 * 1.12).applyQuaternion(q).normalize();
    p.x = -p.x;
    n.x = -n.x;
    B.add(lathe([[3.0, -0.6], [3.2, 0.5], [2.6, 1.2], [0, 1.4]], 14), { p: [p.x, p.y, p.z], q: qAlignY(n) }, 'seal');
    for (const [dx, len] of [[-1.1, 9], [1.2, 7]]) {
      B.add(chamferBox(1.9, len, 0.9, 0.2), { p: [p.x + dx, p.y - 1.2 - len / 2, p.z + 0.9], r: [-8, 0, dx * 3] }, 'sealribbon');
    }
  }

  // ------------------------------------------------------------ helm
  const HY = PT + 30.5; // helm base (chin) level
  B.group({ p: [0, HY, -0.6] }, () => {
    // cranium dome
    const dome = lathe([[8.6, 0], [10.2, 2.4], [11.1, 6.0], [11.3, 9.8], [10.8, 13.6], [9.4, 16.8], [7.0, 19.4], [3.8, 20.9], [0, 21.4]], 28);
    deform(dome, (v) => {
      v.z *= 1.12;
    });
    B.add(dome, {}, 'helm');
    B.mirrorX(() => {
      // faceplate half: angular visor
      B.add(hull([
        [0, 0.4, 13.6], [0, 14.4, 12.9], [6.9, 14.2, 10.7], [9.2, 8.4, 9.4], [7.8, 0.6, 9.8],
        [0, 0.4, 9], [0, 14.4, 9], [6.9, 14.2, 7], [9.2, 8.4, 6], [7.8, 0.6, 6],
      ]), {}, 'faceplate');
      // cheek plate
      B.add(hull([
        [9.2, 1.4, 8.8], [10.8, 2.0, 3.2], [11.6, 10.0, 2.8], [10.0, 10.4, 8.2],
        [8.2, 1.4, 8.0], [9.8, 2.0, 2.4], [10.4, 10.0, 2.2], [9.0, 10.4, 7.4],
      ]), {}, 'cheek');
      // angled eye lens (inner end low, outer end high)
      B.add(hull([
        [1.2, 9.4, 13.9], [7.2, 11.0, 11.8], [7.7, 13.6, 11.3], [1.6, 12.4, 13.6],
        [1.2, 9.4, 12.0], [7.2, 11.0, 9.9], [7.7, 13.6, 9.5], [1.6, 12.4, 11.8],
      ]), { p: [0, 0, 0.7] }, 'eye');
      // brow ridge
      B.add(hull([
        [0, 12.6, 14.6], [0, 15.6, 14.2], [8.8, 14.8, 11.0], [8.8, 16.8, 10.4],
        [0, 12.6, 12.0], [0, 15.6, 11.6], [8.8, 14.8, 8.4], [8.8, 16.8, 7.8],
      ]), {}, 'brow');
      // vox stud on the side
      B.add(cyl(3.1, 3.5, 2.2, 14), { p: [11.0, 8.2, -1.0], r: [0, 0, -90] }, 'voxstud');
      B.add(cyl(1.8, 2.0, 1.4, 12), { p: [12.6, 8.2, -1.0], r: [0, 0, -90] }, 'voxstud');
      // rebreather hose from grille to gorget
      const hose = curveFrom([[4.0, 2.6, 14.6], [8.0, 1.4, 13.4], [10.8, -2.6, 9.4], [11.4, -5.6, 4.6]]);
      B.add(tube(hose, 1.2, 18, 8), {}, 'hose');
      for (let k = 1; k <= 3; k++) {
        const t = 0.2 + k * 0.17;
        const p = hose.getPointAt(t), tg = hose.getTangentAt(t);
        B.add(cyl(1.7, 1.7, 0.8, 8), { p: [p.x, p.y, p.z], q: qAlignY(tg) }, 'hoserib');
      }
    });
    // mouth grille: protruding trapezoid with vertical slats
    B.add(hull([
      [-3.8, 0.2, 15.8], [3.8, 0.2, 15.8], [-4.4, 7.6, 15.0], [4.4, 7.6, 15.0],
      [-5.4, 0.6, 11.0], [5.4, 0.6, 11.0], [-5.8, 8.0, 11.0], [5.8, 8.0, 11.0],
    ]), {}, 'grillebox');
    for (let i = -2; i <= 2; i++) {
      const x = i * 1.45;
      B.add(hull([[x - 0.45, 0.8, 15.9], [x + 0.45, 0.8, 15.9], [x - 0.45, 7.0, 15.1], [x + 0.45, 7.0, 15.1], [x, 0.8, 17.0], [x, 7.0, 16.1]]), {}, 'slat');
    }
    B.add(chamferBox(9.8, 1.4, 2.2, 0.4), { p: [0, 7.9, 15.0], r: [-6, 0, 0] }, 'grilletop');
    B.add(chamferBox(8.6, 1.4, 2.2, 0.4), { p: [0, 0.3, 15.6] }, 'grillebottom');
    // crest along the top
    const crestPts = [];
    for (let i = 0; i <= 12; i++) {
      const a = 0.2 * Math.PI - (i / 12) * 0.9 * Math.PI;
      crestPts.push([Math.sin(a) * 10.0 * 1.12, 10.6 + Math.cos(a) * 10.6]);
    }
    for (let i = 12; i >= 0; i--) {
      const a = 0.2 * Math.PI - (i / 12) * 0.9 * Math.PI;
      const h = 4.0 - 1.8 * (i / 12);
      crestPts.push([Math.sin(a) * (10.0 * 1.12 + h * 0.6), 10.6 + Math.cos(a) * (10.6 + h)]);
    }
    const outline = crestPts.map(([z, y]) => [-z, y]).reverse();
    B.add(extrude(outline, 3.0, { bevel: 0.5, center: true }), { r: [0, 90, 0] }, 'crest');
    // helm rim / chin guard
    B.add(latheLoop([[8.4, -1.0], [10.6, -1.0], [10.4, 1.6], [8.4, 1.6]], 28), { s: [1, 1, 1.12], p: [0, 0.4, 0] }, 'helmrim');
  });

  return B;
}
