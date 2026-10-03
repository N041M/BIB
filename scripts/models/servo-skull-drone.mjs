// Servo skull drone: a mechanised skull hovering on an anti-grav ring above a
// round flight-stand base, with bionic lens eye, antennae, claw arm, vent fins.
import {
  Builder, V, box, chamferBox, hull, cyl, cylBetween, lathe, latheLoop, sphere, torus, extrude, tube, curveFrom,
  deform, rivet, qAlignY, THREE,
} from './lib.mjs';

export default function build() {
  const B = new Builder('servo-skull-drone', 9909);
  const rng = B.rng;

  // ------------------------------------------------------------ flight-stand base
  B.add(lathe([[19, 0], [19, 1.8], [18.2, 2.8], [16.4, 3.6], [15.0, 3.9]], 40), {}, 'base');
  B.add(latheLoop([[12.0, 3.5], [13.2, 3.5], [13.2, 4.3], [12.0, 4.3]], 40), {}, 'basering');
  // little scatter of rubble and a spent cog on the base
  for (let i = 0; i < 6; i++) {
    const a = rng.range(0, Math.PI * 2), r = rng.range(5.5, 14);
    const s = rng.range(0.9, 1.7);
    const pts = [];
    for (let k = 0; k < 8; k++) pts.push([rng.range(-1, 1) * s, rng.range(0, 1) * s, rng.range(-1, 1) * s]);
    B.add(hull(pts), { p: [Math.cos(a) * r, 3.5, Math.sin(a) * r] }, 'rubble');
  }
  {
    const cog = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const r = i % 2 ? 2.4 : 3.2;
      cog.push([Math.cos(a - 0.12) * r, Math.sin(a - 0.12) * r], [Math.cos(a + 0.12) * r, Math.sin(a + 0.12) * r]);
    }
    B.add(extrude(cog, 1.0, { holes: [[[0.9, 0], [0, 0.9], [-0.9, 0], [0, -0.9]]] }), { p: [-8.5, 3.5, 7.5], r: [-84, 0, 20] }, 'cog');
  }
  // rod socket + flight rod
  B.add(lathe([[3.4, 3.0], [3.4, 4.6], [2.4, 5.6], [1.9, 7.0]], 6), {}, 'socket');

  const SY = 45; // skull centre height
  const TH_BOTTOM = SY - 25.2;
  B.add(cyl(1.35, 1.35, TH_BOTTOM - 4.2 + 0.6, 10), { p: [0, (TH_BOTTOM + 4.2) / 2, -1.0] }, 'rod');

  B.group({ p: [0, SY, 0], r: [0, 10, 0] }, () => {
    // ---------------------------------------------------------- cranium
    const R = 12.0;
    const cr = new THREE.SphereGeometry(R, 40, 30);
    const eyes = [[4.3, -0.6], [-4.3, -0.6]];
    deform(cr, (v) => {
      v.x *= 0.86;
      v.y *= 0.93;
      v.z *= 1.1;
      if (v.z < 0) v.z *= 1.06;
      const ax = Math.abs(v.x);
      if (ax > 7.0) v.x = Math.sign(v.x) * (7.0 + (ax - 7.0) * 0.42); // flattened temples
      if (v.y < -4) v.y = -4 + (v.y + 4) * 0.5; // flattened underside
      v.y += 2.2;
      v.z -= 1.2;
      if (v.z > 2) {
        for (const [ex, ey] of eyes) {
          const d = Math.hypot(v.x - ex, (v.y - ey) * 1.08);
          if (d < 4.3) v.z -= 5.2 * Math.pow(1 - (d / 4.3) ** 2, 2);
        }
        // nasal cavity (inverted triangle)
        const ny = v.y + 5.4;
        const nd = Math.max(Math.abs(v.x) * 1.6 + ny * 0.7, -ny * 1.3);
        if (nd < 2.2) v.z -= 2.6 * (1 - nd / 2.2);
        // temporal hollows
        const tx = Math.abs(v.x);
        if (tx > 6.0 && v.y < 1 && v.y > -5) v.x = Math.sign(v.x) * (tx - 0.8 * Math.sin(((v.y + 5) / 6) * Math.PI));
      }
    });
    B.add(cr, {}, 'cranium');

    // brow ridge (slight V) and cheekbones
    B.mirrorX(() => {
      B.add(hull([
        [0, 2.4, 12.4], [0, 4.8, 11.8], [4.4, 2.9, 11.4], [8.2, 2.6, 7.4], [8.2, 5.0, 6.6],
        [0, 2.4, 8.8], [0, 4.8, 8.6], [8.2, 2.6, 5.0], [8.2, 5.0, 4.4],
      ]), {}, 'brow');
      B.add(hull([
        [4.4, -4.6, 9.6], [6.4, -3.8, 9.0], [8.6, -3.2, 4.2], [8.4, -5.0, 3.2], [5.6, -6.2, 8.4],
        [4.0, -4.6, 7.8], [6.0, -3.8, 7.0], [7.4, -3.2, 3.0], [7.2, -5.0, 2.2], [5.2, -6.2, 6.8],
      ]), {}, 'cheekbone');
      // jaw hinge ramus
      B.add(chamferBox(2.2, 8.4, 3.2, 0.5), { p: [6.8, -9.2, -0.4], r: [0, 0, 6] }, 'ramus');
    });
    // maxilla (upper jaw) + upper teeth
    B.add(hull([
      [-4.8, -5.8, 8.2], [4.8, -5.8, 8.2], [-2.6, -5.8, 9.9], [2.6, -5.8, 9.9], [0, -5.8, 10.3],
      [-4.4, -9.4, 7.6], [4.4, -9.4, 7.6], [-2.2, -9.4, 9.2], [2.2, -9.4, 9.2], [0, -9.4, 9.6],
      [-6.6, -5.4, 1.0], [6.6, -5.4, 1.0], [-6.0, -9.4, 1.0], [6.0, -9.4, 1.0],
    ]), {}, 'maxilla');
    const teethArc = (y, h, r0, r1, n, tag) => {
      for (let i = 0; i < n; i++) {
        const a = (-0.36 + (0.72 * i) / (n - 1)) * Math.PI;
        const x = Math.sin(a) * r0, z = 1.6 + Math.cos(a) * r1;
        const hh = h * (0.85 + 0.3 * rng());
        B.add(chamferBox(1.05, hh, 1.2, 0.22), { p: [x, y - (hh - h) / 2 * Math.sign(y), z], r: [0, (a * 180) / Math.PI, 0] }, tag);
      }
    };
    teethArc(-10.1, 1.7, 4.3, 7.7, 8, 'teeth');
    // nasal frame: raised inverted triangle rim around the cavity
    B.add(latheLoop([[1.2, 0], [2.1, 0], [2.1, 1.1], [1.2, 1.1]], 3), { p: [0, -5.0, 9.4], r: [90, 0, 0], s: [1, 1, 1.25] }, 'nose');

    // mandible, slightly open, with lower teeth
    B.group({ p: [0, -11.0, -0.6], r: [9, 0, 0] }, () => {
      const outer = [], inner = [];
      for (let i = 0; i <= 14; i++) {
        const a = (-0.56 + (1.12 * i) / 14) * Math.PI;
        outer.push([Math.sin(a) * 6.8, 1.0 + Math.cos(a) * 9.6]);
        inner.push([Math.sin(a) * 4.4, 1.0 + Math.cos(a) * 7.0]);
      }
      const shape = [...outer, ...inner.reverse()];
      B.add(extrude(shape, 3.0, { bevel: 0.5 }), { r: [90, 0, 0], p: [0, 0.2, 0] }, 'jaw');
      B.add(chamferBox(4.6, 2.2, 1.6, 0.5), { p: [0, -2.0, 10.4] }, 'chin');
      teethArc(0.8, 1.5, 4.6, 7.4, 8, 'teeth');
    });

    // eye socket rims (thin rings sunk into the sockets)
    // orbital rims: open arcs under the brow (lower and outer edge of each socket)
    for (const sx of [-1, 1]) {
      const pts = [];
      for (let i = 0; i <= 10; i++) {
        const a = ((sx < 0 ? 150 : -150) + (sx < 0 ? 1 : -1) * 250 * (i / 10)) * (Math.PI / 180);
        pts.push(V(sx * 4.3 + Math.cos(a) * 3.6, -0.6 + Math.sin(a) * 3.5, 9.0 - Math.abs(Math.cos(a)) * 1.2 + (Math.sin(a) < 0 ? 0.4 : 0)));
      }
      B.add(tube(curveFrom(pts), 0.55, 20, 6), {}, 'socketring');
    }
    // bionic telescopic lens eye in the right socket
    B.group({ p: [4.3, -0.6, 7.0], r: [0, 14, 0] }, () => {
      B.add(cyl(2.9, 3.1, 4.2, 16), { p: [0, 0, 2.1], r: [90, 0, 0] }, 'bionic');
      B.add(cyl(2.4, 2.6, 2.4, 16), { p: [0, 0, 5.2], r: [90, 0, 0] }, 'bionic');
      B.add(latheLoop([[1.4, 0], [2.6, 0], [2.6, 0.9], [1.4, 0.9]], 16), { p: [0, 0, 6.2], r: [90, 0, 0] }, 'lensring');
      B.add(lathe([[1.7, 0], [1.5, 0.7], [0.9, 1.2], [0, 1.4]], 12), { p: [0, 0, 6.4], r: [90, 0, 0] }, 'lens');
      // range-finder stub on top of the housing
      B.add(chamferBox(1.5, 1.5, 3.6, 0.3), { p: [2.0, 2.5, 3.6] }, 'bionic');
    });
    // vox-emitter implant on the left temple
    B.group({ p: [-8.3, 0.8, -1.8], r: [0, 0, 90] }, () => {
      B.add(cyl(3.6, 3.9, 2.4, 16), {}, 'vox');
      B.add(cyl(2.8, 2.8, 1.0, 16), { p: [0, 1.4, 0] }, 'vox');
      for (const dz of [-1.5, 0, 1.5]) B.add(box(4.2, 0.8, 0.8), { p: [0, 2.0, dz], r: [0, 90, 0] }, 'voxgrille');
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
        B.add(rivet(0.5), { p: [Math.cos(a) * 3.2, 1.2, Math.sin(a) * 3.2] }, 'rivet');
      }
    });
    const eyeCable = curveFrom([[6.6, 0.4, 9.4], [8.6, 1.6, 6.6], [9.2, 2.8, 2.0]]);
    B.add(tube(eyeCable, 0.65, 10, 6), {}, 'cable');

    // riveted cranial plate with a data port
    B.group({ r: [0, 0, -25] }, () => {
      B.group({ p: [0, 12.9, -2.0] }, () => {
        B.add(chamferBox(7.6, 2.4, 11, 0.5), {}, 'plate');
        for (const [dx, dz] of [[-2.9, -4.4], [2.9, -4.4], [-2.9, 4.4], [2.9, 4.4]]) B.add(rivet(0.6), { p: [dx, 1.2, dz] }, 'rivet');
        B.add(chamferBox(2.6, 1.6, 3.2, 0.3), { p: [0, 1.6, 0] }, 'port');
      });
    });

    // antennae from the back of the cranium
    B.add(cyl(1.6, 1.9, 2.2, 10), { p: [-3.6, 11.9, -6.6], r: [-40, 0, 0] }, 'antennabase');
    B.add(cylBetween(V(-3.6, 12.2, -7.0), V(-4.6, 21.4, -13.4), 0.6, 6, 0.5), {}, 'antenna');
    B.add(sphere(0.95, 8, 6), { p: [-4.6, 21.4, -13.4] }, 'antennatip');
    B.add(cylBetween(V(-1.2, 12.4, -6.6), V(-1.6, 17.8, -10.8), 0.55, 6), {}, 'antenna');
    B.add(lathe([[0.4, 0], [1.6, 0.4], [1.8, 0.9]], 8), { p: [-1.6, 17.8, -10.8], q: qAlignY(V(0, 0.6, -0.8)) }, 'antennadish');

    // back vent fins
    B.add(chamferBox(10, 7.4, 3.6, 0.6), { p: [0, 1.6, -15.2] }, 'ventblock');
    for (let k = -2; k <= 2; k++) B.add(chamferBox(0.9, 6.6, 3.6, 0.3), { p: [k * 1.9, 1.6, -17.6] }, 'fin');

    // ---------------------------------------------------------- anti-grav ring + thruster
    const RY = -18.2;
    B.add(cyl(4.6, 5.2, 2.2, 12), { p: [0, -8.4, -1.0] }, 'mount');
    B.add(torus(8.4, 1.5, 8, 28), { p: [0, RY, -1.0], r: [90, 0, 0] }, 'gravring');
    B.add(latheLoop([[7.0, -0.7], [9.8, -0.7], [9.8, 0.7], [7.0, 0.7]], 28), { p: [0, RY, -1.0] }, 'gravring');
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + Math.PI / 2;
      const top = V(Math.cos(a) * 3.6, -8.6, -1.0 + Math.sin(a) * 3.6);
      const bot = V(Math.cos(a) * 8.0, RY + 0.6, -1.0 + Math.sin(a) * 8.0);
      B.add(cylBetween(top, bot, 0.85, 6), {}, 'strut');
      // emitter nodes on the ring
      B.add(chamferBox(2.4, 2.6, 2.4, 0.4), { p: [bot.x, RY, bot.z], r: [0, (-a * 180) / Math.PI, 0] }, 'emitter');
    }
    // central spine + thruster bell
    B.add(cyl(2.4, 2.8, 9.6, 10), { p: [0, -13.4, -1.0] }, 'spine');
    B.add(lathe([[2.8, 0], [3.4, -1.0], [3.9, -3.6], [4.4, -5.6], [4.2, -6.2], [2.0, -6.4]], 14), { p: [0, RY - 0.8, -1.0] }, 'thruster');
  });

  // ------------------------------------------------------------ servo arm with claw (under the left cheek)
  B.group({ p: [0, SY, 0], r: [0, 10, 0] }, () => {
    const sh = V(-7.6, -8.6, 2.6), el = V(-13.0, -13.2, 6.4), wr = V(-12.2, -17.6, 12.8);
    B.add(sphere(2.1, 10, 8), { p: [sh.x, sh.y, sh.z] }, 'joint');
    B.add(cylBetween(sh, el, 1.25, 8), {}, 'arm');
    B.add(cylBetween(sh.clone().lerp(el, 0.15), sh.clone().lerp(el, 0.7), 1.75, 8), {}, 'piston');
    B.add(sphere(1.8, 10, 8), { p: [el.x, el.y, el.z] }, 'joint');
    B.add(cylBetween(el, wr, 1.1, 8), {}, 'arm');
    B.add(cyl(1.9, 1.9, 1.6, 10), { p: [wr.x, wr.y, wr.z], q: qAlignY(wr.clone().sub(el)) }, 'wrist');
    // three claw fingers
    const dir = wr.clone().sub(el).normalize();
    const q = qAlignY(dir);
    B.group({ p: [wr.x, wr.y, wr.z], q }, () => {
      for (let k = 0; k < 3; k++) {
        B.group({ r: [0, k * 120, 0] }, () => {
          B.add(hull([[0.9, 0.4, -0.5], [0.9, 0.4, 0.5], [1.5, 0.4, -0.5], [1.5, 0.4, 0.5], [2.4, 3.0, -0.45], [2.4, 3.0, 0.45], [1.9, 3.2, 0]]), {}, 'claw');
          B.add(hull([[2.4, 2.8, -0.45], [2.4, 2.8, 0.45], [1.9, 3.2, -0.4], [1.9, 3.2, 0.4], [1.0, 5.2, 0]]), {}, 'claw');
        });
      }
    });
  });

  return B;
}
