import { BRAND, LICENCES, type LicenceId } from '../config';
import { CATEGORIES, PRODUCTS, type CategoryId, type Product } from '../data/catalog';
import { esc, fromHTML, qs, qsa, replayClass } from '../lib/dom';
import { archiveDate, clock, formatMoney, formatPrice, pad } from '../lib/format';
import type { Sequence } from '../lib/sequence';
import { cart } from '../state/cart';
import type { SharedRenderer } from '../three/renderer';
import { ProductCard } from './card';
import type { TabId } from './page';

export const TABS: { id: TabId; label: string }[] = [
  { id: 'archive', label: 'ARCHIVE' },
  { id: 'licences', label: 'LICENCES' },
  { id: 'printing', label: 'PRINTING' },
  { id: 'faq', label: 'FAQ' },
];

export interface StoreCallbacks {
  onInspect: (product: Product) => void;
  onOpenCart: () => void;
  onRestart: () => void;
  onExit: () => void;
}

type Filter = CategoryId | 'all';

const FAQ: [string, string][] = [
  ['What scale are the models?', 'Most models are sized for 28–32 mm tabletop games. Busts and display relics list their own size. STL files scale freely in any slicer.'],
  ['Do the files come pre-supported?', 'Most do. Each pattern lists whether supports are included, and every ZIP has both supported and unsupported files.'],
  ['Can I sell prints?', 'Yes, with a merchant licence. It covers up to 250 physical prints of a model per month. Reselling or sharing the files themselves is never allowed.'],
  ['Is there a free model to try?', 'Yes. The Servo-Skull Drone is free, so you can test our supports on your own printer before you buy.'],
  ['How do I get the files?', 'The order page links a ZIP for each pattern. Updates to a model are free for as long as it stays in the archive.'],
];

const PRINTING: [string, string][] = [
  ['FILES', 'ZIP with supported and unsupported STL, slicer profiles and a part map'],
  ['TESTED ON', 'Resin and FDM printers before release'],
  ['LAYER HEIGHT', '0.03–0.05 mm on resin, 0.12 mm on FDM'],
  ['SLICERS', 'Chitubox, Lychee, PrusaSlicer, Cura, Bambu Studio'],
  ['SCALE', '28–32 mm unless the pattern says otherwise'],
  ['UNITS', 'Millimetres, Z-up, resting on the build plate'],
  ['UPDATES', 'Free for as long as the model is in the archive'],
];

const leaders = (rows: [string, string][]) =>
  rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');

/** The storefront as a terminal program: title bar, section tabs, the archive grid and a status line. */
export class Store {
  readonly el: HTMLElement;
  /** The area between the tabs and the status line. The inspector and the drawer open over it. */
  readonly body: HTMLElement;
  readonly cards: ProductCard[];
  private scroller: HTMLElement;
  private clockTimer = 0;
  private tab: TabId = 'archive';

  constructor(renderer: SharedRenderer, cb: StoreCallbacks) {
    this.el = fromHTML(this.template());
    this.body = qs(this.el, '.tui__body');
    this.scroller = qs(this.el, '.tui__scroll');
    this.body.prepend(renderer.canvas);

    const grid = qs(this.el, '.grid');
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

    qsa(this.el, '[data-tab]').forEach((btn) => btn.addEventListener('click', () => this.setTab(btn.dataset.tab as TabId, true)));
    qsa(this.el, '.filter').forEach((btn) => btn.addEventListener('click', () => this.setFilter(btn.dataset.filter as Filter)));
    qsa(this.el, '[data-action="cart"]').forEach((b) => b.addEventListener('click', () => cb.onOpenCart()));
    qs(this.el, '[data-action="restart"]').addEventListener('click', () => cb.onRestart());
    qs(this.el, '[data-action="exit"]').addEventListener('click', () => cb.onExit());
    qsa(this.el, '[data-goto]').forEach((b) =>
      b.addEventListener('click', () => {
        const product = PRODUCTS.find((p) => p.slug === b.dataset.goto);
        if (product) cb.onInspect(product);
      }),
    );

    cart.subscribe(() => this.syncCart());
    this.syncCart();
  }

  /** Fetch every model. Nothing is downloaded until the screen comes into view or opens. */
  loadModels(): void {
    this.cards.forEach((c) => c.load());
  }

  /** The screen is on and in view. */
  activate(): void {
    this.tick();
    window.clearInterval(this.clockTimer);
    this.clockTimer = window.setInterval(() => this.tick(), 1000);
  }

  deactivate(): void {
    window.clearInterval(this.clockTimer);
  }

  setTab(tab: TabId, redraw = false): void {
    const changed = tab !== this.tab;
    this.tab = tab;
    qsa(this.el, '.tui__tab').forEach((btn) => btn.setAttribute('aria-selected', String(btn.dataset.tab === tab)));
    qsa(this.el, '.tui__panel').forEach((panel) => (panel.hidden = panel.dataset.panel !== tab));
    if (!changed) return;
    this.scroller.scrollTop = 0;
    if (redraw) replayClass(qs(this.el, `[data-panel="${tab}"]`), 'is-redraw');
  }

  setRenderingPaused(paused: boolean): void {
    this.cards.forEach((c) => c.setActive(!paused));
  }

  /** Cards stream in one after another while the archive is drawn onto the glass. */
  async intro(seq: Sequence): Promise<void> {
    for (const card of this.cards.filter((c) => !c.el.hidden)) {
      if (seq.skipped) break;
      card.enter(true);
      await seq.wait(75);
    }
  }

  /** Snap to the finished state (end of boot, Skip, reduced motion). */
  finishIntro(): void {
    this.cards.forEach((c) => {
      if (!c.el.hidden) c.enter(false);
    });
  }

  /** Back to the pre-boot state so the next power-on streams everything in again. */
  reset(): void {
    this.cards.forEach((c) => c.reset());
    this.scroller.scrollTop = 0;
  }

  private setFilter(filter: Filter): void {
    qsa(this.el, '.filter').forEach((btn) => btn.setAttribute('aria-pressed', String(btn.dataset.filter === filter)));
    let shown = 0;
    this.cards.forEach((card) => {
      const visible = filter === 'all' || card.product.category === filter;
      card.setVisible(visible);
      if (!visible) return;
      card.enter(false);
      card.el.style.animationDelay = `${shown * 50}ms`;
      replayClass(card.el, 'is-refresh');
      shown++;
    });
    qs(this.el, '.grid-count').textContent = `${pad(shown)} PATTERNS`;
  }

  private syncCart(): void {
    qsa(this.el, '.tui__req-n').forEach((el) => (el.textContent = `[${pad(cart.count)}]`));
    qs(this.el, '.tui__req-total').textContent = formatMoney(cart.total);
    qsa(this.el, '.tui__req').forEach((el) => el.classList.toggle('has-items', cart.count > 0));
    this.cards.forEach((c) => c.setInCart(cart.licenceOf(c.product.id)));
  }

  private tick(): void {
    qs(this.el, '.tui-clock').textContent = clock();
  }

  private template(): string {
    const counts = new Map<CategoryId, number>();
    PRODUCTS.forEach((p) => counts.set(p.category, (counts.get(p.category) ?? 0) + 1));
    const filter = (id: string, label: string, n: number, on = false) =>
      `<button type="button" class="filter" data-filter="${id}" aria-pressed="${on}">${label}<em>${pad(n)}</em></button>`;
    const filters = [filter('all', 'ALL', PRODUCTS.length, true), ...CATEGORIES.map((c) => filter(c.id, c.label, counts.get(c.id) ?? 0))].join('');
    const tabs = TABS.map(
      (t, i) =>
        `<button type="button" role="tab" class="tui__tab" id="tui-tab-${t.id}" data-tab="${t.id}" aria-controls="tui-${t.id}" aria-selected="${i === 0}"><kbd>${i + 1}</kbd>${t.label}</button>`,
    ).join('');

    const paid = PRODUCTS.filter((p) => p.price.personal > 0);
    const from = Math.min(...paid.map((p) => p.price.personal));
    const free = PRODUCTS.find((p) => p.price.personal === 0);
    const licence = (id: LicenceId, price: string) => {
      const l = LICENCES[id];
      return `<article class="doc__box">
        <h4>${l.terminalLabel}</h4>
        <p>${esc(l.summary)}</p>
        <ul>${l.terms.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
        <p class="doc__price">${price}</p>
      </article>`;
    };

    return /* html */ `
<div class="tui">
  <header class="tui__head">
    <span class="tui__title">${BRAND.terminalName} <span class="tui__sep">//</span> ${BRAND.terminalSub}</span>
    <span class="tui__meta"><span class="hide-sm">NODE ${BRAND.nodeId}</span><span class="hide-sm">${archiveDate()}</span><span class="tui-clock">--:--:--</span><button type="button" class="tui__exit" data-action="exit" aria-label="Exit the archive">EXIT</button></span>
  </header>

  <nav class="tui__tabs" role="tablist" aria-label="Archive sections">
    ${tabs}
    <span class="tui__fill"></span>
    <button type="button" class="tui__req" data-action="cart">REQUISITION <span class="tui__req-n">[00]</span> <span class="tui__req-total">€0.00</span></button>
  </nav>

  <div class="tui__body">
    <div class="tui__scroll">
      <section class="tui__panel" id="tui-archive" role="tabpanel" aria-labelledby="tui-tab-archive" data-panel="archive">
        <div class="tui__bar">
          <div class="filters" role="group" aria-label="Class">${filters}</div>
          <span class="grid-count">${pad(PRODUCTS.length)} PATTERNS</span>
        </div>
        <div class="grid"></div>
      </section>

      <section class="tui__panel doc" id="tui-licences" role="tabpanel" aria-labelledby="tui-tab-licences" data-panel="licences" hidden>
        <h3 class="doc__h">++ LICENCES ++</h3>
        <p class="doc__lede">You choose the licence when you add a pattern to your requisition.</p>
        <div class="doc__cols">
          ${licence('personal', `MODELS FROM ${formatPrice(from)}${free ? ` · ${esc(free.name.toUpperCase())} IS FREE` : ''}`)}
          ${licence('merchant', '3× THE PERSONAL PRICE')}
        </div>
        <p class="doc__note">Each order includes a licence certificate for every pattern on it.</p>
      </section>

      <section class="tui__panel doc" id="tui-printing" role="tabpanel" aria-labelledby="tui-tab-printing" data-panel="printing" hidden>
        <h3 class="doc__h">++ PRINTING ++</h3>
        <dl class="doc__specs">${leaders(PRINTING)}</dl>
        ${free ? `<p class="doc__note">To test our supports first, print the free pattern. <button type="button" class="tlink" data-goto="${free.slug}">OPEN ${esc(free.name.toUpperCase())}</button></p>` : ''}
      </section>

      <section class="tui__panel doc" id="tui-faq" role="tabpanel" aria-labelledby="tui-tab-faq" data-panel="faq" hidden>
        <h3 class="doc__h">++ FAQ ++</h3>
        <div class="doc__faq">${FAQ.map(([q, a]) => `<details><summary>${esc(q.toUpperCase())}</summary><p>${esc(a)}</p></details>`).join('')}</div>
      </section>
    </div>
  </div>

  <footer class="tui__status">
    <span class="tui__prompt">&gt; READY<i class="caret" aria-hidden="true"></i></span>
    <span class="hide-sm">${pad(PRODUCTS.length)} PATTERNS ON FILE</span>
    <span class="hide-sm">VOX CLEAR</span>
    <span class="tui__fill"></span>
    <button type="button" class="tui__req tui__req--sm" data-action="cart">REQ <span class="tui__req-n">[00]</span></button>
    <button type="button" class="tui__restart" data-action="restart">RESTART</button>
  </footer>
</div>`;
  }
}
