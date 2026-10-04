import { BRAND, CREATOR } from '../config';
import { esc, fromHTML, prefersReducedMotion, qs, qsa } from '../lib/dom';
import { archiveDate, clock } from '../lib/format';
import { cart } from '../state/cart';
import { Gallery } from './gallery';

export type TabId = 'archive' | 'licences' | 'printing' | 'faq';

/** Each callback gets the rectangle of the control that was pressed, for the screen to grow from. */
export interface PageCallbacks {
  /** Open the screen on one of its sections. */
  onTab: (tab: TabId, from: DOMRect) => void;
  onCart: (from: DOMRect) => void;
}

/** A pointed arch: the brand mark. */
const MARK = `<svg class="mark" viewBox="0 0 20 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 23V11.5C3 6.8 6 3.3 10 1.5c4 1.8 7 5.3 7 10V23"/><path d="M7 23V12.5c0-2.6 1.2-4.6 3-5.8 1.8 1.2 3 3.2 3 5.8V23" opacity=".55"/><path d="M0 23h20"/></svg>`;

/**
 * Everything outside the screen: the top bar, the hero and the scene behind
 * it, the section that holds the screen, the gallery and the footer.
 */
export class Page {
  readonly el: HTMLElement;
  /** The glass the screen module mounts into. */
  readonly glass: HTMLElement;
  /** The element the corridor scene behind the hero draws into. */
  readonly backdrop: HTMLElement;
  private archive: HTMLElement;
  private clockTimer = 0;

  constructor(cb: PageCallbacks) {
    this.el = fromHTML(this.template());
    this.glass = qs(this.el, '.crt');
    this.backdrop = qs(this.el, '.backdrop');
    this.archive = qs(this.el, '#archive');
    this.archive.after(new Gallery().el);

    const rect = (el: HTMLElement) => el.getBoundingClientRect();
    qsa(this.el, '[data-tab]').forEach((btn) => btn.addEventListener('click', () => cb.onTab(btn.dataset.tab as TabId, rect(btn))));
    qsa(this.el, '[data-cart]').forEach((btn) => btn.addEventListener('click', () => cb.onCart(rect(btn))));
    qs(this.el, '.hero__scroll').addEventListener('click', () => this.scrollToArchive());
    qsa(this.el, '[data-scroll]').forEach((btn) =>
      btn.addEventListener('click', () =>
        this.el.querySelector(`#${btn.dataset.scroll}`)?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' }),
      ),
    );
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

  /** The painter behind the store. Fields left empty in CREATOR are left out. */
  private about(): string {
    const { name, tagline, bio, facts, platform, url } = CREATOR;
    return /* html */ `
        <article class="about" aria-labelledby="about-h">
          <header class="about__head"><span id="about-h">About</span><span>Painting streamer</span></header>
          ${name ? `<p class="about__name">${esc(name)}</p>` : ''}
          ${tagline ? `<p class="about__tagline">“${esc(tagline)}”</p>` : ''}
          <p class="about__bio">${esc(bio)}</p>
          ${facts.length ? `<dl class="about__specs">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}
          ${url ? `<footer class="about__foot"><a class="link" href="${esc(url)}" target="_blank" rel="noopener">Watch ${platform ? `on ${esc(platform)}` : 'the stream'} <span aria-hidden="true">↗</span></a></footer>` : ''}
        </article>`;
  }

  private template(): string {
    const year = new Date().getFullYear();
    return /* html */ `
<div class="page">
  <div class="backdrop" aria-hidden="true"></div>
  <header class="bar">
    <a class="bar__brand" href="#top">${MARK}<span>${BRAND.name}</span></a>
    <nav class="bar__nav" aria-label="Sections">
      <button type="button" data-tab="archive">Archive</button>
      <button type="button" data-scroll="gallery">Gallery</button>
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
        <p class="hero__lede">Print-ready models for tabletop wargames. Every pattern is test-printed on resin and FDM before release, and you choose a personal or a merchant licence when you buy.</p>
        <div class="hero__actions">
          <button type="button" class="btn btn--primary" data-tab="archive">Enter the archive <span aria-hidden="true">→</span></button>
          <button type="button" class="btn" data-tab="licences">Licences</button>
          <button type="button" class="btn" data-tab="printing">Printing</button>
        </div>
        ${this.about()}
      </div>
      <div class="hero__stage" aria-hidden="true"></div>
      <button type="button" class="hero__scroll"><span>Scroll</span><i aria-hidden="true"></i></button>
    </section>

    <section class="archive" id="archive" aria-label="Pattern archive">
      <div class="crt" data-state="standby"></div>
    </section>
  </main>

  <footer class="foot">
    <span class="foot__brand">${MARK}${BRAND.name} · ${year}</span>
    <p>${BRAND.name} is an independent store and is not affiliated with Games Workshop. This site is a demo. The model files are generated placeholders and checkout takes no payment.</p>
  </footer>
</div>`;
  }
}
