/** Pixel-art and line glyphs used across the cogitator UI (all original artwork). */

const SKULL = [
  '..#######..',
  '.#########.',
  '###########',
  '##...#...##',
  '##...#...##',
  '###########',
  '####.#.####',
  '.#########.',
  '..#.#.#.#..',
  '..#######..',
];

function pixelPath(rows: string[]): string {
  let d = '';
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (row[x] !== '#') {
        x++;
        continue;
      }
      let run = 1;
      while (row[x + run] === '#') run++;
      d += `M${x} ${y}h${run}v1h-${run}z`;
      x += run;
    }
  });
  return d;
}

const SKULL_PATH = pixelPath(SKULL);

export function skull(cls = 'glyph-skull'): string {
  return `<svg class="${cls}" viewBox="-1 -1 13 12" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="${SKULL_PATH}"/></svg>`;
}

/** The archive sigil: a pointed gothic arch with a skull at its heart. */
export function sigil(cls = 'glyph-sigil'): string {
  return `<svg class="${cls}" viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="miter">
    <path d="M10 60 V32 C10 16 20 7 32 3 C44 7 54 16 54 32 V60"/>
    <path d="M17 60 V33 C17 21 24 13 32 9.5 C40 13 47 21 47 33 V60" stroke-width="1.2" opacity=".55"/>
    <path d="M4 60 H60 M7 56 H57" stroke-width="1.6"/>
    <g transform="translate(23.5 26) scale(1.55)" stroke="none" fill="currentColor" shape-rendering="crispEdges"><path d="${SKULL_PATH}"/></g>
    <path d="M32 44 V52 M28 48 H36" stroke-width="1.6"/>
  </svg>`;
}

export function chevron(cls = 'glyph-chev'): string {
  return `<svg class="${cls}" viewBox="0 0 10 10" aria-hidden="true"><path d="M3 1 L7 5 L3 9" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>`;
}

export function close(cls = 'glyph-close'): string {
  return `<svg class="${cls}" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2 L10 10 M10 2 L2 10" stroke="currentColor" stroke-width="1.6"/></svg>`;
}

export const CATEGORY_GLYPH: Record<string, string> = {
  armour: '▣',
  terrain: '▤',
  relics: '◈',
  characters: '◉',
};

/** Deterministic wobble so the wax edge looks pressed, not drawn with a compass. */
function waxEdge(cx: number, cy: number, r: number, points = 28): string {
  let d = '';
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    const wobble = 1 + 0.07 * Math.sin(i * 2.3) + 0.04 * Math.sin(i * 5.1 + 1);
    const x = cx + Math.cos(a) * r * wobble;
    const y = cy + Math.sin(a) * r * wobble;
    d += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return `${d}Z`;
}

/** A wax purity seal with two parchment strips, the archive's mark of a licensed pattern. */
export function puritySeal(cls = 'glyph-seal'): string {
  const strip = (x: number, tilt: number, len: number) => {
    const lines = Array.from({ length: 6 }, (_, i) => {
      const y = 50 + i * ((len - 18) / 6);
      const w = 9 - (i % 3) * 2;
      return `<path d="M${x - 5} ${y}h${w}" />`;
    }).join('');
    return `<g transform="rotate(${tilt} ${x} 40)">
      <path d="M${x - 8} 38 L${x + 8} 38 L${x + 7} ${38 + len} L${x} ${32 + len} L${x - 7} ${38 + len} Z" fill="url(#seal-paper)" stroke="#7d7160" stroke-width=".6"/>
      <g stroke="#6b5f4f" stroke-width=".9" opacity=".75">${lines}</g>
    </g>`;
  };
  return `<svg class="${cls}" viewBox="0 0 64 120" aria-hidden="true">
    <defs>
      <linearGradient id="seal-paper" x1="0" x2="1"><stop offset="0" stop-color="#d9cfb8"/><stop offset=".5" stop-color="#efe7d4"/><stop offset="1" stop-color="#cfc4ab"/></linearGradient>
      <radialGradient id="seal-wax" cx=".38" cy=".32" r=".75"><stop offset="0" stop-color="#d4262c"/><stop offset=".55" stop-color="#a1121a"/><stop offset="1" stop-color="#5e080c"/></radialGradient>
    </defs>
    ${strip(24, 6, 74)}
    ${strip(40, -9, 62)}
    <path d="${waxEdge(32, 30, 24)}" fill="url(#seal-wax)"/>
    <circle cx="32" cy="30" r="15.5" fill="none" stroke="#5a070b" stroke-width="1.6" opacity=".8"/>
    <circle cx="32" cy="30" r="13.5" fill="none" stroke="#e24a4f" stroke-width=".6" opacity=".45"/>
    <g transform="translate(25.5 23.5) scale(1.18)" fill="#5a070b" shape-rendering="crispEdges"><path d="${SKULL_PATH}"/></g>
    <g transform="translate(25 23) scale(1.18)" fill="#e0454a" opacity=".35" shape-rendering="crispEdges"><path d="${SKULL_PATH}"/></g>
    <ellipse cx="24" cy="20" rx="7" ry="3.5" fill="#fff" opacity=".16" transform="rotate(-30 24 20)"/>
  </svg>`;
}
