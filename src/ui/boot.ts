import { BRAND } from '../config';
import { PRODUCTS } from '../data/catalog';
import { fromHTML, qs, qsa } from '../lib/dom';
import { archiveDate, clock, formatBytes, formatInt, pad } from '../lib/format';
import type { Sequence } from '../lib/sequence';
import { loadModel, type ModelData } from '../three/models';

/** Run a Web Animation and resolve when it ends, or at once when the sequence is skipped. */
export function play(el: Element, frames: Keyframe[], opts: KeyframeAnimationOptions, seq?: Sequence): Promise<void> {
  if (seq?.skipped) return Promise.resolve();
  const anim = el.animate(frames, opts);
  return new Promise((resolve) => {
    anim.finished.then(
      () => resolve(),
      () => resolve(),
    );
    seq?.onSkip(() => {
      anim.cancel();
      resolve();
    });
  });
}

/** Cancel every scripted animation on the glass, leaving the CSS ones running. */
export function clearScripted(root: HTMLElement): void {
  root
    .getAnimations({ subtree: true })
    .filter((a) => !(a instanceof CSSAnimation) && !(a instanceof CSSTransition))
    .forEach((a) => a.cancel());
}

/**
 * Tube power-on. The dark glass lifts for a moment as the tube charges, a
 * point in the centre draws out into a line, and the line opens into an
 * overexposed raster that settles to black. Resolves once the raster fills
 * the glass, so the first readout appears under the glare.
 */
export async function powerOn(glass: HTMLElement, seq: Sequence): Promise<void> {
  const beam = qs(glass, '.crt__beam');
  const raster = qs(glass, '.crt__raster');
  const noise = qs(glass, '.crt__noise');

  void play(raster, [{ opacity: 0, transform: 'none' }, { opacity: 0.05, transform: 'none', offset: 0.3 }, { opacity: 0, transform: 'none' }], { duration: 170 }, seq);
  await seq.wait(200);

  await play(
    beam,
    [
      { transform: 'scale(0, 1)', opacity: 0 },
      { transform: 'scale(0.012, 1)', opacity: 1, offset: 0.16 },
      { transform: 'scale(1, 1)', opacity: 1 },
    ],
    { duration: 230, easing: 'cubic-bezier(.45,.05,.2,1)', fill: 'forwards' },
    seq,
  );
  await seq.wait(70);

  void play(beam, [{ transform: 'scale(1, 1)', opacity: 1 }, { transform: 'scale(1, 8)', opacity: 0 }], { duration: 150, easing: 'ease-out', fill: 'forwards' }, seq);
  void play(noise, [{ opacity: 0.55 }, { opacity: 0.2, offset: 0.35 }, { opacity: 0.05 }], { duration: 1400, easing: 'ease-out' }, seq);
  void play(
    raster,
    [
      { transform: 'scaleY(0.006)', opacity: 1 },
      { transform: 'scaleY(1)', opacity: 0.92, offset: 0.26 },
      { transform: 'scaleY(1)', opacity: 0.32, offset: 0.55 },
      { transform: 'scaleY(1)', opacity: 0 },
    ],
    { duration: 900, easing: 'cubic-bezier(.2,.7,.2,1)' },
    seq,
  );
  await seq.wait(230);
}

/** The filter `degauss` drives. It goes in the glass markup once. */
export const WAVE_FILTER = /* html */ `
<svg class="crt__defs" width="0" height="0" aria-hidden="true" focusable="false">
  <filter id="crt-wave" x="-5%" y="0" width="110%" height="100%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.0015 0.01" numOctaves="2" seed="7" result="noise"/>
    <feColorMatrix in="noise" type="matrix" values="1 0 0 0 0  0 0 0 0 0.5  0 0 0 0 0  0 0 0 0 1" result="bands"/>
    <feDisplacementMap in="SourceGraphic" in2="bands" scale="0" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
</svg>`;

/**
 * Degauss. For a moment the picture bends sideways in rolling horizontal
 * waves and blooms, then settles flat. Rows shift independently, so nothing
 * moves as a block.
 */
export function degauss(glass: HTMLElement, target: HTMLElement, seq: Sequence, ms = 950): Promise<void> {
  const map = glass.querySelector('#crt-wave feDisplacementMap');
  const noise = glass.querySelector('#crt-wave feTurbulence');
  if (!map || !noise || seq.skipped) return Promise.resolve();
  return new Promise((resolve) => {
    const start = performance.now();
    let raf = 0;
    const done = () => {
      cancelAnimationFrame(raf);
      target.style.filter = '';
      map.setAttribute('scale', '0');
      resolve();
    };
    seq.onSkip(done);
    const step = (now: number) => {
      const t = (now - start) / ms;
      if (t >= 1 || seq.skipped) {
        done();
        return;
      }
      const k = Math.pow(1 - t, 2);
      // the bands drift and stretch as the field collapses
      const fy = 0.009 + 0.005 * Math.sin(now / 95);
      noise.setAttribute('baseFrequency', `0.0012 ${fy.toFixed(4)}`);
      map.setAttribute('scale', (64 * k * (0.75 + 0.25 * Math.sin(now / 41))).toFixed(1));
      target.style.filter = `url(#crt-wave) brightness(${(1 + 1.4 * k).toFixed(2)})`;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  });
}

/** The archive is drawn onto the glass from the top down, behind a bright scan line. */
export async function rasterDraw(glass: HTMLElement, seq: Sequence, delay = 0): Promise<void> {
  const screen = qs(glass, '.crt__screen');
  const sweep = qs(glass, '.crt__sweep');
  const h = glass.clientHeight;
  const opts: KeyframeAnimationOptions = { duration: 480, delay, easing: 'linear', fill: 'backwards' };
  void play(sweep, [{ transform: 'translateY(0)', opacity: 1 }, { transform: `translateY(${h}px)`, opacity: 1 }], opts, seq);
  await play(screen, [{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0% 0)' }], opts, seq);
}

/**
 * Tube power-off. The picture flares once and folds into a bright line across
 * the middle, and the line pulls in to a point. Resolves when the point has
 * formed. `afterglow` fades it.
 */
export async function powerOff(glass: HTMLElement): Promise<void> {
  const tube = qs(glass, '.crt__tube');
  const beam = qs(glass, '.crt__beam');
  const dot = qs(glass, '.crt__dot');
  const raster = qs(glass, '.crt__raster');

  void play(raster, [{ opacity: 0, transform: 'none' }, { opacity: 0.28, transform: 'none', offset: 0.3 }, { opacity: 0, transform: 'none' }], { duration: 180 });
  await play(
    tube,
    [
      { transform: 'scaleY(1)', filter: 'brightness(1)', opacity: 1 },
      { transform: 'scaleY(0.012)', filter: 'brightness(3.5)', opacity: 1 },
    ],
    { duration: 180, easing: 'cubic-bezier(.75,0,.9,.35)', fill: 'forwards' },
  );
  void play(tube, [{ opacity: 1 }, { opacity: 0 }], { duration: 50, fill: 'forwards' });
  await play(
    beam,
    [
      { transform: 'scale(1, 1.4)', opacity: 1 },
      { transform: 'scale(0.01, 1)', opacity: 1 },
    ],
    { duration: 210, easing: 'cubic-bezier(.65,0,.85,.45)', fill: 'forwards' },
  );
  void play(beam, [{ opacity: 1 }, { opacity: 0 }], { duration: 60, fill: 'forwards' });
  dot.getAnimations().forEach((a) => a.cancel());
  void play(dot, [{ opacity: 1, transform: 'scale(1)' }], { duration: 1, fill: 'forwards' });
}

/** The point left by `powerOff` fades out the way phosphor does: quickly at first, then slowly. */
export function afterglow(glass: HTMLElement, ms = 520): Promise<void> {
  return play(
    qs(glass, '.crt__dot'),
    [
      { opacity: 1, transform: 'scale(1)' },
      { opacity: 0.45, transform: 'scale(0.75)', offset: 0.25 },
      { opacity: 0, transform: 'scale(0.4)' },
    ],
    { duration: ms, easing: 'ease-out', fill: 'forwards' },
  );
}

interface Step {
  text: string;
  cls?: 'hi' | 'dim' | 'inv';
  /** Pause after printing this line, in ms. Lines without one print several per frame. */
  hold?: number;
  /** Shown in the footer from this line on. */
  stage?: string;
  /** Print `text` with a spinner, then complete the line with this result. */
  awaits?: Promise<string>;
}

/** Width the dotted leaders pad each command to, in characters. */
const LEADER = 34;
/** Lines printed per frame when nothing holds the log. */
const BURST = 4;
const MAX_ROWS = 90;
/** The longest the readout waits on a slow download before moving on. */
const MODEL_WAIT_MS = 5000;
const SPIN = '|/-\\';

const lead = (cmd: string, res: string) => `${cmd} ${'.'.repeat(Math.max(3, LEADER - cmd.length))} ${res}`;
const rnd = (n: number) => Math.floor(Math.random() * n);
const hex = (n: number, len: number) => n.toString(16).toUpperCase().padStart(len, '0');
const bytes = (count: number) => Array.from({ length: count }, () => hex(rnd(256), 2)).join(' ');
const bits = (count: number) =>
  Array.from({ length: count }, () => Array.from({ length: 8 }, () => rnd(2)).join('')).join(' ');

function describe(m: ModelData): string {
  return m.placeholder ? 'NO FILE · PLACEHOLDER' : `${formatBytes(m.bytes).toUpperCase()} · ${formatInt(m.triangles)} TRI`;
}

function script(loads: Promise<string>[]): Step[] {
  const s: Step[] = [];
  const say = (text: string, cls?: Step['cls'], hold = 0, stage?: string) => s.push({ text, cls, hold, stage });
  const line = (cmd: string, res: string, hold = 24, stage?: string) => s.push({ text: lead(cmd, res), hold, stage });
  const n = PRODUCTS.length;

  say(`FORGE-BIOS 7.41 · COGITATOR ${BRAND.nodeId}`, 'hi', 70, 'POWER-ON SELF TEST');
  say(`${BRAND.terminalName} ${BRAND.terminalSub} · ${BRAND.domain.toUpperCase()}`, 'dim', 50);
  say('');
  line('LOGIC ENGINES', '8/8 ONLINE');
  line('COGITATION CORES', 'NOMINAL');
  for (let b = 0; b < 16; b++) {
    const from = b * 0x4000000;
    say(`  ${hex(from, 8)}-${hex(from + 0x3ffffff, 8)}  ${bytes(8)}  PASS`, 'dim', 0, b === 0 ? 'MEMORY' : undefined);
  }
  line('MEMORY', '1024 MB VERIFIED', 90);
  line('DATA-STACKS', '4 MOUNTED');
  line('VOX-CASTER', 'SILENT');
  line('AUSPEX ARRAY', 'CALIBRATED');
  say('');
  line('NOOSPHERE', 'CARRIER FOUND', 130, 'NOOSPHERE');
  for (let i = 0; i < 12; i++) say(`  RX ${hex(rnd(0x10000), 4)}  ${bytes(12)}`, 'dim');
  line(`HANDSHAKE ${BRAND.nodeId} <> ARCHIVE`, 'ACK', 70);
  say('');
  line('RITE OF AWAKENING', 'BEGUN', 150, 'RITE OF AWAKENING');
  line('  FIRST LITANY', 'SPOKEN', 70);
  line('  SECOND LITANY', 'SPOKEN', 70);
  line('  THIRD LITANY', 'SPOKEN', 70);
  for (let i = 0; i < 8; i++) say(`  ${bits(6)}`, 'dim');
  line('MACHINE SPIRIT', 'CONTENT', 200);
  say('');
  line('MOUNT /ARCHIVE/PATTERNS', 'OK', 30, 'PATTERN INDEX');
  line('INDEX', `${pad(n)} PATTERNS`, 30);
  PRODUCTS.forEach((p, i) => s.push({ text: `RECV ${p.id} ${p.name.toUpperCase()}`, awaits: loads[i] }));
  line('VERIFY LICENCE SEALS', `${pad(n)}/${pad(n)}`, 50, 'LICENCE SEALS');
  line('CALIBRATE HOLO-PLINTHS', '±0.02 MM');
  line('CHRONOMETRY', `${archiveDate()} ${clock()}`, 60);
  say('');
  say('++ ARCHIVE ONLINE ++', 'inv', 460, 'ONLINE');
  return s;
}

/**
 * The start-up readout: a log scrolling faster than anyone can read, with
 * memory, carrier, pattern index and stack panels beside it. The pattern
 * index reports the real model downloads as they land.
 */
export class Telemetry {
  readonly el: HTMLElement;
  private log: HTMLElement;
  private scope: HTMLCanvasElement;
  private dump: HTMLElement;
  private rows: HTMLElement[];
  private landed: Array<string | undefined> = [];
  private raf = 0;
  private frameNo = 0;
  private lastClock = 0;

  constructor() {
    this.el = fromHTML(this.template());
    this.log = qs(this.el, '.boot__log');
    this.scope = qs<HTMLCanvasElement>(this.el, '.boot__scope');
    this.dump = qs(this.el, '.boot__dump');
    this.rows = qsa(this.el, '.boot__index li');
  }

  run(seq: Sequence): Promise<void> {
    this.reset();
    const t0 = performance.now();
    const deadline = new Promise<string>((r) => window.setTimeout(() => r('DEFERRED'), MODEL_WAIT_MS));
    const loads = PRODUCTS.map((p, i) =>
      Promise.race([
        loadModel(p.file).then((m) => {
          this.landed[i] = describe(m);
          return this.landed[i]!;
        }),
        deadline,
      ]),
    );
    const steps = script(loads);

    return new Promise((resolve) => {
      let i = 0;
      let holdUntil = 0;
      let pending: { row: HTMLElement; text: string; result?: string } | null = null;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        this.stop();
        resolve();
      };
      seq.onSkip(finish);

      const frame = (now: number) => {
        if (done) return;
        this.raf = requestAnimationFrame(frame);
        const t = now - t0;
        this.ambient(now, t, i / steps.length);

        if (pending) {
          if (pending.result === undefined) {
            pending.row.textContent = `${pending.text} ${'.'.repeat(Math.max(3, LEADER - pending.text.length))} ${SPIN[Math.floor(t / 70) % 4]}`;
            return;
          }
          pending.row.textContent = lead(pending.text, pending.result);
          pending = null;
          holdUntil = now + 28;
        }
        if (now < holdUntil) return;
        if (i >= steps.length) {
          finish();
          return;
        }
        for (let n = 0; n < BURST && i < steps.length; n++) {
          const step = steps[i++];
          if (step.stage) qs(this.el, '.boot__stage').textContent = step.stage;
          const row = this.print(step);
          if (step.awaits) {
            const p: { row: HTMLElement; text: string; result?: string } = { row, text: step.text };
            void step.awaits.then((r) => (p.result = r));
            pending = p;
            break;
          }
          if (step.hold) {
            holdUntil = now + step.hold;
            break;
          }
        }
      };
      this.raf = requestAnimationFrame(frame);
    });
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private reset(): void {
    this.stop();
    this.log.replaceChildren();
    this.landed = [];
    this.frameNo = 0;
    this.lastClock = 0;
    this.rows.forEach((row) => {
      qs(row, '.boot__cells i').style.transform = 'scaleX(0)';
      qs(row, '.boot__state').textContent = 'QUEUED';
      row.classList.remove('is-done');
    });
    qs(this.el, '.boot__stage').textContent = '';
    const ctx = this.scope.getContext('2d');
    ctx?.clearRect(0, 0, this.scope.width, this.scope.height);
  }

  private print(step: Step): HTMLElement {
    const row = document.createElement('p');
    row.className = step.cls ? `boot__row is-${step.cls}` : 'boot__row';
    row.textContent = step.awaits ? step.text : step.text || ' ';
    this.log.append(row);
    while (this.log.childElementCount > MAX_ROWS) this.log.firstElementChild?.remove();
    return row;
  }

  /** Everything that moves on its own: clock, memory sweep, index, carrier trace, stack dump, progress. */
  private ambient(now: number, t: number, progress: number): void {
    this.frameNo++;
    if (now - this.lastClock > 500) {
      this.lastClock = now;
      qs(this.el, '.boot__clock').textContent = `${archiveDate()} ${clock()}`;
    }

    const mem = Math.min(1, t / 1100);
    qs(this.el, '.boot__mem').textContent = `0x${hex(Math.floor(mem * 0x3fffffff), 8)}`;
    qs(this.el, '.boot__meter i').style.transform = `scaleX(${mem})`;

    let count = 0;
    this.rows.forEach((row, i) => {
      const result = this.landed[i];
      if (result) {
        count++;
        if (!row.classList.contains('is-done')) {
          row.classList.add('is-done');
          qs(row, '.boot__cells i').style.transform = 'scaleX(1)';
          qs(row, '.boot__state').textContent = result.split(' · ')[0];
        }
        return;
      }
      const k = Math.max(0, Math.min(0.9, (t - 300 - i * 70) / 1000));
      qs(row, '.boot__cells i').style.transform = `scaleX(${k})`;
      if (k > 0) qs(row, '.boot__state').textContent = `RECV ${pad(Math.round(k * 100), 2)}%`;
    });
    qs(this.el, '.boot__count').textContent = `${pad(count)}/${pad(PRODUCTS.length)}`;

    this.drawScope(t, progress);

    if (this.frameNo % 3 === 0) {
      const base = rnd(0x10000) & 0xfff0;
      qs(this.el, '.boot__addr').textContent = `0x${hex(base, 4)}`;
      this.dump.textContent = Array.from({ length: 6 }, (_, r) => `${hex(base + r * 16, 4)}  ${bytes(8)}`).join('\n');
    }

    const pct = Math.round(progress * 100);
    qs(this.el, '.boot__pct').textContent = `${pad(pct, 3)}%`;
    qs(this.el, '.boot__bar i').style.transform = `scaleX(${progress})`;
  }

  /** A carrier trace with phosphor persistence: noisy at first, steadier as the link settles. */
  private drawScope(t: number, progress: number): void {
    const c = this.scope;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(c.clientWidth * dpr);
    const h = Math.round(c.clientHeight * dpr);
    if (!w || !h) return;
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = 'rgba(3, 8, 5, 0.34)';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(142, 230, 138, 0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    const env = Math.min(1, t / 500);
    const jitter = 0.5 * (1 - progress) + 0.06;
    const ph = t / 110;
    ctx.strokeStyle = 'rgba(190, 245, 180, 0.95)';
    ctx.lineWidth = 1.3 * dpr;
    ctx.shadowColor = 'rgba(142, 230, 138, 0.9)';
    ctx.shadowBlur = 6 * dpr;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 2 * dpr) {
      const u = x / w;
      const v =
        Math.sin(u * 15 + ph) * 0.5 + Math.sin(u * 47 - ph * 1.8) * 0.16 * (1 - progress) + (Math.random() - 0.5) * jitter;
      const y = h / 2 + v * h * 0.36 * env;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
    qs(this.el, '.boot__freq').textContent = progress > 0.45 ? 'LOCKED 127.4 MHZ' : `${(126 + Math.random() * 3).toFixed(1)} MHZ`;
  }

  private template(): string {
    const index = PRODUCTS.map(
      (p) => `<li><span>${p.id}</span><span class="boot__cells"><i></i></span><span class="boot__state">QUEUED</span></li>`,
    ).join('');
    return /* html */ `
<div class="boot" aria-hidden="true">
  <header class="boot__head"><span>${BRAND.nodeId} // ${BRAND.terminalName} ${BRAND.terminalSub}</span><span class="boot__clock"></span></header>
  <div class="boot__main">
    <div class="boot__log"></div>
    <aside class="boot__side">
      <section class="boot__block">
        <h4><span>MEMORY</span><span class="boot__mem">0x00000000</span></h4>
        <div class="boot__meter"><i></i></div>
      </section>
      <section class="boot__block">
        <h4><span>CARRIER</span><span class="boot__freq">--- MHZ</span></h4>
        <canvas class="boot__scope"></canvas>
      </section>
      <section class="boot__block">
        <h4><span>PATTERN INDEX</span><span class="boot__count">00/${pad(PRODUCTS.length)}</span></h4>
        <ol class="boot__index">${index}</ol>
      </section>
      <section class="boot__block boot__block--dump">
        <h4><span>STACK</span><span class="boot__addr">0x0000</span></h4>
        <pre class="boot__dump"></pre>
      </section>
    </aside>
  </div>
  <footer class="boot__foot"><span class="boot__stage"></span><span class="boot__bar"><i></i></span><span class="boot__pct">000%</span></footer>
</div>`;
  }
}
