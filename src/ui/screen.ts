import { PRODUCTS } from '../data/catalog';
import { fromHTML, prefersReducedMotion, qs } from '../lib/dom';
import { easeInOutCubic, Sequence, tween } from '../lib/sequence';
import { loadModel, prefetchModels } from '../three/models';
import { SharedRenderer, type StageView } from '../three/renderer';
import { ProductStage } from '../three/stage';
import { CartDrawer } from './cart';
import { Hud } from './hud';
import { Inspector } from './inspector';
import { Store } from './store';
import type { Product } from '../data/catalog';

export interface ScreenCallbacks {
  onInspect: (product: Product) => void;
  onCloseInspector: () => void;
  onPowerDown: () => void;
}

/**
 * The cogitator screen. It is a fixed full-viewport layer that starts clipped
 * to the landing page monitor and grows until it *is* the page. No bezel, ever.
 */
export class Screen {
  readonly el: HTMLElement;
  readonly store: Store;
  readonly inspector: Inspector;
  readonly cart: CartDrawer;
  private renderer: SharedRenderer;
  private scroller: HTMLElement;
  private skipBtn: HTMLButtonElement;
  private hero?: StageView;
  private seq?: Sequence;
  booted = false;

  constructor(cb: ScreenCallbacks) {
    this.el = fromHTML(/* html */ `
<div class="screen" hidden>
  <div class="screen__bg screen__bg--store"></div>
  <div class="screen__bg screen__bg--boot"></div>
  <div class="screen__hero" aria-hidden="true"></div>
  <div class="screen__scroll"></div>
  <div class="screen__crt" aria-hidden="true"><i class="screen__grain"></i><i class="screen__lines"></i><i class="screen__roll"></i><i class="screen__vignette"></i></div>
  <div class="screen__flash" aria-hidden="true"></div>
  <button type="button" class="screen__skip">SKIP <kbd>ESC</kbd> ››</button>
</div>`);
    this.renderer = new SharedRenderer(this.el);
    // the canvas sits above the backgrounds and below the scrolling content
    this.el.insertBefore(this.renderer.canvas, qs(this.el, '.screen__hero'));
    this.scroller = qs(this.el, '.screen__scroll');
    this.skipBtn = qs<HTMLButtonElement>(this.el, '.screen__skip');
    this.skipBtn.addEventListener('click', () => this.seq?.skip());

    this.store = new Store(this.renderer, {
      onInspect: (p) => cb.onInspect(p),
      onOpenCart: () => this.cart.open(),
      onPowerDown: () => cb.onPowerDown(),
    });
    this.scroller.append(this.store.el);

    this.inspector = new Inspector({ onClose: () => cb.onCloseInspector(), onOpenCart: () => this.cart.open() });
    this.cart = new CartDrawer();
    this.el.append(this.inspector.el, this.cart.el);

    // warm the model cache and the HUD backdrop while the visitor reads the landing page
    const idle = () => {
      prefetchModels(PRODUCTS.map((p) => p.file));
      this.prepareHero();
    };
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(idle, { timeout: 3000 });
    else window.setTimeout(idle, 1500);

    document.addEventListener('keydown', (e) => {
      if (this.el.hidden || e.key !== 'Escape') return;
      if (this.seq && !this.seq.skipped) this.seq.skip();
      else if (this.cart.isOpen) this.cart.close();
      else if (this.inspector.isOpen) cb.onCloseInspector();
    });
  }

  get webglSupported(): boolean {
    return this.renderer.supported;
  }

  /**
   * The full wake sequence: expand from the monitor, power-on flash, the
   * noisy visor HUD, then the clear terminal and the patterns streaming in.
   */
  async boot(origin: DOMRect, onExpanded: () => void): Promise<void> {
    const seq = (this.seq = new Sequence());
    const reduced = prefersReducedMotion();
    const clip = this.clipper(origin);
    clip(0);
    this.setPhase('off');
    this.show();
    this.renderer.start();
    this.store.activate();

    if (reduced) {
      clip(1);
      onExpanded();
      this.setPhase('store');
      this.store.finishIntro();
      this.finishBoot();
      return;
    }

    const hud = new Hud();
    seq.onSkip(() => hud.destroy());
    this.prepareHero();
    hud.mount(this.el);

    // 1 — the monitor's glass powers on in place: a hot line blooms into a flash
    this.setPhase('ignite');
    await seq.wait(240);

    // 2 — the glass grows to fill the page while the landing fades out beneath it,
    //     and the visor details flicker in as it grows
    this.setPhase('hud');
    const expanded = tween(900, clip, easeInOutCubic, seq);
    await seq.wait(160);
    const flicker = hud.flickerIn(seq, 1200);
    await seq.wait(140);
    this.showHero();
    await expanded;
    this.el.style.clipPath = 'none';
    onExpanded();
    await flicker;

    // 3 — the HUD runs for a beat, then locks on
    if (!seq.skipped) {
      await seq.wait(800);
      if (!seq.skipped) await hud.lock(seq);
      await seq.wait(560);
    }

    // 4 — the image clears: HUD tears away, noise and teal drain out
    if (!seq.skipped) {
      this.setPhase('clear');
      this.hideHero();
      await hud.clear(seq);
      hud.destroy();
    }

    // 5 — the terminal draws itself and the archive streams in
    this.setPhase('store');
    if (!seq.skipped) await this.store.intro(seq);
    this.finishBoot();
  }

  /** Deep link straight into the archive: a short power-on without the visor phase. */
  async bootDirect(): Promise<void> {
    const seq = (this.seq = new Sequence());
    this.show();
    this.renderer.start();
    this.store.activate();
    this.el.style.clipPath = 'none';
    if (prefersReducedMotion()) {
      this.setPhase('store');
      this.store.finishIntro();
      this.finishBoot();
      return;
    }
    this.setPhase('ignite');
    await seq.wait(240);
    this.setPhase('store');
    if (!seq.skipped) await this.store.intro(seq);
    this.finishBoot();
  }

  /** CRT power-off: collapse to a line, then to a point, then gone. */
  async powerDown(): Promise<void> {
    this.seq?.skip();
    this.inspector.close();
    this.cart.close();
    if (!prefersReducedMotion()) {
      this.el.classList.add('screen--off');
      await new Promise((r) => window.setTimeout(r, 620));
    }
    this.hide();
  }

  openInspector(product: Product): void {
    this.store.setRenderingPaused(true);
    this.inspector.open(product);
  }

  closeInspector(): void {
    this.inspector.close();
    this.store.setRenderingPaused(false);
  }

  private show(): void {
    this.el.hidden = false;
    this.el.classList.remove('screen--off', 'is-ready');
    this.el.classList.add('is-booting');
    this.scroller.scrollTop = 0;
  }

  private hide(): void {
    this.el.hidden = true;
    this.el.classList.remove('screen--off', 'is-ready', 'is-booting');
    this.renderer.stop();
    this.store.deactivate();
    this.store.reset();
    this.booted = false;
    this.el.removeAttribute('data-phase');
  }

  private finishBoot(): void {
    this.seq?.skip();
    this.seq = undefined;
    this.el.style.clipPath = 'none';
    this.hideHero(true);
    this.setPhase('store');
    this.store.finishIntro();
    this.el.querySelector('.hud')?.remove();
    this.el.classList.remove('is-booting');
    this.el.classList.add('is-ready');
    this.booted = true;
  }

  private setPhase(phase: 'off' | 'ignite' | 'hud' | 'clear' | 'store'): void {
    this.el.dataset.phase = phase;
  }

  /** Returns a setter that clips the screen between the monitor glass (0) and the full viewport (1). */
  private clipper(origin: DOMRect): (k: number) => void {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const from = { t: origin.top, r: vw - origin.right, b: vh - origin.bottom, l: origin.left, rad: 12 };
    return (k: number) => {
      if (k >= 1) {
        this.el.style.clipPath = 'none';
        return;
      }
      const i = (v: number) => (v * (1 - k)).toFixed(2);
      this.el.style.clipPath = `inset(${i(from.t)}px ${i(from.r)}px ${i(from.b)}px ${i(from.l)}px round ${i(from.rad)}px)`;
    };
  }

  /** A huge, ghostly wireframe of the flagship pattern behind the visor HUD. */
  private prepareHero(): void {
    if (this.hero || !this.renderer.supported) return;
    // dark silhouette with a hard rim, like armour glimpsed through a visor
    const stage = new ProductStage({
      floor: false,
      fit: 0.78,
      elevation: 0.1,
      spin: 0.14,
      edgeOpacity: 0.16,
      palette: { dark: '#010504', lit: '#0d2723', rim: '#6d9e40' },
    });
    stage.hideModel();
    const el = qs(this.el, '.screen__hero');
    const hero: StageView = { el, stage, active: false };
    this.hero = hero;
    this.renderer.add(hero);
    const flagship = PRODUCTS.find((p) => p.featured) ?? PRODUCTS[0];
    loadModel(flagship.file).then((m) => {
      stage.setModel(m);
      stage.frame(window.innerWidth / Math.max(1, window.innerHeight), true);
      this.renderer.precompile(hero);
    });
  }

  private showHero(): void {
    if (!this.hero) return;
    this.hero.active = true;
    this.hero.stage.intensity = 1;
    this.hero.stage.build(1600);
  }

  private hideHero(immediate = false): void {
    const view = this.hero;
    if (!view?.active) return;
    if (immediate) {
      view.active = false;
      return;
    }
    void tween(520, (k) => (view.stage.intensity = 1 - k), easeInOutCubic).then(() => (view.active = false));
  }
}
