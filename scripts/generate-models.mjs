#!/usr/bin/env node
// Procedurally builds the storefront's miniature models and writes them as
// binary STL files (millimetres, Z-up, resting on z = 0, centred on X/Y).
//
//   npm run models                 # build all nine
//   node scripts/generate-models.mjs servo tank   # build a subset (substring match)

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { finalize, toBinarySTL } from './models/lib.mjs';

import tank from './models/castellan-battle-tank.mjs';
import pod from './models/orbital-descent-pod.mjs';
import ruin from './models/basilica-ruin.mjs';
import barricade from './models/siege-barricade-kit.mjs';
import shrine from './models/reliquary-shrine.mjs';
import blade from './models/oathbreaker-relic-blade.mjs';
import cogitator from './models/cogitator-terminal.mjs';
import helm from './models/void-knight-helm-bust.mjs';
import servo from './models/servo-skull-drone.mjs';

const MODELS = [
  ['castellan-battle-tank', tank],
  ['orbital-descent-pod', pod],
  ['basilica-ruin', ruin],
  ['siege-barricade-kit', barricade],
  ['reliquary-shrine', shrine],
  ['oathbreaker-relic-blade', blade],
  ['cogitator-terminal', cogitator],
  ['void-knight-helm-bust', helm],
  ['servo-skull-drone', servo],
];

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'models');
mkdirSync(outDir, { recursive: true });

const filters = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const strict = process.argv.includes('--strict');
const MAX_BYTES = 700 * 1024;

let failed = false;
for (const [name, build] of MODELS) {
  if (filters.length && !filters.some((f) => name.includes(f))) continue;
  const t0 = Date.now();
  const builder = build();
  const { geometry, issues, parts } = finalize(builder);
  const buf = toBinarySTL(geometry);
  const file = join(outDir, `${name}.stl`);
  writeFileSync(file, buf);
  const tris = geometry.attributes.position.count / 3;
  const s = geometry.boundingBox.getSize(geometry.boundingBox.min.clone());
  console.log(
    `${name.padEnd(26)} ${String(tris).padStart(6)} tris  ${(buf.length / 1024).toFixed(1).padStart(6)} KB  ` +
      `${s.x.toFixed(1)} x ${s.y.toFixed(1)} x ${s.z.toFixed(1)} mm  ${parts} parts  (${Date.now() - t0} ms)`,
  );
  if (buf.length > MAX_BYTES) {
    console.warn(`  ! ${name} exceeds ${MAX_BYTES} bytes`);
    failed = true;
  }
  if (process.argv.includes('--tags')) {
    const by = {};
    for (const g of builder.parts) {
      const t = (g.userData.tag || '?').replace('~m', '');
      by[t] = (by[t] || 0) + g.attributes.position.count / 3;
    }
    console.log('  ' + Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join('  '));
  }
  for (const msg of issues.slice(0, 12)) console.warn(`  ! ${msg}`);
  if (issues.length > 12) console.warn(`  ! ... ${issues.length - 12} more`);
  if (issues.length && strict) failed = true;
}
if (failed) process.exitCode = 1;
