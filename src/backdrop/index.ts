import { prefersReducedMotion } from '../lib/dom';
import { Renderer, type Size } from './renderer';

/** Pixels the bake and the frame pass work at, before the canvas scales them up. */
const BUDGET = { desktop: 1.0e6, touch: 0.45e6, floor: 0.25e6 };
/** The moment shown as a still frame when the reader prefers reduced motion. */
const STILL_TIME = 12;
/** A first bake slower than this skips the refining passes. */
const SLOW_BAKE_MS = 2000;
/** Frames measured before deciding whether the GPU keeps up. */
const SAMPLES = 90;
/** Shortest gap between drawn frames, in ms: up to about 80 fps, then about 30 once the GPU falls behind. */
const GAP = { full: 12, half: 30 };

/**
 * The corridor scene behind the hero. It draws only while the hero is on
 * screen, the tab is visible and the archive screen is not filling the tab.
 * With reduced motion it draws a single still frame.
 *
 * On a GPU that cannot keep up it first halves the frame rate, then lowers
 * the resolution. It never raises either again.
 */
export class Backdrop {
  private canvas = document.createElement('canvas');
  private renderer?: Renderer;
  private raf = 0;
  private onScreen = true;
  private dimmed = document.documentElement.classList.contains('is-dimmed');
  private still = prefersReducedMotion();
  private budget = matchMedia('(pointer: coarse)').matches ? BUDGET.touch : BUDGET.desktop;
  private rows = 12;
  private last = 0;
  private t0 = performance.now();
  private bakeStart = 0;
  private resizeTimer = 0;
  private gap: number = GAP.full;
  private lastDraw = 0;
  private gaps: number[] = [];

  constructor(private host: HTMLElement) {
    this.canvas.className = 'backdrop__canvas';
    host.append(this.canvas);

    new ResizeObserver(() => {
      window.clearTimeout(this.resizeTimer);
      this.resizeTimer = window.setTimeout(() => this.resize(), this.renderer?.hasImage ? 250 : 0);
    }).observe(host);
    new IntersectionObserver(([entry]) => {
      this.onScreen = entry.isIntersecting;
      this.wake();
    }).observe(host);
    new MutationObserver(() => {
      this.dimmed = document.documentElement.classList.contains('is-dimmed');
      this.wake();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.host.classList.remove('is-ready');
      this.renderer = undefined;
    });
    this.canvas.addEventListener('webglcontextrestored', () => this.start());
  }

  start(): void {
    try {
      this.renderer = new Renderer(this.canvas, readColours());
    } catch (err) {
      console.warn('[backdrop]', err);
      return;
    }
    this.resize();
    this.wake();
  }

  private resize(): void {
    const r = this.renderer;
    const { width, height } = this.host.getBoundingClientRect();
    if (!r || width < 1 || height < 1) return;
    const dpr = window.devicePixelRatio || 1;
    const scale = Math.min(dpr, Math.sqrt(this.budget / (width * height)));
    const out = Math.min(dpr, 2, scale * 2);
    const size: Size = {
      w: Math.round(width * scale),
      h: Math.round(height * scale),
      outW: Math.round(width * out),
      outH: Math.round(height * out),
    };
    try {
      r.resize(size);
    } catch (err) {
      this.fail(err);
    }
    if (r.baking) this.bakeStart = 0;
    this.wake();
  }

  private wake(): void {
    if (!this.raf && this.renderer && this.onScreen && !this.dimmed) this.raf = requestAnimationFrame(this.tick);
  }

  private tick = (now: number): void => {
    this.raf = 0;
    const r = this.renderer;
    if (!r || !this.onScreen || this.dimmed) return;
    const dt = this.last ? now - this.last : 16;
    this.last = now;
    try {
      if (!r.ready()) return this.wake();
      if (r.baking) {
        // Size the next strip so baking leaves the page room to breathe.
        if (dt < 22) this.rows = Math.min(this.rows * 1.25, 4096);
        else if (dt > 40) this.rows = Math.max(this.rows * 0.6, 2);
        this.bakeStart ||= now;
        const first = !r.hasImage;
        r.bakeStrip(this.rows);
        if (first && r.hasImage && now - this.bakeStart > SLOW_BAKE_MS) r.settle();
      }
      if (r.hasImage && now - this.lastDraw >= this.gap) {
        if (!r.baking && !this.still && this.lastDraw) this.measure(now - this.lastDraw);
        this.lastDraw = now;
        r.render(this.still ? STILL_TIME : (now - this.t0) / 1000);
        this.host.classList.add('is-ready');
        if (this.still && !r.baking) return;
      }
      this.wake();
    } catch (err) {
      this.fail(err);
    }
  };

  /** Watch the gaps between drawn frames, and draw less when the GPU falls behind. */
  private measure(gap: number): void {
    if (gap > 250) return;
    this.gaps.push(gap);
    if (this.gaps.length < SAMPLES) return;
    const median = this.gaps.sort((a, b) => a - b)[SAMPLES >> 1];
    this.gaps = [];
    if (median < this.gap * 1.5) return;
    if (this.gap === GAP.full) {
      this.gap = GAP.half;
    } else if (this.budget > BUDGET.floor) {
      this.budget = Math.max(BUDGET.floor, this.budget * 0.6);
      this.resize();
    }
  }

  private fail(err: unknown): void {
    console.warn('[backdrop]', err);
    this.host.classList.remove('is-ready');
    this.renderer?.dispose();
    this.renderer = undefined;
  }
}

/** The accent and the page background from the active palette. */
function readColours(): { accent: [number, number, number]; bg: [number, number, number] } {
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
