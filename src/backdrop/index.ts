import { prefersReducedMotion } from '../lib/dom';
import type { Colours, LiveRenderer } from './live';
import { BACKDROP_DIR, currentPoster, STILL_TIME, TALL, TALL_QUERY, WIDE, type Poster } from './posters';

/** Shortest gap between drawn frames, in ms: about 30 fps, then about 20 once the GPU falls behind. */
const GAP = { full: 30, slow: 46 };
/** Frames judged before deciding whether the GPU keeps up, and how many of them may be late. */
const JUDGE = { frames: 40, late: 8 };

/** The <picture> for the hero background. The browser picks the size, and the CSS crops it to fill. */
export function backdropMarkup(): string {
  const set = (p: Poster) => p.widths.map((w, i) => `${BACKDROP_DIR}${p.name}${i ? `-${w}` : ''}.webp ${w}w`).join(', ');
  return /* html */ `
  <div class="backdrop" aria-hidden="true">
    <picture>
      <source media="${TALL_QUERY}" srcset="${set(TALL)}" sizes="100vw">
      <img class="backdrop__poster" src="${BACKDROP_DIR}${WIDE.name}.webp" srcset="${set(WIDE)}" sizes="100vw" alt="" fetchpriority="high">
    </picture>
  </div>`;
}

/**
 * The corridor scene behind the hero. The page shows it as an ordinary image
 * from the start. Once the page has loaded and gone idle, a small WebGL
 * overlay takes over on top of the same image and animates the candle
 * flicker, flames, censer, smoke and dust.
 *
 * The overlay draws only while the hero is on screen, the tab is visible and
 * the archive screen is not filling the tab. It is never started with reduced
 * motion, when the browser asks to save data, or without WebGL2. When frames
 * keep arriving late it drops to about 20 fps, then stops and leaves the
 * image.
 */
export class Backdrop {
  private img: HTMLImageElement;
  private canvas?: HTMLCanvasElement;
  private live?: LiveRenderer;
  private poster?: Poster;
  private raf = 0;
  private onScreen = true;
  private dimmed = document.documentElement.classList.contains('is-dimmed');
  private t0 = 0;
  private gap: number = GAP.full;
  private lastDraw = 0;
  /** Set when a frame came due while the GPU was still busy. */
  private waited = false;
  private judged = { frames: 0, late: 0 };
  private stopped = false;

  constructor(private host: HTMLElement) {
    this.img = host.querySelector('img')!;
  }

  /** Start the overlay once the page is idle, unless the reader or the device rules it out. */
  start(): void {
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    if (prefersReducedMotion() || saveData) return;
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 300));
    const go = () => idle(() => void this.begin(), { timeout: 3000 });
    if (document.readyState === 'complete') go();
    else window.addEventListener('load', go, { once: true });

    new IntersectionObserver(([entry]) => {
      this.onScreen = entry.isIntersecting;
      this.wake();
    }).observe(this.host);
    new MutationObserver(() => {
      this.dimmed = document.documentElement.classList.contains('is-dimmed');
      this.wake();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    // a turned phone or a resized window can switch to the other image, which needs a new overlay
    matchMedia(TALL_QUERY).addEventListener('change', () => {
      if (this.live && currentPoster() !== this.poster) this.restart();
    });
  }

  private async begin(): Promise<void> {
    if (this.stopped) return;
    try {
      // the page has loaded by now, so the browser has picked which file to show
      const poster = currentPoster();
      const width = poster.widths.find((w) => this.img.currentSrc.includes(`${poster.name}-${w}.`)) ?? poster.widths[0];
      const { LiveRenderer } = await import('./live');
      const canvas = document.createElement('canvas');
      canvas.className = 'backdrop__canvas';
      canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        this.stop();
      });
      this.live = await LiveRenderer.create(canvas, poster, width, readColours());
      this.poster = poster;
      this.canvas = canvas;
      this.host.append(canvas);
      this.t0 = performance.now();
      this.wake();
    } catch (err) {
      console.warn('[backdrop]', err);
      this.stop();
    }
  }

  private restart(): void {
    this.teardown();
    this.gap = GAP.full;
    this.judged = { frames: 0, late: 0 };
    void this.begin();
  }

  private wake(): void {
    if (!this.raf && this.live && this.onScreen && !this.dimmed) this.raf = requestAnimationFrame(this.tick);
  }

  private tick = (now: number): void => {
    this.raf = 0;
    const live = this.live;
    if (!live || !this.onScreen || this.dimmed) return;
    try {
      live.prepare();
      if (!live.ready) return this.wake();
      if (now - this.lastDraw >= this.gap) {
        if (!live.idle()) {
          this.waited = true;
        } else {
          if (this.lastDraw && now - this.lastDraw < 250) this.judge(this.waited);
          this.waited = false;
          this.lastDraw = now;
          live.render(STILL_TIME + (now - this.t0) / 1000);
          this.host.classList.add('is-live');
        }
      }
      this.wake();
    } catch (err) {
      console.warn('[backdrop]', err);
      this.stop();
    }
  };

  /** Count late frames, and draw less once too many are late. */
  private judge(late: boolean): void {
    this.judged.frames++;
    if (late) this.judged.late++;
    if (this.judged.frames < JUDGE.frames) return;
    const tooSlow = this.judged.late > JUDGE.late;
    this.judged = { frames: 0, late: 0 };
    if (!tooSlow) return;
    if (this.gap === GAP.full) this.gap = GAP.slow;
    else this.stop();
  }

  /** Give up on the overlay for good and leave the image. */
  private stop(): void {
    this.stopped = true;
    this.teardown();
  }

  private teardown(): void {
    window.cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.host.classList.remove('is-live');
    const canvas = this.canvas;
    this.live?.dispose();
    this.live = undefined;
    this.canvas = undefined;
    // let the image fade back in before the canvas goes
    if (canvas) window.setTimeout(() => canvas.remove(), 700);
  }
}

/** The accent and the page background from the active palette. */
function readColours(): Colours {
  const style = getComputedStyle(document.documentElement);
  return { accent: toLinear(rgb(style.getPropertyValue('--accent'))), bg: rgb(style.getPropertyValue('--bg')) };
}

function rgb(hex: string): [number, number, number] {
  const m = hex.trim().match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return [0, 0, 0];
  return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
}

function toLinear(c: [number, number, number]): [number, number, number] {
  return c.map((v) => Math.pow(v, 2.2)) as [number, number, number];
}
