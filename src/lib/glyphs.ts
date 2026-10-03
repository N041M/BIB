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
