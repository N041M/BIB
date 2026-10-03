/**
 * A cancellable timeline. Every `wait` resolves early once `skip()` is called,
 * so an async choreography can bail out and let the caller snap to the final state.
 */
export class Sequence {
  skipped = false;
  private pending = new Set<{ id: number; resolve: () => void }>();
  private skipHandlers: Array<() => void> = [];

  wait(ms: number): Promise<void> {
    if (this.skipped || ms <= 0) return Promise.resolve();
    return new Promise((resolve) => {
      const entry = { id: 0, resolve };
      entry.id = window.setTimeout(() => {
        this.pending.delete(entry);
        resolve();
      }, ms);
      this.pending.add(entry);
    });
  }

  /** Wait for the next animation frame (or resolve immediately when skipped). */
  frame(): Promise<void> {
    if (this.skipped) return Promise.resolve();
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  onSkip(fn: () => void): void {
    if (this.skipped) fn();
    else this.skipHandlers.push(fn);
  }

  skip(): void {
    if (this.skipped) return;
    this.skipped = true;
    for (const entry of this.pending) {
      clearTimeout(entry.id);
      entry.resolve();
    }
    this.pending.clear();
    const handlers = this.skipHandlers;
    this.skipHandlers = [];
    handlers.forEach((fn) => fn());
  }
}

/** Animate a number from 0→1 over `ms`, calling `fn` with eased progress. */
export function tween(
  ms: number,
  fn: (t: number) => void,
  ease: (t: number) => number = easeInOutCubic,
  seq?: Sequence,
): Promise<void> {
  return new Promise((resolve) => {
    if (ms <= 0 || seq?.skipped) {
      fn(1);
      resolve();
      return;
    }
    const start = performance.now();
    const step = (now: number) => {
      if (seq?.skipped) {
        fn(1);
        resolve();
        return;
      }
      const t = Math.min(1, (now - start) / ms);
      fn(ease(t));
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
export const easeOutExpo = (t: number): number => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));
export const linear = (t: number): number => t;

export const rand = (min: number, max: number): number => min + Math.random() * (max - min);
export const randInt = (min: number, max: number): number => Math.floor(rand(min, max + 1));
export const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];
