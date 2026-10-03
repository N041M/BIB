import { BRAND, LICENCES } from '../config';
import { CATEGORIES, PRODUCTS, type CategoryId, type Product } from '../data/catalog';
import { esc, fromHTML, qs, qsa } from '../lib/dom';
import { archiveDate, clock, formatMoney, pad } from '../lib/format';
import { close } from '../lib/glyphs';
import { settle, typewrite } from '../lib/scramble';
import type { Sequence } from '../lib/sequence';
import { cart } from '../state/cart';
import { loadModel } from '../three/models';
import type { SharedRenderer } from '../three/renderer';
import { ProductCard } from './card';

export interface StoreCallbacks {
  onInspect: (product: Product) => void;
  onOpenCart: () => void;
  onPowerDown: () => void;
}

type Filter = CategoryId | 'all';

type LogRow =
  | { kind: 'head' | 'hot'; text: string }
  | { kind: 'line'; cmd: string; res: string; awaits?: 'models' }
  | { kind: 'gap' };

/** Width the dotted leaders pad each command to, in characters. */
const LEADER = 30;

/** `> MOUNT /DEV/ARCHIVE ............ OK` */
function logLine(cmd: string, res: string): string {
  return `> ${cmd} ${'.'.repeat(Math.max(3, LEADER - cmd.length))} ${res}`;
}

function bootLog(): LogRow[] {
  return [
    { kind: 'head', text: `${BRAND.terminalName} // COGITATOR ${BRAND.nodeId}` },
    { kind: 'head', text: '++ PRAISE THE FORGE ++' },
    { kind: 'gap' },
    { kind: 'line', cmd: 'MOUNT /DEV/PATTERN-ARCHIVE', res: 'OK' },
    { kind: 'line', cmd: 'INDEX PATTERNS', res: `${pad(PRODUCTS.length)} ON FILE` },
    { kind: 'line', cmd: 'VERIFY LICENCE SEALS', res: 'SANCTIONED' },
    { kind: 'line', cmd: 'LOAD HOLO-PLINTHS', res: 'OK', awaits: 'models' },
    { kind: 'line', cmd: 'SYNC VOX-CHANNEL 01', res: 'LIVE' },
    { kind: 'line', cmd: 'CHRONOMETRY', res: archiveDate() },
    { kind: 'gap' },
    { kind: 'hot', text: `++ LINK ESTABLISHED: ${BRAND.domain.toUpperCase()} ++` },
  ];
}

/** The longest the boot log will wait on slow model downloads before printing OK anyway. */
const MODEL_WAIT_MS = 4500;

/** The cogitator storefront: the clear terminal the HUD resolves into. */
export class Store {
  readonly el: HTMLElement;
  readonly cards: ProductCard[];
  private clockTimer = 0;
  private texts = new Map<HTMLElement, string>();
  private log: HTMLElement;
  private logTimer = 0;

  constructor(renderer: SharedRenderer, cb: StoreCallbacks) {
    this.el = fromHTML(this.template());
    this.log = qs(this.el, '.term-log');
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

  /**
   * The boot log prints itself over the empty screen (holding on the model
   * line until every pattern has downloaded), fades away, and the archive
   * streams in from the top.
   */
  async intro(seq: Sequence): Promise<void> {
    this.el.classList.add('term--intro');
    const modelsReady = Promise.all(PRODUCTS.map((p) => loadModel(p.file)));
    for (const row of qsa(this.log, '.log__row')) {
      if (seq.skipped) break;
      row.classList.add('is-in');
      const text = this.texts.get(row) ?? '';
      if (!text) {
        await seq.wait(90);
        continue;
      }
      // headings print fast, command lines a touch slower, like a real log
      const cps = row.classList.contains('log__row--line') ? 95 : 70;
      if (row.dataset.awaits === 'models') {
        const res = row.dataset.res ?? '';
        const head = text.slice(0, text.length - res.length);
        await typewrite(row, head, { cps });
        row.classList.add('is-typing');
        await Promise.race([modelsReady, seq.wait(MODEL_WAIT_MS)]);
        row.classList.remove('is-typing');
        settle(row, text);
        await seq.wait(120);
        continue;
      }
      void typewrite(row, text, { cps });
      await seq.wait(Math.min(520, (text.length / cps) * 1000 + 60));
    }
    qsa(this.log, '.log__row').forEach((r) => r.classList.add('is-in'));
    await seq.wait(650);

    // the log has done its job: fade it and let the archive take the screen
    this.dismissLog();
    await seq.wait(320);

    const rail = qsa(this.el, '.term-rail [data-intro]');
    rail.forEach((el, i) => {
      el.style.animationDelay = `${i * 55}ms`;
      el.classList.add('is-in');
    });
    qsa(this.el, '.term-grid__bar').forEach((el) => el.classList.add('is-in'));
    await seq.wait(140);

    const visible = this.cards.filter((c) => !c.el.hidden);
    for (const card of visible) {
      if (seq.skipped) break;
      card.enter(true);
      await seq.wait(120);
    }
    qsa(this.el, '.term-status, .term-codex, .term-close').forEach((el) => el.classList.add('is-in'));
    await seq.wait(400);
    this.finishIntro();
  }

  /** Return to the pre-intro state so the next wake replays the whole stream-in. */
  reset(): void {
    this.el.classList.remove('term--intro', 'term--ready');
    qsa(this.el, '.is-in').forEach((el) => el.classList.remove('is-in'));
    qsa(this.log, '.log__row').forEach((el) => (el.textContent = ''));
    window.clearTimeout(this.logTimer);
    this.log.hidden = false;
    this.log.classList.remove('is-done');
    this.cards.forEach((c) => c.reset());
  }

  /** Fade the boot log out, then take it out of the page entirely. */
  private dismissLog(immediate = false): void {
    window.clearTimeout(this.logTimer);
    if (immediate) {
      this.log.classList.add('is-done');
      this.log.hidden = true;
      return;
    }
    this.log.classList.add('is-done');
    this.logTimer = window.setTimeout(() => (this.log.hidden = true), 800);
  }

  /** Snap to the finished state (skip, reduced motion, or direct deep link). */
  finishIntro(): void {
    if (!this.log.classList.contains('is-done')) this.dismissLog(true);
    qsa(this.el, '.log__row, .term-grid__bar, .term-status, .term-codex, .term-close, .term-rail [data-intro]').forEach((el) =>
      el.classList.add('is-in'),
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
    settle(qs(this.el, '.term-grid__count'), `> ${pad(shown)} PATTERNS INDEXED`);
  }

  private syncCart(): void {
    const n = cart.count;
    qsa(this.el, '.term-cart-count').forEach((el) => (el.textContent = pad(n)));
    qsa(this.el, '.term-cart-total').forEach((el) => (el.textContent = formatMoney(cart.total)));
    qsa(this.el, '.term-status__cart').forEach((el) => el.classList.toggle('has-items', n > 0));
    this.cards.forEach((c) => c.setInCart(cart.licenceOf(c.product.id)));
  }

  private tickClock(): void {
    qsa(this.el, '.term-clock').forEach((el) => (el.textContent = clock()));
  }

  private template(): string {
    const counts = new Map<CategoryId, number>();
    PRODUCTS.forEach((p) => counts.set(p.category, (counts.get(p.category) ?? 0) + 1));
    const filter = (id: string, label: string, n: number, on = false) =>
      `<button type="button" class="term-filter${on ? ' is-on' : ''}" data-filter="${id}" aria-pressed="${on}" data-intro><span>${label}</span><em>${pad(n)}</em></button>`;
    const filters = [
      filter('all', 'ALL PATTERNS', PRODUCTS.length, true),
      ...CATEGORIES.map((c) => filter(c.id, c.label, counts.get(c.id) ?? 0)),
    ].join('');
    const log = bootLog()
      .map((row) => {
        if (row.kind === 'gap') return '<p class="log__row log__row--gap"></p>';
        const text = row.kind === 'line' ? logLine(row.cmd, row.res) : row.text;
        const awaits = row.kind === 'line' && row.awaits ? ` data-awaits="${row.awaits}" data-res="${esc(row.res)}"` : '';
        return `<p class="log__row log__row--${row.kind}" data-typed="${esc(text)}"${awaits}></p>`;
      })
      .join('');

    return /* html */ `
<div class="term">
  <h1 class="sr-only">${BRAND.name} pattern archive: licensed STL models</h1>

  <button type="button" class="term-close" data-action="power" aria-label="Close the archive and return to the shop" title="Close">${close('term-close__x')}</button>

  <section class="term-log" aria-hidden="true">${log}</section>

  <div class="term-body">
    <nav class="term-rail" aria-label="Pattern classification">
      <p class="term-rail__head" data-intro>++ CLASSIFICATION ++</p>
      <div class="term-filters">${filters}</div>
      <div class="term-rail__panel" data-intro>
        <p class="term-rail__head">++ LICENCE TIERS ++</p>
        <p><b>&gt; ${LICENCES.personal.terminalLabel}</b> ${LICENCES.personal.summary}</p>
        <p><b>&gt; ${LICENCES.merchant.terminalLabel}</b> ${LICENCES.merchant.summary}</p>
      </div>
      <div class="term-rail__panel term-rail__panel--warn" data-intro>
        <p>++ PIRATED PATTERNS ARE HERESY ++</p>
        <p>EVERY FILE CARRIES A LICENCE SEAL.</p>
      </div>
    </nav>

    <main class="term-main">
      <div class="term-grid__bar"><span class="term-grid__count">&gt; ${pad(PRODUCTS.length)} PATTERNS INDEXED</span><span class="dim">SORT: ARCHIVE ORDER</span></div>
      <div class="term-grid"></div>
    </main>
  </div>

  <section class="term-codex" aria-label="Archive information">
    <article>
      <h2>++ LICENCE CODEX ++</h2>
      <p>Every requisition issues a licence certificate bound to your account. ${LICENCES.personal.terminalLabel}: ${LICENCES.personal.terms.join(' · ')}. ${LICENCES.merchant.terminalLabel}: ${LICENCES.merchant.terms.join(' · ')}.</p>
    </article>
    <article>
      <h2>++ PRINT DOCTRINE ++</h2>
      <p>Files ship as a ZIP: supported and unsupported STL, slicer profiles for resin and FDM, and a part map. Recommended layer height 0.03–0.05 mm on resin.</p>
    </article>
    <article>
      <h2>++ VOX CHANNEL ++</h2>
      <p>Misprint? Missing part? Open a vox ticket from your requisition record and an archivist will answer within one cycle.</p>
    </article>
  </section>

  <footer class="term-status">
    <button type="button" class="term-status__cart" data-action="cart">&gt; REQUISITION [<span class="term-cart-count">00</span>] · <span class="term-cart-total">€0.00</span></button>
    <span class="term-status__item">++ VOX: CLEAR ++</span>
    <span class="term-status__item dim hide-sm">NODE ${BRAND.nodeId}</span>
    <span class="term-status__item dim hide-sm">SCIENTIA · FIDES · VICTORIA</span>
    <span class="term-status__item dim term-clock">--:--:--</span>
  </footer>
</div>`;
  }
}
