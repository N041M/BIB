import { Backdrop } from './backdrop';
import { BRAND } from './config';
import { productBySlug } from './data/catalog';
import { postBySlug } from './data/posts';
import type { Blog } from './ui/blog';
import { Page } from './ui/page';
import type { Screen } from './ui/screen';

type Route = { name: 'home' } | { name: 'archive'; slug?: string } | { name: 'blog'; slug?: string };

const ARCHIVE = '#/archive';

function parse(hash: string): Route {
  const m = hash.match(/^#\/archive(?:\/([\w-]+))?\/?$/);
  if (m) return { name: 'archive', slug: m[1] };
  const b = hash.match(/^#\/blog(?:\/([\w-]+))?\/?$/);
  if (b) return { name: 'blog', slug: b[1] };
  return { name: 'home' };
}

/**
 * Wires the page to the screen below the hero.
 *   #/                  the page, with the screen in standby
 *   #/archive           the screen filling the tab
 *   #/archive/<slug>    a pattern open in the inspector
 *   #/blog              the list of blog posts
 *   #/blog/<slug>       one blog post
 *
 * The hero ships without three.js. The screen and the 3D engine load in the
 * background right after first paint. The scene behind the hero is an image,
 * and its animation loads once the page is idle.
 */
export class App {
  private page: Page;
  private screen?: Screen;
  private screenReady: Promise<Screen>;
  private blog?: Blog;
  private blogReady?: Promise<Blog>;
  /** True when we pushed the archive route ourselves, so leaving can step back over it. */
  private archivePushed = false;
  /** True when we pushed the inspector route on top of the archive ourselves. */
  private inspectPushed = false;

  constructor(private root: HTMLElement) {
    this.page = new Page({ onEnter: (from) => this.enter(from) });
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
    new Backdrop(this.page.backdrop).start();
    window.addEventListener('hashchange', () => this.sync());
    const route = parse(location.hash);
    if (route.name === 'archive') {
      void this.screenReady.then((screen) => {
        screen.activate({ instant: true, quick: !!route.slug });
        this.sync();
      });
    }
    if (route.name === 'blog') void this.loadBlog().then((blog) => blog.show(route.slug, { instant: true }));
    this.updateMeta(route);
    // load the blog and draw its machine while the pointer is on its way to the link
    const link = this.page.el.querySelector('[href="#/blog"]');
    for (const type of ['pointerenter', 'focus', 'touchstart']) {
      link?.addEventListener(type, () => void this.loadBlog().then((blog) => blog.prepare()), { once: true, passive: true });
    }
  }

  /** The blog loads the first time it is opened. */
  private loadBlog(): Promise<Blog> {
    this.blogReady ??= import('./ui/blog').then(({ Blog }) => {
      const blog = new Blog({
        // Esc steps back from a post to the list, and from the list to the page
        onEscape: () => {
          const route = parse(location.hash);
          location.hash = route.name === 'blog' && route.slug ? '#/blog' : '#/';
        },
      });
      this.root.append(blog.el);
      this.blog = blog;
      return blog;
    });
    return this.blogReady;
  }

  /**
   * Fill the tab with the screen. It grows from the glass when the glass is
   * on screen, otherwise from the control that was pressed.
   */
  private enter(from?: DOMRect): void {
    const origin = from && !this.page.glassInView() ? from : undefined;
    this.blog?.hide();
    void this.screenReady.then((screen) => {
      if (screen.isActive) return;
      if (parse(location.hash).name !== 'archive') {
        history.pushState(null, '', ARCHIVE);
        this.archivePushed = true;
      }
      this.updateMeta(parse(location.hash));
      screen.activate({ origin });
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
    if (route.name === 'blog') {
      if (this.screen?.isActive) void this.screen.deactivate();
      void this.loadBlog().then((blog) => blog.show(route.slug));
      return;
    }
    this.blog?.hide();
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
    if (route.name === 'blog') {
      const post = route.slug ? postBySlug(route.slug) : undefined;
      document.title = post ? `${post.title} · ${BRAND.name}` : `Blog · ${BRAND.name}`;
      return;
    }
    const product = route.name === 'archive' && route.slug ? productBySlug(route.slug) : undefined;
    document.title =
      route.name === 'home'
        ? `${BRAND.name} · Licensed STL models`
        : product
          ? `${product.name.toUpperCase()} // ${BRAND.terminalName}`
          : `${BRAND.terminalName} // ${BRAND.terminalSub}`;
  }
}
