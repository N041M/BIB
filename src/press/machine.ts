import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { extrude, lancet, lancetFrame, merge, turned } from './shapes';

/**
 * Where the blog's page puts the sheet, in CSS pixels from the viewport's top
 * left. The machine is built round it.
 */
export interface PressLayout {
  /** Viewport size. */
  w: number;
  h: number;
  /** The sheet's left and right edges. */
  left: number;
  right: number;
  /** Top of the upper roll and bottom of the lower roll. */
  top: number;
  bottom: number;
  radius: number;
  /** How far the print head, cresting included, rises above the lower roll's top, plus the 8px it overlaps the roll. */
  head: number;
  compact: boolean;
}

export interface MachineMaterials {
  /** Cast brass where it is rarely touched: housings and recesses. */
  brass: THREE.Material;
  /** Brass on raised and handled parts: finials, frames, rims, cresting. */
  rubbed: THREE.Material;
  iron: THREE.Material;
  glass: THREE.Material;
  sheet: THREE.Material;
  /** The paper wound on both rolls. */
  roll: THREE.Material;
}

export interface Machine {
  group: THREE.Group;
  /** Where the candle's flame is, in world space. Undefined on narrow screens, which have no candle. */
  flame?: THREE.Vector3;
  /** Where the candle's stand stands. */
  stand?: THREE.Vector3;
  /** Where the wax seal's cord is tied: under the bearing on the top roll's right end. */
  seal?: THREE.Vector3;
  /** The middle of the print head's windows, for their red light. */
  head: THREE.Vector3;
  /** Where the sheet's left edge is in a roll's object space. */
  rollLeft: number;
  /** The heights of the rolls' axes, where the sheet winds round them. */
  rolls: { top: number; bottom: number };
  dispose(): void;
}

/**
 * The machine is built in world units of CSS pixels. The sheet lies in the
 * plane z = 0, and x and y match the screen with the origin at its centre and
 * y up, so the sheet covers exactly the pixels the page reserved for it.
 *
 * Two rolls stand in front of the sheet, and the sheet winds round their
 * backs. Each roll ends in a brass flange and a turned finial, and is held by
 * an iron strap that comes from behind the sheet. A print head in a brass
 * housing sits over the lower roll.
 */
export function buildMachine(L: PressLayout, m: MachineMaterials, eye: number): Machine {
  const X = (x: number) => x - L.w / 2;
  const Y = (y: number) => L.h / 2 - y;
  const r = L.radius;
  const xl = X(L.left);
  const xr = X(L.right);
  // the rolls' axes
  const yTop = Y(L.top + r);
  const yBot = Y(L.bottom - r);
  const zAxis = r + 1.5;

  const brass: THREE.BufferGeometry[] = [];
  const rubbed: THREE.BufferGeometry[] = [];
  const iron: THREE.BufferGeometry[] = [];
  const glass: THREE.BufferGeometry[] = [];

  const rounded = (w: number, h: number, d: number, radius: number, x: number, y: number, z: number) =>
    new RoundedBoxGeometry(w, h, d, 3, Math.min(radius, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01)).translate(x, y, z);
  const sphere = (radius: number, x: number, y: number, z: number, flat = 1) =>
    new THREE.SphereGeometry(radius, 16, 12).scale(1, 1, flat).translate(x, y, z);
  /** A four-sided spire standing on (x, y, z). */
  const spire = (side: number, tall: number, x: number, y: number, z: number) =>
    new THREE.ConeGeometry(side / Math.SQRT2, tall, 4).rotateY(Math.PI / 4).translate(x, y + tall / 2, z);
  /** Turn a profile of (radius, distance) pairs round the x axis, pointing left (-1) or right (1) from x. */
  const along = (profile: [number, number][], x: number, y: number, dir: -1 | 1, segments = 48) =>
    turned(profile, segments)
      .rotateY((dir * Math.PI) / 2)
      .translate(x, y, zAxis);

  /* ── the rolls ── */

  // room for each roll's flange and finial beside the sheet
  const room = Math.max(10, Math.min(r * 3.9, (L.w - (L.right - L.left)) / 2 - 12));
  const flangeT = L.compact ? 4 : 8;
  const rolls: THREE.Mesh[] = [];
  let seal: THREE.Vector3 | undefined;

  for (const y of [yTop, yBot]) {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, xr - xl, 96, 1, true).rotateZ(Math.PI / 2), m.roll);
    body.position.set((xl + xr) / 2, y, zAxis);
    body.castShadow = true;
    body.receiveShadow = true;
    rolls.push(body);
    // the core the sheet is wound on shows past its torn edges
    iron.push(new THREE.CylinderGeometry(r * 0.34, r * 0.34, xr - xl + 4, 24).rotateZ(Math.PI / 2).translate((xl + xr) / 2, y, zAxis));

    for (const dir of [-1, 1] as const) {
      const x0 = dir < 0 ? xl - 1 : xr + 1;
      // a flange with a bead round its rim and a ring of studs on its outer face
      rubbed.push(
        along(
          [
            [r * 0.34, 0],
            [r * 1.16, 0],
            [r * 1.26, flangeT * 0.2],
            [r * 1.3, flangeT * 0.45],
            [r * 1.26, flangeT * 0.7],
            [r * 1.12, flangeT * 0.85],
            [r * 1.02, flangeT],
            [r * 0.66, flangeT],
            [r * 0.6, flangeT + 1.5],
            [r * 0.5, flangeT + 1.5],
          ],
          x0,
          y,
          dir,
        ),
      );
      if (!L.compact) {
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          rubbed.push(sphere(2.1, x0 + dir * (flangeT + 0.3), y + Math.sin(a) * r * 0.84, zAxis + Math.cos(a) * r * 0.84));
        }
      }

      // the finial: a collar, a neck for the bearing, a bead, a vase with a sharp shoulder, a knop, and an onion with a spike
      const k = room / (r * 3.9);
      const fin: [number, number][] = [];
      const add = (rad: number, t: number) => fin.push([rad * r, flangeT + 1.5 + t * r * k]);
      const curve = (from: number, to: number, t0: number, t1: number, shape: (u: number) => number, steps = 8) => {
        for (let i = 0; i <= steps; i++) add(from + (to - from) * shape(i / steps), t0 + (t1 - t0) * (i / steps));
      };
      add(0.55, 0);
      add(0.55, 0.1);
      add(0.42, 0.16);
      add(0.34, 0.2);
      add(0.34, 0.55);
      add(0.5, 0.6);
      add(0.58, 0.68);
      add(0.5, 0.76);
      add(0.4, 0.8);
      curve(0.42, 0.8, 0.84, 1.36, (u) => Math.sin((u * Math.PI) / 2) ** 1.6);
      add(0.72, 1.44);
      curve(0.7, 0.4, 1.46, 1.76, (u) => Math.sin((u * Math.PI) / 2));
      add(0.56, 1.8);
      add(0.6, 1.88);
      add(0.5, 1.96);
      add(0.3, 2.0);
      curve(0.3, 0.3, 2.02, 2.5, (u) => 1 + 0.85 * Math.sin(u * Math.PI));
      add(0.5, 2.55);
      add(0.5, 2.62);
      add(0.24, 2.66);
      curve(0.24, 0.24, 2.7, 3.36, (u) => 1 + 0.95 * Math.sin(u * Math.PI) ** 0.8 * (1 - u * 0.5));
      add(0.08, 3.6);
      add(0.0, 3.9);
      rubbed.push(along(fin, x0 + dir * 0, y, dir, 40));

      // an iron strap from behind the sheet holds the roll by its neck
      if (!L.compact) {
        const xa = x0 + dir * (flangeT + 1.5 + 0.38 * r * k);
        const up = y > 0 ? 1 : -1;
        const strap = new THREE.CatmullRomCurve3([
          new THREE.Vector3(xa, y + up * r * 2.6, -120),
          new THREE.Vector3(xa, y + up * r * 1.9, -30),
          new THREE.Vector3(xa, y + up * r * 1.05, zAxis * 0.45),
          new THREE.Vector3(xa, y + up * r * 0.62, zAxis),
        ]);
        iron.push(new THREE.TubeGeometry(strap, 24, 2.8, 8));
        if (dir > 0 && y === yTop) seal = new THREE.Vector3(xa, y - r * 0.48 - 2, zAxis + 1);
        iron.push(new THREE.TorusGeometry(r * 0.48, 2.6, 10, 32).rotateY(Math.PI / 2).translate(xa, y, zAxis));
      }
    }
  }

  /* ── the print head: a brass housing over the lower roll, its windows lit from inside ── */

  const hl = xl - (L.compact ? 4 : 16);
  const hr = xr + (L.compact ? 4 : 16);
  const hx = (hl + hr) / 2;
  const len = hr - hl;
  const headTop = Y(L.bottom - 2 * r - L.head + 8);
  const headBot = yBot + r * 0.42;
  const crest = L.compact ? 4 : 11;
  const cornice = L.compact ? 3 : 7;
  const faceTop = headTop - crest - cornice;
  const zH = 2 * r + (L.compact ? 10 : 18);
  const plateT = L.compact ? 3 : 5.5;

  // the housing behind the front plate stops short of it, so the lit glass can sit between them
  iron.push(rounded(len - 2, headTop - crest - headBot, zH - plateT - 5.5, 2, hx, (headTop - crest + headBot) / 2, (zH - plateT - 4.5) / 2));

  // the front plate, pierced with arched windows; the glass sits well back, so the openings have depth
  const plate = new THREE.Shape();
  plate.moveTo(hl, headBot);
  plate.lineTo(hr, headBot);
  plate.lineTo(hr, faceTop);
  plate.lineTo(hl, faceTop);
  plate.lineTo(hl, headBot);
  const windows = L.compact ? 3 : 9;
  const ww = L.compact ? 6 : 11;
  const pitch = L.compact ? 14 : 22;
  const wb = headBot + (faceTop - headBot) * 0.18;
  const wh = (faceTop - headBot) * 0.7;
  const frames: THREE.Shape[] = [];
  for (let i = 0; i < windows; i++) {
    const wx = hx + (i - (windows - 1) / 2) * pitch;
    plate.holes.push(lancet(new THREE.Path(), wx, wb, ww, wh));
    if (!L.compact) frames.push(lancetFrame(wx, wb - 2, ww + 4, wh + 3.5, 2));
  }
  brass.push(extrude(plate, plateT - 1, 0.9, 8).translate(0, 0, zH - plateT + 1));
  glass.push(new THREE.PlaneGeometry(windows * pitch + 12, faceTop - headBot - 4).translate(hx, (faceTop + headBot) / 2, zH - plateT - 2.5));
  if (frames.length) rubbed.push(extrude(frames, 1.4, 0.6, 8).translate(0, 0, zH + 0.6));

  // mouldings: a round one along the foot, a stepped cornice, and a cresting of little spires
  rubbed.push(new THREE.CylinderGeometry(L.compact ? 2 : 4, L.compact ? 2 : 4, len + 2, 20).rotateZ(Math.PI / 2).translate(hx, headBot, zH - 1));
  brass.push(rounded(len + 6, cornice * 0.55, zH + 3, 1.5, hx, faceTop + cornice * 0.27, (zH + 3) / 2));
  rubbed.push(rounded(len + 10, cornice * 0.45, zH + 7, 1.5, hx, faceTop + cornice * 0.77, (zH + 7) / 2));
  if (!L.compact) {
    const step = 13;
    const n = Math.floor(len / step);
    for (let i = 0; i <= n; i++) {
      const x = hx + (i - n / 2) * step;
      rubbed.push(spire(5.5, crest - 2, x, faceTop + cornice, zH - 1));
      rubbed.push(sphere(1.4, x, faceTop + cornice + crest - 1.6, zH - 1));
    }
    // a buttress between each pair of windows, capped with a small spire
    for (let i = 0; i <= windows; i++) {
      const x = hx + (i - windows / 2) * pitch;
      rubbed.push(rounded(4, wh + 2, 4, 1.2, x, wb + wh / 2, zH + 1.5));
      rubbed.push(spire(4.2, 7, x, wb + wh + 1, zH + 1.5));
    }

    // a tower at each end of the head with a niche, a gabled cap and a tall spire
    for (const side of [-1, 1] as const) {
      const tx = side < 0 ? hl + 6 : hr - 6;
      const tw = 30;
      const td = zH + 16;
      const tTop = headTop + 22;
      brass.push(rounded(tw, tTop - (headBot - 8), td, 2.5, tx, (tTop + headBot - 8) / 2, td / 2));
      iron.push(extrude(lancet(new THREE.Shape(), tx, headBot + 2, tw - 12, tTop - headBot - 14), 0.6, 0, 10).translate(0, 0, td + 0.2));
      rubbed.push(extrude(lancetFrame(tx, headBot, tw - 6, tTop - headBot - 9, 3), 2, 0.8, 10).translate(0, 0, td + 0.4));
      rubbed.push(rounded(tw + 6, 6, td + 6, 1.5, tx, tTop + 3, td / 2));
      rubbed.push(spire(tw * 0.78, 46, tx, tTop + 6, td / 2));
      rubbed.push(sphere(4, tx, tTop + 54, td / 2));
      for (const t of [0.25, 0.5, 0.72]) {
        for (const [ex, ez] of [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ]) {
          const half = ((tw * 0.78) / 2) * (1 - t);
          rubbed.push(sphere(2.6 * (1 - t * 0.4), tx + ex * (half + 1), tTop + 6 + 46 * t, td / 2 + ez * (half + 1)));
        }
      }
      // rivets down the tower's face
      for (let y = headBot - 2; y < tTop - 2; y += 9) {
        for (const dx of [-1, 1]) rubbed.push(sphere(1.4, tx + dx * (tw / 2 - 3), y, td, 0.6));
      }
    }
  }

  /* ── the sheet ── */

  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(xr - xl, yTop - yBot).translate((xl + xr) / 2, (yTop + yBot) / 2, 0), m.sheet);
  sheet.receiveShadow = true;

  const group = new THREE.Group();
  const meshes: THREE.Mesh[] = [sheet, ...rolls];
  for (const [parts, mat] of [
    [brass, m.brass],
    [rubbed, m.rubbed],
    [iron, m.iron],
    [glass, m.glass],
  ] as const) {
    if (!parts.length) continue;
    const mesh = new THREE.Mesh(merge(parts), mat);
    mesh.castShadow = mat !== m.glass;
    mesh.receiveShadow = true;
    meshes.push(mesh);
  }
  group.add(...meshes);

  // the candle stands on the floor to the left of the machine, its flame a little below the top roll.
  // It stands in front of the sheet, so it is placed where it should appear on screen and pulled in for the perspective.
  const cz = 130;
  const pull = (eye - cz) / eye;
  const flame = !L.compact && L.left > 130 ? new THREE.Vector3((xl - Math.min(100, room - 10)) * pull, (yTop - r * 2.4) * pull, cz) : undefined;

  return {
    group,
    flame,
    stand: flame ? new THREE.Vector3(flame.x, -L.h / 2 - 60, flame.z) : undefined,
    seal,
    head: new THREE.Vector3(hx, (faceTop + headBot) / 2, zH + 6),
    rollLeft: xl - (xl + xr) / 2,
    rolls: { top: yTop, bottom: yBot },
    dispose: () => meshes.forEach((mesh) => mesh.geometry.dispose()),
  };
}
