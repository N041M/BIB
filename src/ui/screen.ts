import { BRAND } from '../config';
import { PRODUCTS, type Product } from '../data/catalog';
import { prefersReducedMotion, qs } from '../lib/dom';
import { archiveDate, clock, pad } from '../lib/format';
import { easeInOutCubic, Sequence, tween } from '../lib/sequence';
import { SharedRenderer } from '../three/renderer';
import { afterglow, clearScripted, degauss, play, powerOff, powerOn, rasterDraw, Telemetry, WAVE_FILTER } from './boot';
import { CartDrawer } from './cart';
import { Inspector } from './inspector';
import type { TabId } from './page';
import { Store, TABS } from './store';

export interface ScreenCallbacks {
  /** The standby glass was pressed. */
  onActivate: (origin: DOMRect) => void;
  onExit: () => void;
  onInspect: (product: Product) => void;
  onCloseInspector: () => void;
}

type State = 'standby' | 'expand' | 'power' | 'telemetry' | 'draw' | 'on' | 'shutdown' | 'collapse';

export interface ActivateOptions {
  /** The rectangle the glass grows from. Defaults to where the glass sits on the page. */
  origin?: DOMRect;
  /** Fill the tab at once, for a page load that starts in the archive. */
  instant?: boolean;
  /** Leave out the readout, for deep links straight to a pattern. */
  quick?: boolean;
}

const MAX_WIDTH = 1680;

/**
 * The cogitator screen. On the page it waits in standby below the hero. When
 * it is activated it grows until it fills the tab, powers on, prints its
 * start-up readout and redraws itself as the archive. Exiting powers it off
 * and shrinks it back onto the page.
 */
export class Screen {
  readonly store: Store;
  readonly inspector: Inspector;
  readonly cart: CartDrawer;
  private renderer = new SharedRenderer();
  private telemetry = new Telemetry();
  private state: State = 'standby';
  private seq?: Sequence;
  /** Bumped on every activation and exit, so a superseded run stops where it is. */
  private gen = 0;
  private queued: Array<() => void> = [];
  /** A pattern asked for before the screen was on. It opens once the boot ends. */
  private pendingInspect?: Product;
  private returnFocus: HTMLElement | null = null;
  /** Corner radius of the glass on the page, measured before it grows. */
  private radius = 24;

  constructor(
    private glass: HTMLElement,
    private cb: ScreenCallbacks,
  ) {
    glass.innerHTML = /* html */ `
<div class="crt__tube">
  <div class="crt__screen"></div>
  <div class="crt__boot"></div>
</div>
<button type="button" class="crt__standby" aria-label="Open the pattern archive">
  <span class="sb__corner sb__corner--tl">CH-01 · ${BRAND.nodeId}</span>
  <span class="sb__corner sb__corner--tr sb__clock"></span>
  <span class="sb__corner sb__corner--bl">${pad(PRODUCTS.length)} PATTERNS ON FILE</span>
  <span class="sb__corner sb__corner--br">STANDBY</span>
  <span class="sb__main">
    <span class="sb__title">${BRAND.terminalName} <span class="tui__sep">//</span> ${BRAND.terminalSub}</span>
    <span class="sb__ready">READY FOR USE</span>
    <span class="sb__hint">PRESS TO ACTIVATE<i class="caret"></i></span>
  </span>
</button>
<div class="crt__raster" aria-hidden="true"></div>
<div class="crt__beam" aria-hidden="true"></div>
<div class="crt__dot" aria-hidden="true"></div>
<div class="crt__sweep" aria-hidden="true"></div>
<button type="button" class="crt__skip">SKIP <kbd>ESC</kbd></button>
<div class="crt__fx" aria-hidden="true"><i class="crt__noise"></i><i class="crt__lines"></i><i class="crt__roll"></i><i class="crt__vignette"></i><i class="crt__glare"></i><i class="crt__scratches"></i></div>
<p class="sr-only crt__status" aria-live="polite"></p>
${WAVE_FILTER}`;
    glass.dataset.state = 'standby';

    this.store = new Store(this.renderer, {
      onInspect: (p) => cb.onInspect(p),
      onOpenCart: () => this.cart.open(),
      onRestart: () => void this.restart(),
      onExit: () => cb.onExit(),
    });
    this.inspector = new Inspector({ onClose: () => cb.onCloseInspector(), onOpenCart: () => this.cart.open() });
    this.cart = new CartDrawer();
    qs(glass, '.crt__screen').append(this.store.el);
    qs(glass, '.crt__boot').append(this.telemetry.el);
    this.store.body.append(this.inspector.el, this.cart.el);

    qs(glass, '.crt__standby').addEventListener('click', () => cb.onActivate(this.slotRect()));
    qs(glass, '.crt__skip').addEventListener('click', () => this.seq?.skip());
    document.addEventListener('keydown', (e) => this.onKey(e));

    // fetch the models once the screen scrolls into view, not on every visit
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    if (!saveData) {
      const near = new IntersectionObserver(([entry]) => {
        if (!entry.isIntersecting) return;
        near.disconnect();
        this.store.loadModels();
      }, { threshold: 0.1 });
      near.observe(glass);
    }

    this.tickStandby();
    window.setInterval(() => this.tickStandby(), 1000);
  }

  /** True from activation until the glass is back in standby on the page. */
  get isActive(): boolean {
    return this.state !== 'standby';
  }

  activate(opts: ActivateOptions = {}): void {
    if (this.state !== 'standby') return;
    this.store.loadModels();
    void this.run(opts);
  }

  /** Power off and shrink back onto the page. */
  async deactivate(): Promise<void> {
    if (this.state === 'standby' || this.state === 'shutdown' || this.state === 'collapse') return;
    const gen = ++this.gen;
    const reduced = prefersReducedMotion();
    this.seq?.skip();
    this.seq = undefined;
    this.telemetry.stop();
    this.queued = [];
    this.pendingInspect = undefined;
    this.cart.close();
    if (this.inspector.isOpen) {
      this.inspector.close();
      this.store.setRenderingPaused(false);
    }

    this.setState('shutdown');
    clearScripted(this.glass);
    this.renderer.freeze();
    if (!reduced) await powerOff(this.glass);
    if (gen !== this.gen) return;

    this.setState('collapse');
    this.renderer.stop();
    this.store.deactivate();
    // the page comes back while the point fades and the dark glass returns to its place
    document.documentElement.classList.remove('is-dimmed');
    if (!reduced) {
      const glow = afterglow(this.glass);
      await new Promise((r) => window.setTimeout(r, 140));
      const to = this.slotRect();
      if (to.bottom > 0 && to.top < window.innerHeight) {
        const clip = this.clipper(to);
        await tween(560, (k) => clip(1 - k), easeInOutCubic);
      } else {
        await play(this.glass, [{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' });
      }
      await glow;
    }
    if (gen !== this.gen) return;

    clearScripted(this.glass);
    this.glass.classList.remove('is-full');
    this.glass.style.clipPath = '';
    document.documentElement.classList.remove('is-terminal');
    this.setState('standby');
    this.store.reset();
    // back in standby: the waiting message flickers on
    if (!reduced) {
      void play(qs(this.glass, '.crt__standby'), [{ opacity: 0 }, { opacity: 0.7, offset: 0.25 }, { opacity: 0.1, offset: 0.45 }, { opacity: 1 }], { duration: 360, easing: 'steps(2)' });
    }
    this.returnFocus?.focus?.({ preventScroll: true });
    this.returnFocus = null;
  }

  showTab(tab: TabId): void {
    if (this.inspector.isOpen) this.cb.onCloseInspector();
    this.cart.close();
    this.store.setTab(tab, this.state === 'on');
  }

  openCart(): void {
    this.whenOn(() => {
      if (this.inspector.isOpen) this.cb.onCloseInspector();
      this.cart.open();
    });
  }

  openInspector(product: Product): void {
    if (this.state !== 'on') {
      this.pendingInspect = product;
      return;
    }
    this.cart.close();
    this.store.setTab('archive');
    this.store.setRenderingPaused(true);
    this.inspector.open(product);
  }

  closeInspector(): void {
    this.pendingInspect = undefined;
    if (!this.inspector.isOpen) return;
    this.inspector.close();
    this.store.setRenderingPaused(false);
  }

  private whenOn(fn: () => void): void {
    if (this.state === 'on') fn();
    else this.queued.push(fn);
  }

  private async run({ origin, instant, quick }: ActivateOptions): Promise<void> {
    const gen = ++this.gen;
    const live = () => gen === this.gen;
    const seq = (this.seq = new Sequence());
    const reduced = prefersReducedMotion();
    const html = document.documentElement;
    if (!this.returnFocus && document.activeElement instanceof HTMLElement) this.returnFocus = document.activeElement;
    this.store.reset();
    this.announce('Starting the archive');

    // the standby picture drops out before the glass grows
    if (!instant && !reduced && !origin) {
      await play(qs(this.glass, '.crt__standby'), [{ opacity: 1 }, { opacity: 0.15 }, { opacity: 0.9 }, { opacity: 0 }], { duration: 180, easing: 'steps(4)', fill: 'forwards' }, seq);
      if (!live()) return;
    }

    const from = origin ?? this.slotRect();
    this.radius = parseFloat(getComputedStyle(this.glass).borderTopLeftRadius) || 24;
    const clip = this.clipper(from);
    if (!instant && !reduced) clip(0);
    this.glass.classList.add('is-full');
    html.classList.add('is-terminal', 'is-dimmed');
    this.setState('expand');
    clearScripted(this.glass);
    if (!instant && !reduced) await tween(720, clip, easeInOutCubic, seq);
    this.glass.style.clipPath = '';
    if (!live()) return;

    if (reduced) {
      this.finish(gen);
      return;
    }

    this.setState('power');
    await powerOn(this.glass, seq);
    if (!live()) return;

    if (!quick && !seq.skipped) {
      this.setState('telemetry');
      void degauss(this.glass, qs(this.glass, '.crt__boot'), seq);
      await this.telemetry.run(seq);
      if (!live()) return;
    }

    if (!seq.skipped) {
      // one blank frame between the readout and the archive
      const draw = rasterDraw(this.glass, seq, quick ? 0 : 90);
      this.setState('draw');
      this.renderer.start();
      this.store.activate();
      const intro = this.store.intro(seq);
      await draw;
      await intro;
      if (!live()) return;
    }
    this.finish(gen);
  }

  /** Snap to the finished archive (end of the boot, Skip, or reduced motion). */
  private finish(gen: number): void {
    if (gen !== this.gen) return;
    this.seq?.skip();
    this.seq = undefined;
    this.telemetry.stop();
    clearScripted(this.glass);
    this.glass.style.clipPath = '';
    this.setState('on');
    this.store.finishIntro();
    this.renderer.start();
    this.store.activate();
    this.announce('Archive ready');
    qs<HTMLElement>(this.store.el, '.tui__tab[aria-selected="true"]').focus({ preventScroll: true });
    const queued = this.queued;
    this.queued = [];
    queued.forEach((fn) => fn());
    const product = this.pendingInspect;
    this.pendingInspect = undefined;
    if (product) this.openInspector(product);
  }

  private async restart(): Promise<void> {
    if (this.state !== 'on') return;
    const gen = ++this.gen;
    this.cart.close();
    if (this.inspector.isOpen) this.cb.onCloseInspector();
    this.setState('shutdown');
    this.renderer.freeze();
    if (!prefersReducedMotion()) {
      await powerOff(this.glass);
      this.setState('expand');
      this.renderer.stop();
      await afterglow(this.glass, 700);
    }
    if (gen !== this.gen) return;
    this.setState('expand');
    clearScripted(this.glass);
    this.renderer.stop();
    await new Promise((r) => window.setTimeout(r, 300));
    if (gen !== this.gen) return;
    this.setState('standby');
    // already full screen, so power straight on
    void this.run({ instant: true });
  }

  private setState(state: State): void {
    this.glass.dataset.prev = this.state;
    this.state = state;
    this.glass.dataset.state = state;
  }

  /** Where the glass sits on the page: the section's content box, centred at its max width. */
  private slotRect(): DOMRect {
    const host = this.glass.parentElement!;
    const r = host.getBoundingClientRect();
    const cs = getComputedStyle(host);
    const pl = parseFloat(cs.paddingLeft);
    const pr = parseFloat(cs.paddingRight);
    const pt = parseFloat(cs.paddingTop);
    const pb = parseFloat(cs.paddingBottom);
    const w = r.width - pl - pr;
    const gw = Math.min(w, MAX_WIDTH);
    return new DOMRect(r.left + pl + (w - gw) / 2, r.top + pt, gw, r.height - pt - pb);
  }

  /** A setter that clips the full-tab glass between `from` (0) and the whole viewport (1). */
  private clipper(from: DOMRect): (k: number) => void {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const f = { t: from.top, r: vw - from.right, b: vh - from.bottom, l: from.left };
    return (k: number) => {
      if (k >= 1) {
        this.glass.style.clipPath = '';
        return;
      }
      const i = (v: number) => (v * (1 - k)).toFixed(2);
      this.glass.style.clipPath = `inset(${i(f.t)}px ${i(f.r)}px ${i(f.b)}px ${i(f.l)}px round ${i(this.radius)}px)`;
    };
  }

  private tickStandby(): void {
    if (this.state !== 'standby') return;
    qs(this.glass, '.sb__clock').textContent = `${archiveDate()} ${clock()}`;
  }

  private announce(text: string): void {
    qs(this.glass, '.crt__status').textContent = text;
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.isActive) return;
    if (e.key === 'Escape') {
      if (this.seq) this.seq.skip();
      else if (this.cart.isOpen) this.cart.close();
      else if (this.inspector.isOpen) this.cb.onCloseInspector();
      return;
    }
    // 1–4 switch sections while nothing is open over the archive
    const n = Number(e.key);
    if (!Number.isInteger(n) || n < 1 || n > TABS.length || e.metaKey || e.ctrlKey || e.altKey) return;
    if (this.state !== 'on' || this.inspector.isOpen || this.cart.isOpen) return;
    if (document.activeElement instanceof HTMLInputElement) return;
    this.store.setTab(TABS[n - 1].id, true);
  }
}
