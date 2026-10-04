import { BRAND } from './config';
import { productBySlug } from './data/catalog';
import { Page } from './ui/page';
import type { Screen } from './ui/screen';

type Route = { name: 'home' } | { name: 'archive'; slug?: string };

const ARCHIVE = '#/archive';

function parse(hash: string): Route {
  const m = hash.match(/^#\/archive(?:\/([\w-]+))?\/?$/);
  if (m) return { name: 'archive', slug: m[1] };
  return { name: 'home' };
}

/**
 * Wires the page to the screen below the hero.
 *   #/                  the page, with the screen in standby
 *   #/archive           the screen filling the tab
 *   #/archive/<slug>    a pattern open in the inspector
 *
 * The hero ships without three.js. The screen and the 3D engine load in the
 * background right after first paint, and so does the scene behind the hero.
 */
export class App {
  private page: Page;
  private screen?: Screen;
  private screenReady: Promise<Screen>;
  /** True when we pushed the archive route ourselves, so leaving can step back over it. */
  private archivePushed = false;
  /** True when we pushed the inspector route on top of the archive ourselves. */
  private inspectPushed = false;

  constructor(root: HTMLElement) {
    this.page = new Page({
      onTab: (tab, from) => this.enter(from, (screen) => screen.showTab(tab)),
      onCart: (from) => this.enter(from, (screen) => screen.openCart()),
    });
    root.append(this.page.el);
    this.screenReady = import('./ui/screen').then(({ Screen }) => {
      const screen = new Screen(this.page.glass, {
        onActivate: () => this.enter(),
        onExit: () => this.exit(),
        onInspect: (p) => this.inspect(p.slug),
        onCloseInspector: () => this.closeInspect(),
      });
      this.screen = screen;
      return screen;
    });
  }

  start(): void {
    this.page.start();
    import('./backdrop')
      .then(({ Backdrop }) => new Backdrop(this.page.backdrop).start())
      .catch((err) => console.warn('[backdrop]', err));
    window.addEventListener('hashchange', () => this.sync());
    const route = parse(location.hash);
    if (route.name === 'archive') {
      void this.screenReady.then((screen) => {
        screen.activate({ instant: true, quick: !!route.slug });
        this.sync();
      });
    }
    this.updateMeta(route);
  }

  /**
   * Fill the tab with the screen. It grows from the glass when the glass is
   * on screen, otherwise from the control that was pressed.
   */
  private enter(from?: DOMRect, then?: (screen: Screen) => void): void {
    const origin = from && !this.page.glassInView() ? from : undefined;
    void this.screenReady.then((screen) => {
      if (!screen.isActive) {
        if (parse(location.hash).name !== 'archive') {
          history.pushState(null, '', ARCHIVE);
          this.archivePushed = true;
        }
        this.updateMeta(parse(location.hash));
        screen.activate({ origin });
      }
      then?.(screen);
    });
  }

  /** Leave the archive. Back returns to it, the same as any other page. */
  private exit(): void {
    if (this.archivePushed) {
      history.go(this.inspectPushed ? -2 : -1);
    } else {
      location.hash = '#/';
    }
    this.archivePushed = false;
    this.inspectPushed = false;
  }

  private inspect(slug: string): void {
    const hash = `${ARCHIVE}/${slug}`;
    if (location.hash === hash) return;
    this.inspectPushed = true;
    location.hash = hash;
  }

  private closeInspect(): void {
    if (this.inspectPushed) {
      this.inspectPushed = false;
      history.back();
    } else {
      location.hash = ARCHIVE;
    }
  }

  /** Reconcile the screen with the current hash (Back, Forward, typed URLs). */
  private sync(): void {
    const route = parse(location.hash);
    this.updateMeta(route);
    const screen = this.screen;
    if (!screen) return;
    if (route.name === 'home') {
      this.archivePushed = false;
      this.inspectPushed = false;
      void screen.deactivate();
      return;
    }
    if (!screen.isActive) screen.activate({ quick: !!route.slug });
    const product = route.slug ? productBySlug(route.slug) : undefined;
    if (product) {
      if (!screen.inspector.isOpen) screen.openInspector(product);
    } else {
      this.inspectPushed = false;
      screen.closeInspector();
    }
  }

  private updateMeta(route: Route): void {
    const product = route.name === 'archive' && route.slug ? productBySlug(route.slug) : undefined;
    document.title =
      route.name === 'home'
        ? `${BRAND.name} · Licensed STL models`
        : product
          ? `${product.name.toUpperCase()} // ${BRAND.terminalName}`
          : `${BRAND.terminalName} // ${BRAND.terminalSub}`;
  }
}
