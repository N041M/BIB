import { BRAND, LICENCES } from '../config';
import { CATEGORIES, PRODUCTS, type CategoryId, type Product } from '../data/catalog';
import { fromHTML, qs, qsa } from '../lib/dom';
import { archiveDate, clock, formatMoney, pad } from '../lib/format';
import { CATEGORY_GLYPH, sigil, skull } from '../lib/glyphs';
import { scramble, settle } from '../lib/scramble';
import type { Sequence } from '../lib/sequence';
import { cart } from '../state/cart';
import type { SharedRenderer } from '../three/renderer';
import { ProductCard } from './card';

export interface StoreCallbacks {
  onInspect: (product: Product) => void;
  onOpenCart: () => void;
  onPowerDown: () => void;
}

type Filter = CategoryId | 'all';

/** The cogitator storefront: the clear terminal the HUD resolves into. */
export class Store {
  readonly el: HTMLElement;
  readonly cards: ProductCard[];
  private clockTimer = 0;
  private texts = new Map<HTMLElement, string>();

  constructor(renderer: SharedRenderer, cb: StoreCallbacks) {
    this.el = fromHTML(this.template());
    const grid = qs(this.el, '.term-grid');
    this.cards = PRODUCTS.map(
      (p) =>
        new ProductCard(p, renderer, {
          onInspect: cb.onInspect,
          onToggleCart: (product) => {
            if (cart.licenceOf(product.id)) cart.remove(product.id);
            else cart.set(product, 'personal');
          },
        }),
    );
    this.cards.forEach((c) => grid.append(c.el));

    qsa(this.el, '[data-typed]').forEach((el) => this.texts.set(el, el.dataset.typed || ''));

    qsa<HTMLButtonElement>(this.el, '.term-filter').forEach((btn) =>
      btn.addEventListener('click', () => this.setFilter(btn.dataset.filter as Filter)),
    );
    qsa(this.el, '[data-action="cart"]').forEach((b) => b.addEventListener('click', () => cb.onOpenCart()));
    qs(this.el, '[data-action="power"]').addEventListener('click', () => cb.onPowerDown());

    cart.subscribe(() => this.syncCart());
    this.syncCart();
  }

  /** Called once the terminal is on screen. */
  activate(): void {
    this.tickClock();
    window.clearInterval(this.clockTimer);
    this.clockTimer = window.setInterval(() => this.tickClock(), 1000);
  }

  deactivate(): void {
    window.clearInterval(this.clockTimer);
    this.cards.forEach((c) => c.setActive(false));
  }

  setRenderingPaused(paused: boolean): void {
    this.cards.forEach((c) => c.setActive(!paused));
  }

  /** Chrome draws itself, the objective band blooms, then the patterns stream in. */
  async intro(seq: Sequence): Promise<void> {
    this.el.classList.add('term--intro');
    const step = (sel: string) => qsa(this.el, sel).forEach((el) => el.classList.add('is-in'));

    step('.term-top');
    this.type('.term-brand__name', 380);
    this.type('.term-top__params span', 420, 120);
    this.type('.term-date', 300, 200);
    await seq.wait(260);

    step('.term-band__label');
    this.type('.term-band__label span', 420);
    await seq.wait(220);
    step('.term-band');
    await seq.wait(260);
    this.type('.term-band__line[data-line="1"]', 560);
    await seq.wait(200);
    this.type('.term-band__line[data-line="2"]', 520);
    step('.term-hero__aside');
    qsa(this.el, '.term-meta dd').forEach((dd, i) => this.typeEl(dd, 360, 120 + i * 90));
    await seq.wait(320);

    const rail = qsa(this.el, '.term-rail [data-intro]');
    rail.forEach((el, i) => {
      el.style.animationDelay = `${i * 55}ms`;
      el.classList.add('is-in');
    });
    await seq.wait(160);

    const visible = this.cards.filter((c) => !c.el.hidden);
    for (const card of visible) {
      if (seq.skipped) break;
      card.enter(true);
      await seq.wait(130);
    }
    step('.term-status');
    step('.term-codex');
    await seq.wait(400);
    this.finishIntro();
  }

  /** Return to the pre-intro state so the next wake replays the whole stream-in. */
  reset(): void {
    this.el.classList.remove('term--intro', 'term--ready');
    qsa(this.el, '.is-in').forEach((el) => el.classList.remove('is-in'));
    this.cards.forEach((c) => c.reset());
  }

  /** Snap to the finished state (skip, reduced motion, or direct deep link). */
  finishIntro(): void {
    qsa(this.el, '.term-top, .term-band, .term-band__label, .term-hero__aside, .term-status, .term-codex, .term-rail [data-intro]').forEach(
      (el) => el.classList.add('is-in'),
    );
    this.texts.forEach((text, el) => {
      if (el.textContent !== text) settle(el, text);
    });
    this.cards.forEach((c) => {
      if (!c.el.hidden) c.enter(false);
    });
    this.el.classList.remove('term--intro');
    this.el.classList.add('term--ready');
  }

  private type(sel: string, duration: number, delay = 0): void {
    qsa(this.el, sel).forEach((el) => this.typeEl(el, duration, delay));
  }

  private typeEl(el: HTMLElement, duration: number, delay = 0): void {
    const text = this.texts.get(el) ?? el.textContent ?? '';
    scramble(el, text, { duration, delay });
  }

  private setFilter(filter: Filter): void {
    qsa<HTMLButtonElement>(this.el, '.term-filter').forEach((btn) => {
      const on = btn.dataset.filter === filter;
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-pressed', String(on));
    });
    this.el.classList.toggle('term--filtered', filter !== 'all');
    let shown = 0;
    this.cards.forEach((card) => {
      const visible = filter === 'all' || card.product.category === filter;
      card.setVisible(visible);
      if (!visible) return;
      card.enter(false);
      card.el.classList.remove('is-refresh');
      void card.el.offsetWidth;
      card.el.style.animationDelay = `${shown * 60}ms`;
      card.el.classList.add('is-refresh');
      shown++;
    });
    const count = qs(this.el, '.term-grid__count');
    settle(count, `${pad(shown)} PATTERNS INDEXED`);
  }

  private syncCart(): void {
    const n = cart.count;
    qsa(this.el, '.term-cart-count').forEach((el) => (el.textContent = pad(n)));
    qsa(this.el, '.term-cart-total').forEach((el) => (el.textContent = formatMoney(cart.total)));
    qsa(this.el, '.term-cartbtn').forEach((el) => el.classList.toggle('has-items', n > 0));
    this.cards.forEach((c) => c.setInCart(cart.licenceOf(c.product.id)));
  }

  private tickClock(): void {
    const date = archiveDate();
    qsa(this.el, '.term-clock').forEach((el) => (el.textContent = clock()));
    qsa(this.el, '.term-date').forEach((el) => {
      if (!this.el.classList.contains('term--intro')) el.textContent = date;
      this.texts.set(el, date);
    });
  }

  private template(): string {
    const counts = new Map<CategoryId, number>();
    PRODUCTS.forEach((p) => counts.set(p.category, (counts.get(p.category) ?? 0) + 1));
    const filters = [
      `<button type="button" class="term-filter is-on" data-filter="all" aria-pressed="true" data-intro><i class="box"></i><span>ALL PATTERNS</span><em>${pad(PRODUCTS.length)}</em></button>`,
      ...CATEGORIES.map(
        (c) =>
          `<button type="button" class="term-filter" data-filter="${c.id}" aria-pressed="false" data-intro><i class="box"></i><span>${CATEGORY_GLYPH[c.id]} ${c.label}</span><em>${pad(counts.get(c.id) ?? 0)}</em></button>`,
      ),
    ].join('');
    const date = archiveDate();

    return /* html */ `
<div class="term">
  <h1 class="sr-only">${BRAND.name} pattern archive: licensed STL models</h1>

  <header class="term-top">
    <button type="button" class="term-brand" data-action="power" title="Power down the cogitator">
      ${sigil('term-brand__sigil')}
      <span class="term-brand__name" data-typed="${BRAND.terminalName}">${BRAND.terminalName}</span>
    </button>
    <div class="term-top__params"><span data-typed="ARCHIVE PARAMETERS">ARCHIVE PARAMETERS</span></div>
    <div class="term-top__meta">
      <span class="term-top__node">${BRAND.nodeId}</span>
      <span class="term-date" data-typed="${date}">${date}</span>
      <span class="term-clock">--:--:--</span>
      <button type="button" class="term-cartbtn" data-action="cart">${skull()}<span>REQUISITION</span><b>[<span class="term-cart-count">00</span>]</b></button>
    </div>
  </header>

  <section class="term-hero" aria-label="Archive objectives">
    <div class="term-hero__aside term-hero__aside--left">
      <span class="term-chip">REF 03/17</span>
      <span class="term-chip term-chip--alert">${skull()} OP REC</span>
      <span class="term-chip dim">FMT STL/BIN</span>
    </div>

    <div class="term-band-wrap">
      <div class="term-band__label"><span data-typed="REQUISITION OBJECTIVES:">REQUISITION OBJECTIVES:</span></div>
      <div class="term-band">
        <p class="term-band__line" data-line="1" data-typed="PRIMUS — ACQUIRE SANCTIONED PATTERNS">PRIMUS — ACQUIRE SANCTIONED PATTERNS</p>
        <p class="term-band__line" data-line="2" data-typed="SECUNDUS — PRINT. PAINT. DEPLOY.">SECUNDUS — PRINT. PAINT. DEPLOY.</p>
      </div>
    </div>

    <div class="term-hero__aside term-hero__aside--right">
      <dl class="term-meta">
        <div><dt>PATTERNS:</dt><dd data-typed="${pad(PRODUCTS.length)} ON FILE">${pad(PRODUCTS.length)} ON FILE</dd></div>
        <div><dt>LICENCE:</dt><dd data-typed="SANCTIONED">SANCTIONED</dd></div>
        <div><dt>FORMAT:</dt><dd data-typed="STL · BINARY">STL · BINARY</dd></div>
        <div><dt>TITHE GRADE:</dt><dd data-typed="SOLUTIO PRIMA">SOLUTIO PRIMA</dd></div>
      </dl>
    </div>
  </section>

  <div class="term-body">
    <nav class="term-rail" aria-label="Pattern classification">
      <p class="term-rail__head" data-intro>// CLASSIFICATION</p>
      <div class="term-filters">${filters}</div>
      <div class="term-rail__panel" data-intro>
        <p class="term-rail__head">// LICENCE TIERS</p>
        <p><b>${LICENCES.personal.terminalLabel}</b> — ${LICENCES.personal.summary}</p>
        <p><b>${LICENCES.merchant.terminalLabel}</b> — ${LICENCES.merchant.summary}</p>
      </div>
      <div class="term-rail__panel term-rail__panel--warn" data-intro>
        <p>${skull()} PIRATED PATTERNS ARE HERESY. EVERY FILE CARRIES A LICENCE SEAL.</p>
      </div>
    </nav>

    <main class="term-main">
      <div class="term-grid__bar"><span class="term-grid__count">${pad(PRODUCTS.length)} PATTERNS INDEXED</span><span class="dim">SORT: ARCHIVE ORDER</span></div>
      <div class="term-grid"></div>
    </main>
  </div>

  <section class="term-codex" aria-label="Archive information">
    <article>
      <h2>// LICENCE CODEX</h2>
      <p>Every requisition issues a licence certificate bound to your account. ${LICENCES.personal.terminalLabel}: ${LICENCES.personal.terms.join(' · ')}. ${LICENCES.merchant.terminalLabel}: ${LICENCES.merchant.terms.join(' · ')}.</p>
    </article>
    <article>
      <h2>// PRINT DOCTRINE</h2>
      <p>Files ship as a ZIP: supported and unsupported STL, slicer profiles for resin and FDM, and a part map. Recommended layer height 0.03–0.05 mm on resin.</p>
    </article>
    <article>
      <h2>// VOX CHANNEL</h2>
      <p>Misprint? Missing part? Open a vox ticket from your requisition record and an archivist will answer within one cycle.</p>
    </article>
  </section>

  <footer class="term-status">
    <button type="button" class="term-status__cart" data-action="cart">${skull()} REQUISITION <b><span class="term-cart-count">00</span></b> · <span class="term-cart-total">€0.00</span></button>
    <span class="term-status__item">VOX: CLEAR</span>
    <span class="term-status__item dim">LINK 98.2%</span>
    <span class="term-status__item dim hide-sm">NODE ${BRAND.nodeId}</span>
    <span class="term-status__dat">DAT-F12 <b>00</b></span>
  </footer>
</div>`;
  }
}
