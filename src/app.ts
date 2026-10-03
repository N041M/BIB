import { BRAND } from './config';
import { productBySlug } from './data/catalog';
import { Landing } from './ui/landing';
import type { Screen } from './ui/screen';

type Route = { name: 'landing' } | { name: 'archive'; slug?: string };

const ARCHIVE = '#/archive';

function parse(hash: string): Route {
  const m = hash.match(/^#\/archive(?:\/([\w-]+))?\/?$/);
  if (m) return { name: 'archive', slug: m[1] };
  return { name: 'landing' };
}

/**
 * Routes between the ordinary landing page and the cogitator screen.
 *   #/                  landing
 *   #/archive           the storefront
 *   #/archive/<slug>    storefront with a pattern under inspection
 *
 * The landing page ships without three.js; the screen (and the 3D engine)
 * is loaded in the background right after first paint.
 */
export class App {
  private landing: Landing;
  private screen?: Screen;
  private screenReady: Promise<Screen>;
  private mode: 'landing' | 'booting' | 'archive' | 'leaving' = 'landing';
  /** True when the inspector route was pushed on top of the archive route by us. */
  private inspectPushed = false;

  constructor(private root: HTMLElement) {
    this.landing = new Landing({ onEnter: (origin) => this.wake(origin) });
    this.root.append(this.landing.el);
    this.screenReady = import('./ui/screen').then(({ Screen }) => {
      const screen = new Screen({
        onInspect: (p) => this.inspect(p),
        onCloseInspector: () => this.closeInspect(),
        onPowerDown: () => this.navigate('#/'),
      });
      this.root.append(screen.el);
      this.screen = screen;
      return screen;
    });
  }

  start(): void {
    window.addEventListener('hashchange', () => this.sync());
    const route = parse(location.hash);
    if (route.name === 'archive') {
      this.mode = 'booting';
      this.landing.hide();
      document.documentElement.classList.add('is-terminal');
      void this.screenReady.then((screen) => {
        void screen.bootDirect().then(() => this.booted());
        this.sync();
      });
    } else {
      this.landing.show();
    }
  }

  /** Click on the landing monitor (or any "browse" control). */
  private wake(origin: DOMRect): void {
    if (this.mode !== 'landing') return;
    this.mode = 'booting';
    if (location.hash !== ARCHIVE) history.pushState(null, '', ARCHIVE);
    this.updateMeta({ name: 'archive' });
    void this.screenReady.then((screen) => {
      this.landing.leave();
      return screen
        .boot(origin, () => {
          this.landing.hide();
          document.documentElement.classList.add('is-terminal');
        })
        .then(() => this.booted());
    });
  }

  private booted(): void {
    // a Back press mid-boot may already have started powering down
    if (this.mode !== 'booting') return;
    this.mode = 'archive';
    this.sync();
  }

  private inspect(product: { slug: string }): void {
    this.inspectPushed = true;
    this.navigate(`${ARCHIVE}/${product.slug}`);
  }

  private closeInspect(): void {
    if (this.inspectPushed) {
      this.inspectPushed = false;
      history.back();
    } else {
      this.navigate(ARCHIVE);
    }
  }

  private navigate(hash: string): void {
    if (location.hash === hash) return;
    location.hash = hash;
  }

  /** Reconcile what's on screen with the current hash. */
  private sync(): void {
    const route = parse(location.hash);
    this.updateMeta(route);
    if (route.name === 'landing') {
      this.inspectPushed = false;
      if (this.mode === 'archive' || this.mode === 'booting') void this.powerDown();
      return;
    }
    if (this.mode === 'landing') {
      // e.g. browser "forward" back into the archive
      this.wake(this.landing.screenRect());
      return;
    }
    const screen = this.screen;
    if (!screen) return;
    const product = route.slug ? productBySlug(route.slug) : undefined;
    if (product) {
      if (!screen.inspector.isOpen) screen.openInspector(product);
    } else {
      this.inspectPushed = false;
      if (screen.inspector.isOpen) screen.closeInspector();
    }
  }

  private updateMeta(route: Route): void {
    const product = route.name === 'archive' && route.slug ? productBySlug(route.slug) : undefined;
    document.title =
      route.name === 'landing'
        ? `${BRAND.name} · Licensed STL models`
        : product
          ? `${product.name.toUpperCase()} // ${BRAND.terminalName}`
          : `${BRAND.terminalName} // ${BRAND.terminalSub}`;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', route.name === 'landing' ? '#111215' : '#0b0b0d');
  }

  private async powerDown(): Promise<void> {
    this.mode = 'leaving';
    const screen = await this.screenReady;
    await screen.powerDown();
    document.documentElement.classList.remove('is-terminal');
    this.landing.returnFromTerminal();
    this.mode = 'landing';
  }
}
