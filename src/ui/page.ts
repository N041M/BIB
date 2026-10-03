import { BRAND, LICENCES } from '../config';
import { CATEGORIES, PRODUCTS } from '../data/catalog';
import { esc, fromHTML, prefersReducedMotion, qs, qsa } from '../lib/dom';
import { archiveDate, clock, formatPrice } from '../lib/format';
import { cart } from '../state/cart';

export type TabId = 'archive' | 'licences' | 'printing' | 'faq';

/** Each callback gets the rectangle of the control that was pressed, for the screen to grow from. */
export interface PageCallbacks {
  /** Open the screen on one of its sections. */
  onTab: (tab: TabId, from: DOMRect) => void;
  onCart: (from: DOMRect) => void;
  onInspect: (slug: string, from: DOMRect) => void;
}

/** A pointed arch: the brand mark. */
const MARK = `<svg class="mark" viewBox="0 0 20 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 23V11.5C3 6.8 6 3.3 10 1.5c4 1.8 7 5.3 7 10V23"/><path d="M7 23V12.5c0-2.6 1.2-4.6 3-5.8 1.8 1.2 3 3.2 3 5.8V23" opacity=".55"/><path d="M0 23h20"/></svg>`;

/**
 * Everything outside the screen: the top bar, the hero, the section that
 * holds the screen, and the footer.
 */
export class Page {
  readonly el: HTMLElement;
  /** The glass the screen module mounts into. */
  readonly glass: HTMLElement;
  private archive: HTMLElement;
  private clockTimer = 0;

  constructor(cb: PageCallbacks) {
    this.el = fromHTML(this.template());
    this.glass = qs(this.el, '.crt');
    this.archive = qs(this.el, '#archive');

    const rect = (el: HTMLElement) => el.getBoundingClientRect();
    qsa(this.el, '[data-tab]').forEach((btn) => btn.addEventListener('click', () => cb.onTab(btn.dataset.tab as TabId, rect(btn))));
    qsa(this.el, '[data-cart]').forEach((btn) => btn.addEventListener('click', () => cb.onCart(rect(btn))));
    qsa(this.el, '[data-inspect]').forEach((btn) => btn.addEventListener('click', () => cb.onInspect(btn.dataset.inspect!, rect(btn))));
    qs(this.el, '.hero__scroll').addEventListener('click', () => this.scrollToArchive());
    qs(this.el, '.bar__brand').addEventListener('click', (e) => {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    });

    cart.subscribe(() => this.syncCart());
    this.syncCart();
  }

  start(): void {
    this.tick();
    window.clearInterval(this.clockTimer);
    this.clockTimer = window.setInterval(() => this.tick(), 1000);
  }

  scrollToArchive(): void {
    this.archive.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  }

  /** True when at least half of the standby glass is on screen. */
  glassInView(): boolean {
    const r = this.glass.getBoundingClientRect();
    const visible = Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0));
    return r.height > 0 && visible >= r.height * 0.5;
  }

  private tick(): void {
    const now = new Date();
    qs(this.el, '.bar__date').textContent = archiveDate(now);
    qs(this.el, '.bar__time').textContent = clock(now);
  }

  private syncCart(): void {
    const n = cart.count;
    const btn = qs(this.el, '.bar__req');
    qs(btn, '.bar__count').textContent = String(n);
    btn.classList.toggle('has-items', n > 0);
  }

  private template(): string {
    const year = new Date().getFullYear();
    const featured = PRODUCTS.find((p) => p.featured) ?? PRODUCTS[0];
    const free = PRODUCTS.find((p) => p.price.personal === 0);
    const cat = CATEGORIES.find((c) => c.id === featured.category)?.label ?? '';
    const sentence = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
    return /* html */ `
<div class="page">
  <header class="bar">
    <a class="bar__brand" href="#top">${MARK}<span>${BRAND.name}</span></a>
    <nav class="bar__nav" aria-label="Archive sections">
      <button type="button" data-tab="archive">Archive</button>
      <button type="button" data-tab="licences">Licences</button>
      <button type="button" data-tab="printing">Printing</button>
      <button type="button" data-tab="faq">FAQ</button>
    </nav>
    <button type="button" class="bar__req" data-cart>Requisition <span class="bar__count">0</span></button>
    <span class="bar__clock" aria-hidden="true"><span class="bar__date"></span><span class="bar__time"></span></span>
  </header>

  <main>
    <section class="hero" id="top">
      <div class="hero__copy">
        <h1 class="hero__title">${BRAND.name}</h1>
        <p class="hero__role">Licensed STL patterns <span>/ miniatures, terrain and relics</span></p>
        <p class="hero__lede">Print-ready models for tabletop wargames. Every pattern is test-printed on resin and FDM before release, and you choose a personal or a merchant licence when you buy.</p>
        <div class="hero__actions">
          <button type="button" class="btn btn--primary" data-tab="archive">Enter the archive <span aria-hidden="true">→</span></button>
          <button type="button" class="btn" data-tab="licences">Licences</button>
          <button type="button" class="btn" data-tab="printing">Printing</button>
        </div>
        ${
          free
            ? `<p class="hero__aside"><button type="button" class="link" data-inspect="${free.slug}">Free pattern: ${esc(free.name)} <span aria-hidden="true">→</span></button><span>Test our supports on your printer before you buy.</span></p>`
            : ''
        }
        <article class="plate" aria-label="Pattern of the month">
          <header class="plate__head"><span>Pattern of the month</span><span>${esc(featured.id)}</span></header>
          <p class="plate__name">${esc(featured.name)}</p>
          <p class="plate__desc">${esc(featured.short)}</p>
          <dl class="plate__specs">
            <div><dt>Class</dt><dd>${sentence(cat)}</dd></div>
            <div><dt>Parts</dt><dd>${featured.parts}</dd></div>
            <div><dt>Scale</dt><dd>${esc(featured.scale.toLowerCase())}</dd></div>
            <div><dt>Supports</dt><dd>${featured.presupported ? 'Included' : 'None needed'}</dd></div>
          </dl>
          <footer class="plate__foot">
            <span class="plate__price"><b>${formatPrice(featured.price.personal)}</b> ${LICENCES.personal.label.toLowerCase()} · ${formatPrice(featured.price.merchant)} ${LICENCES.merchant.label.toLowerCase()}</span>
            <button type="button" class="link" data-inspect="${featured.slug}">Inspect <span aria-hidden="true">→</span></button>
          </footer>
        </article>
      </div>
      <div class="hero__stage" aria-hidden="true"></div>
      <button type="button" class="hero__scroll"><span>Scroll</span><i aria-hidden="true"></i></button>
    </section>

    <section class="archive" id="archive" aria-label="Pattern archive">
      <div class="crt" data-state="off"></div>
    </section>
  </main>

  <footer class="foot">
    <span class="foot__brand">${MARK}${BRAND.name} · ${year}</span>
    <p>${BRAND.name} is an independent store and is not affiliated with Games Workshop. This site is a demo. The model files are generated placeholders and checkout takes no payment.</p>
  </footer>
</div>`;
  }
}
