/**
 * The corridor behind the hero. Everything the shaders and the sprite pass
 * have to agree on is defined here: the hall's measurements, the sun, the
 * servitor and its censer, every candle, and the camera.
 * Units are metres, y is up, and the corridor runs along -z.
 */

export type Vec3 = [number, number, number];

const HALL = {
  /** Distance from the centre line to the inner face of each wall. */
  halfWidth: 3,
  /** Distance between piers. */
  bay: 4,
  /** z of the first pair of piers, just behind the camera. */
  z0: 1.2,
  bays: 8,
  /** Height where the vault springs from the walls. */
  spring: 8,
  wall: 0.9,
} as const;

const END_Z = HALL.z0 - HALL.bays * HALL.bay;

/** Direction toward the sun. It shines in through the right-hand windows and the end window. */
const SUN = normalize([0.7, 1.0, -0.5]);

function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
}

/* ───────────── servitor ───────────── */

const servitorFwd = normalize([-0.75, 0, 0.66]);

/** Where the servitor stands and which way it faces. Its right hand side is `right`. */
const SERVITOR = {
  pos: [1.0, 0, -4.6] as Vec3,
  fwd: [servitorFwd[0], servitorFwd[2]] as [number, number],
  right: [-servitorFwd[2], servitorFwd[0]] as [number, number],
};

/** A point given in the servitor's own frame (x to its right, z forward), in world space. */
function servitorToWorld(l: Vec3): Vec3 {
  const [rx, rz] = SERVITOR.right;
  const [fx, fz] = SERVITOR.fwd;
  const p = SERVITOR.pos;
  return [p[0] + l[0] * rx + l[2] * fx, p[1] + l[1], p[2] + l[0] * rz + l[2] * fz];
}

/* ───────────── censer ───────────── */

/**
 * The censer hangs from the servitor's claw and swings along the way the
 * servitor faces. frame.frag works out where it is at any moment, because the
 * smoke needs its past positions as well.
 */
const CENSER = {
  pivot: servitorToWorld([-0.2, 0.99, 0.49]),
  length: 0.56,
  amplitude: 0.36,
  period: 2.9,
};

/**
 * Where the censer body is at a given time, for the glow drawn round it.
 * The shaders work it out themselves in motion.glsl with the same formula.
 */
export function censerPosition(time: number): Vec3 {
  const w = (2 * Math.PI) / CENSER.period;
  const a = CENSER.amplitude * Math.sin(w * time);
  const b = 0.22 * CENSER.amplitude * Math.sin(w * time + 1.1);
  const [fx, fz] = SERVITOR.fwd;
  const [rx, rz] = SERVITOR.right;
  const d = normalize([fx * Math.sin(a) + rx * Math.sin(b), -Math.cos(a) * Math.cos(b), fz * Math.sin(a) + rz * Math.sin(b)]);
  const p = CENSER.pivot;
  return [p[0] + d[0] * CENSER.length, p[1] + d[1] * CENSER.length, p[2] + d[2] * CENSER.length];
}

/** The servitor's glowing optic. */
export const OPTIC = servitorToWorld([-0.036, 1.535, 0.31]);

/* ───────────── candles ───────────── */

export const enum Kind {
  /** A pillar candle standing in its own pool of wax. */
  Floor = 0,
  /** On a ledge, the altar or the servitor. */
  Ledge = 1,
  /** On top of an iron pricket stand. */
  Stand = 2,
  /** A tealight in a red glass cup on the votive rack. */
  Cup = 3,
}

export interface Candle {
  /** Centre of the base. */
  p: Vec3;
  r: number;
  h: number;
  kind: Kind;
  /** Flicker group, 0 to 3. Group 0 is the votive rack. */
  group: number;
  lit: boolean;
}

interface Cluster {
  /** Where the cluster's light comes from: the middle of its flames. */
  light: Vec3;
  /** How far the flames spread around that point. It softens the shadows. */
  spread: number;
  power: number;
  /** Beyond this distance the cluster lights nothing. */
  range: number;
  group: number;
  start: number;
  count: number;
  /** A sphere around the cluster's wax and glass, so the shader can skip it cheaply. */
  bound: [Vec3, number];
}

interface Stand {
  x: number;
  z: number;
  height: number;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(1847);
const between = (a: number, b: number) => a + (b - a) * rand();

/** Height of a candle's flame. */
export function flameHeight(c: Candle): number {
  if (c.kind === Kind.Cup) return 0.032;
  return Math.min(0.062, Math.max(0.036, 0.03 + c.r * 0.55));
}

/** Centre of a candle's flame. */
export function flameCentre(c: Candle): Vec3 {
  const fh = flameHeight(c);
  const top = c.kind === Kind.Cup ? c.p[1] + 0.03 : c.p[1] + c.h + 0.006;
  return [c.p[0], top + fh * 0.5, c.p[2]];
}

/** Pillar candles scattered over a rectangle without touching each other. */
function pillars(
  n: number,
  x: [number, number],
  z: [number, number],
  y: number,
  kind: Kind,
  size: { r: [number, number]; h: [number, number] },
): Omit<Candle, 'group'>[] {
  const out: Omit<Candle, 'group'>[] = [];
  for (let tries = 0; out.length < n && tries < 400; tries++) {
    const r = between(size.r[0], size.r[1]);
    const p: Vec3 = [between(x[0], x[1]), y, between(z[0], z[1])];
    const clear = out.every((o) => Math.hypot(o.p[0] - p[0], o.p[2] - p[2]) > o.r + r + 0.02);
    if (!clear) continue;
    out.push({ p, r, h: between(size.h[0], size.h[1]), kind, lit: rand() > 0.12 });
  }
  return out;
}

const candles: Candle[] = [];
const clusters: Cluster[] = [];
const stands: Stand[] = [];

function addCluster(group: number, list: Omit<Candle, 'group'>[], range: number): void {
  const start = candles.length;
  const members = list.map((c) => ({ ...c, group }));
  candles.push(...members);
  const lit = members.filter((c) => c.lit);
  const flames = (lit.length ? lit : members).map(flameCentre);
  const light: Vec3 = [0, 0, 0];
  for (const f of flames) for (let i = 0; i < 3; i++) light[i] += f[i] / flames.length;
  const spread = Math.max(0.05, ...flames.map((f) => Math.hypot(f[0] - light[0], f[1] - light[1], f[2] - light[2])));
  const power = lit.reduce((s, c) => s + (c.kind === Kind.Cup ? 0.14 : 0.22 + c.r * 2), 0);

  let lo: Vec3 = [Infinity, Infinity, Infinity];
  let hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const c of members) {
    lo = [Math.min(lo[0], c.p[0] - c.r * 2), Math.min(lo[1], c.p[1]), Math.min(lo[2], c.p[2] - c.r * 2)];
    hi = [Math.max(hi[0], c.p[0] + c.r * 2), Math.max(hi[1], c.p[1] + c.h), Math.max(hi[2], c.p[2] + c.r * 2)];
  }
  const centre: Vec3 = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
  const radius = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2 + 0.03;
  clusters.push({ light, spread, power, range, group, start, count: members.length, bound: [centre, radius] });
}

const W = HALL.halfWidth;
const pierZ = (k: number) => HALL.z0 - k * HALL.bay;
const bayZ = (k: number) => HALL.z0 - (k + 0.5) * HALL.bay;

/** Origin of the votive rack: the middle of its footprint, against the right wall. */
const RACK = { x: 2.25, z: -4.15 };

// The votive rack beside the servitor: three stepped tiers of red glass cups.
{
  const cups: Omit<Candle, 'group'>[] = [];
  for (let tier = 0; tier < 3; tier++) {
    const n = tier === 1 ? 6 : 7;
    for (let j = 0; j < n; j++) {
      if (rand() < 0.08) continue;
      const z = RACK.z + (j - (n - 1) / 2) * 0.15;
      cups.push({
        p: [RACK.x - 0.17 + tier * 0.15, 0.8 + tier * 0.14, z],
        r: 0.032,
        h: 0.07,
        kind: Kind.Cup,
        lit: rand() > 0.15,
      });
    }
  }
  addCluster(0, cups, 4.5);
}

const pillar = { r: [0.026, 0.06] as [number, number], h: [0.1, 0.55] as [number, number] };
const small = { r: [0.022, 0.04] as [number, number], h: [0.06, 0.24] as [number, number] };

// Pillar candles at the foot of the pier behind the servitor.
addCluster(1, pillars(5, [1.75, 2.15], [-6.05, -5.6], 0, Kind.Floor, pillar), 3.5);
// Tall candles at the first pier on the left, near the camera.
addCluster(2, pillars(6, [-2.05, -1.6], [-2.05, -1.6], 0, Kind.Floor, { r: [0.03, 0.065], h: [0.25, 0.75] }), 4);

// Candles on the sills of the statue niches along the left wall.
const ledgeGroups = [3, 1, 2, 3, 1, 2];
for (let k = 1; k <= 6; k++) {
  const n = k === 1 ? 4 : 3;
  const z: [number, number] = [bayZ(k) - 0.62, bayZ(k) + 0.62];
  addCluster(ledgeGroups[k - 1], pillars(n, [-2.9, -2.78], z, 0.55, Kind.Ledge, small), 3);
}

// Floor candles at the piers further down the hall.
const piers: [number, number, number][] = [
  [3, 1, 2],
  [3, -1, 3],
  [4, 1, 1],
  [5, -1, 3],
  [5, 1, 2],
  [6, 1, 1],
  [7, -1, 2],
];
for (const [k, side, group] of piers) {
  const x: [number, number] = side > 0 ? [W - 1.3, W - 0.95] : [-W + 0.95, -W + 1.3];
  addCluster(group, pillars(side > 0 ? 4 : 3, x, [pierZ(k) + 0.68, pierZ(k) + 1.0], 0, Kind.Floor, pillar), 3.2);
}

// Tall iron pricket stands: one beside the second niche, and one in front of
// the servitor that lights its face.
for (const [stand, group] of [
  [{ x: -2.05, z: -7.5, height: 1.25 }, 1],
  [{ x: 0.08, z: -3.5, height: 1.32 }, 2],
] as [Stand, number][]) {
  stands.push(stand);
  addCluster(group, [{ p: [stand.x, stand.height, stand.z], r: 0.042, h: 0.24, kind: Kind.Stand, lit: true }], 3.5);
}

/** The altar in front of the end window. */
const ALTAR = { z: END_Z + 1.4, top: 1.02 };

// A row of candles along the altar.
{
  const row: Omit<Candle, 'group'>[] = [];
  for (let i = 0; i < 7; i++) {
    const x = (i - 3) * 0.32;
    row.push({ p: [x, ALTAR.top, ALTAR.z + 0.05], r: 0.035, h: 0.18 + 0.22 * (1 - Math.abs(i - 3) / 3), kind: Kind.Ledge, lit: true });
  }
  addCluster(3, row, 4);
}

// Two short candles on the servitor's back unit.
addCluster(
  3,
  [-0.1, 0.1].map((x) => ({
    p: servitorToWorld([x, 1.57, -0.24]),
    r: 0.022,
    h: 0.07 + Math.abs(x) * 0.3,
    kind: Kind.Ledge,
    lit: true,
  })),
  2.5,
);

export const CANDLES: readonly Candle[] = candles;

/* ───────────── flicker ───────────── */

function hash1(n: number): number {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

function noise1(x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash1(i) * (1 - u) + hash1(i + 1) * u;
}

/** Brightness of a flicker group at a given time, around 1. */
export function flicker(time: number, group: number): number {
  const g = group * 31.7 + 3.1;
  const n = 0.5 * noise1(time * 5.3 + g) + 0.3 * noise1(time * 11.9 + g * 1.7) + 0.2 * noise1(time * 23.1 + g * 2.3);
  const gust = Math.max(0, noise1(time * 0.37 + g) - 0.72) * 2.6;
  // The rack has many small flames, so it evens out more than a few big ones.
  const depth = group === 0 ? 0.14 : 0.3;
  return 1 + depth * (n - 0.5) - gust * 0.22;
}

/** Brightness of the embers in the censer. */
export function ember(time: number): number {
  return 0.85 + 0.25 * noise1(time * 1.7 + 9.0) + 0.1 * noise1(time * 7.3 + 2.0);
}

/* ───────────── camera ───────────── */

export interface View {
  pos: Vec3;
  /** Columns: right, up, forward. */
  basis: [number, number, number, number, number, number, number, number, number];
  /** tan of the half field of view in x and y, then the lens shift in x and y. */
  lens: [number, number, number, number];
}

const CAMERA: Vec3 = [-0.2, 1.15, 0.2];
/** Angles below and above the horizon at the bottom and top edges, on a landscape screen. */
const TAN_BOTTOM = Math.tan((15 * Math.PI) / 180);
const TAN_TOP = Math.tan((33 * Math.PI) / 180);
/** On landscape screens the vanishing point sits right of centre, away from the hero text. */
const VANISH_NDC = 0.16;
const MIN_TAN_X = 0.42;

/**
 * The camera for a given aspect ratio. Pitch stays at zero, so verticals stay
 * vertical, and lens shift does the framing. On narrow screens the field of
 * view gets taller and the shift keeps the servitor right of the text column.
 */
export function frameView(aspect: number): View {
  let tanY = (TAN_TOP + TAN_BOTTOM) / 2;
  let tanX = tanY * aspect;
  let shiftY = (TAN_TOP - TAN_BOTTOM) / 2;
  if (tanX < MIN_TAN_X) {
    tanX = MIN_TAN_X;
    const grown = tanX / aspect;
    const extra = 2 * grown - (TAN_TOP + TAN_BOTTOM);
    const bottom = TAN_BOTTOM + extra * 0.4;
    tanY = grown;
    shiftY = tanY - bottom;
  }
  const servitorTan = (SERVITOR.pos[0] - CAMERA[0]) / (CAMERA[2] - SERVITOR.pos[2]);
  const wide = -VANISH_NDC * tanX;
  const narrow = servitorTan - 0.6 * tanX;
  const k = Math.min(1, Math.max(0, (aspect - 0.75) / (1.3 - 0.75)));
  const shiftX = narrow + (wide - narrow) * k;
  return {
    pos: CAMERA,
    basis: [1, 0, 0, 0, 1, 0, 0, 0, -1],
    lens: [tanX, tanY, shiftX, shiftY],
  };
}

/* ───────────── GLSL ───────────── */

const f = (n: number) => n.toFixed(4);
const v3 = (v: Vec3) => `vec3(${f(v[0])}, ${f(v[1])}, ${f(v[2])})`;
const v4 = (a: number, b: number, c: number, d: number) => `vec4(${f(a)}, ${f(b)}, ${f(c)}, ${f(d)})`;

/** The constants block every shader starts with. */
export function sceneGLSL(): string {
  const [fx, fz] = SERVITOR.fwd;
  const [rx, rz] = SERVITOR.right;
  const lines = [
    `#define HALL_W ${f(HALL.halfWidth)}`,
    `#define BAY ${f(HALL.bay)}`,
    `#define Z0 ${f(HALL.z0)}`,
    `#define NBAYS ${HALL.bays}`,
    `#define SPRING ${f(HALL.spring)}`,
    `#define WALL_T ${f(HALL.wall)}`,
    `#define END_Z ${f(END_Z)}`,
    `#define SUN_DIR ${v3(SUN)}`,
    `#define SERV_POS ${v3(SERVITOR.pos)}`,
    `#define SERV_F vec2(${f(fx)}, ${f(fz)})`,
    `#define SERV_R vec2(${f(rx)}, ${f(rz)})`,
    `#define RACK_POS vec2(${f(RACK.x)}, ${f(RACK.z)})`,
    `#define ALTAR_Z ${f(ALTAR.z)}`,
    `#define ALTAR_TOP ${f(ALTAR.top)}`,
    `#define CENSER_PIVOT ${v3(CENSER.pivot)}`,
    `#define CENSER_LEN ${f(CENSER.length)}`,
    `#define CENSER_AMP ${f(CENSER.amplitude)}`,
    `#define CENSER_W ${f((2 * Math.PI) / CENSER.period)}`,
    `#define N_CANDLES ${candles.length}`,
    `#define N_CLUSTERS ${clusters.length}`,
    `#define N_STANDS ${stands.length}`,
    `const vec4 CANDLE_P[N_CANDLES] = vec4[N_CANDLES](${candles.map((c) => v4(c.p[0], c.p[1], c.p[2], c.r)).join(', ')});`,
    `const vec4 CANDLE_Q[N_CANDLES] = vec4[N_CANDLES](${candles.map((c) => v4(c.h, c.kind, c.group, c.lit ? 1 : 0)).join(', ')});`,
    `const vec4 CLUSTER_L[N_CLUSTERS] = vec4[N_CLUSTERS](${clusters.map((c) => v4(c.light[0], c.light[1], c.light[2], c.spread)).join(', ')});`,
    `const vec4 CLUSTER_I[N_CLUSTERS] = vec4[N_CLUSTERS](${clusters.map((c) => v4(c.power, c.range, c.group, 0)).join(', ')});`,
    `const vec4 CLUSTER_B[N_CLUSTERS] = vec4[N_CLUSTERS](${clusters.map((c) => v4(c.bound[0][0], c.bound[0][1], c.bound[0][2], c.bound[1])).join(', ')});`,
    `const ivec2 CLUSTER_R[N_CLUSTERS] = ivec2[N_CLUSTERS](${clusters.map((c) => `ivec2(${c.start}, ${c.count})`).join(', ')});`,
    `const vec4 STANDS[N_STANDS] = vec4[N_STANDS](${stands.map((s) => v4(s.x, 0, s.z, s.height)).join(', ')});`,
  ];
  return lines.join('\n');
}
