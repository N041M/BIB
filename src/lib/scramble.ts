const GLYPHS = '▓▒░█▌▐<>/\\|#$%&*+=-_01ΔΣΩ§¦';

export interface ScrambleOptions {
  /** Total time in ms for the whole string to resolve. */
  duration?: number;
  delay?: number;
  /** How many scrambled glyphs run ahead of the resolved text. */
  lead?: number;
}

const running = new WeakMap<Element, number>();

/**
 * Types `text` into `el` with a cogitator-style scramble: a short tail of
 * random glyphs runs ahead of the settled characters.
 */
export function scramble(el: HTMLElement, text: string, opts: ScrambleOptions = {}): Promise<void> {
  const { duration = 600, delay = 0, lead = 4 } = opts;
  const prev = running.get(el);
  if (prev) cancelAnimationFrame(prev);
  el.textContent = '';
  return new Promise((resolve) => {
    let start = 0;
    const step = (now: number) => {
      if (!start) start = now + delay;
      const t = Math.max(0, (now - start) / Math.max(duration, 1));
      if (t >= 1) {
        el.textContent = text;
        running.delete(el);
        resolve();
        return;
      }
      const settled = Math.floor(t * text.length);
      let out = text.slice(0, settled);
      const tail = Math.min(lead, text.length - settled);
      for (let i = 0; i < tail; i++) {
        const ch = text[settled + i];
        out += ch === ' ' ? ' ' : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      }
      el.textContent = out;
      running.set(el, requestAnimationFrame(step));
    };
    running.set(el, requestAnimationFrame(step));
  });
}

/**
 * Types `text` into `el` one character at a time behind a block cursor,
 * like a cogitator printing its boot log.
 */
export function typewrite(el: HTMLElement, text: string, opts: { cps?: number; delay?: number } = {}): Promise<void> {
  const { cps = 70, delay = 0 } = opts;
  const prev = running.get(el);
  if (prev) cancelAnimationFrame(prev);
  el.textContent = '';
  el.classList.add('is-typing');
  return new Promise((resolve) => {
    let start = 0;
    const step = (now: number) => {
      if (!start) start = now + delay;
      const n = Math.max(0, Math.floor(((now - start) / 1000) * cps));
      if (n >= text.length) {
        el.textContent = text;
        el.classList.remove('is-typing');
        running.delete(el);
        resolve();
        return;
      }
      el.textContent = text.slice(0, n);
      running.set(el, requestAnimationFrame(step));
    };
    running.set(el, requestAnimationFrame(step));
  });
}

/** Instantly finish any scramble running on `el`. */
export function settle(el: HTMLElement, text: string): void {
  const prev = running.get(el);
  if (prev) cancelAnimationFrame(prev);
  running.delete(el);
  el.classList.remove('is-typing');
  el.textContent = text;
}

/** Random hex-ish gibberish used for decorative data readouts. */
export function noiseText(length: number): string {
  const set = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789/.:_-';
  let out = '';
  for (let i = 0; i < length; i++) out += set[(Math.random() * set.length) | 0];
  return out;
}
