import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Outlines and solids for the machine's gothic parts. Lengths are CSS pixels,
 * x right, y up, z toward the viewer.
 */

/**
 * A pointed arch with straight sides, drawn into `path`. The arch is
 * equilateral: each side is an arc whose radius is the opening's width.
 */
export function lancet<P extends THREE.Path>(path: P, cx: number, y0: number, w: number, h: number): P {
  const rise = (w * Math.sqrt(3)) / 2;
  const spring = y0 + Math.max(0, h - rise);
  const l = cx - w / 2;
  const r = cx + w / 2;
  path.moveTo(l, y0);
  path.lineTo(r, y0);
  path.lineTo(r, spring);
  path.absarc(l, spring, w, 0, Math.PI / 3, false);
  path.absarc(r, spring, w, (2 * Math.PI) / 3, Math.PI, false);
  path.lineTo(l, y0);
  return path;
}

/** The frame of a pointed arch: the arch with a smaller one cut out of it. */
export function lancetFrame(cx: number, y0: number, w: number, h: number, t: number): THREE.Shape {
  const s = lancet(new THREE.Shape(), cx, y0, w, h);
  s.holes.push(lancet(new THREE.Path(), cx, y0 + t, w - 2 * t, h - t * 2.2));
  return s;
}

/** Extrude a flat outline toward the viewer, with a rounded edge that catches the light. */
export function extrude(shape: THREE.Shape | THREE.Shape[], depth: number, bevel: number, curve = 10): THREE.BufferGeometry {
  return new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel * 0.9,
    bevelSegments: 2,
    curveSegments: curve,
  });
}

/** Turn a profile, given as (radius, height) pairs, round the z axis. Height runs toward the viewer. */
export function turned(profile: [number, number][], segments = 40): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    segments,
  );
  g.rotateX(Math.PI / 2);
  return g;
}

/** Merge parts that share a material into one mesh's geometry. */
export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = parts.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const name of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(name)) n.deleteAttribute(name);
    if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((n.attributes.position.count * 2) | 0), 2));
    return n;
  });
  const merged = mergeGeometries(flat, false);
  if (!merged) throw new Error('press: geometry could not be merged');
  for (const g of parts) g.dispose();
  return merged;
}
