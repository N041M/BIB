/**
 * The rendered images of the scene. The page shows one as the hero
 * background, and the live overlay animates on top of the same one.
 * `npm run dev` and then `/?render-backdrop` renders them again.
 */

export interface Poster {
  /** File name stem in public/backdrop/. */
  name: string;
  /** Widths it is rendered at, largest first. The maps come from the largest. */
  widths: number[];
  aspect: number;
}

/** Landscape screens, and anything wider than portrait. */
export const WIDE: Poster = { name: 'wide', widths: [1920, 1280], aspect: 16 / 10 };
/** Portrait phones and tablets. */
export const TALL: Poster = { name: 'tall', widths: [1080, 720], aspect: 9 / 16 };

/** Screens narrower than this use the tall image. The page CSS and markup use the same query. */
export const TALL_QUERY = '(max-aspect-ratio: 4/5)';

/** The moment the images show. The live overlay starts from it, so the hand-over is seamless. */
export const STILL_TIME = 12;

export const BACKDROP_DIR = './backdrop/';

export function posterHeight(p: Poster, width: number): number {
  return Math.round(width / p.aspect);
}

/** The poster the page is showing now. */
export function currentPoster(): Poster {
  return matchMedia(TALL_QUERY).matches ? TALL : WIDE;
}
