import { LICENCES, type LicenceId } from '../config';
import { productById } from '../data/catalog';
import { fromHTML, h, qs, qsa } from '../lib/dom';
import { formatMoney, formatPrice, pad } from '../lib/format';
import { CATEGORY_GLYPH, close, skull } from '../lib/glyphs';
import { Sequence } from '../lib/sequence';
import { cart } from '../state/cart';

/** The requisition manifest: a slide-in drawer with a (demo) checkout rite. */
export class CartDrawer {
  readonly el: HTMLElement;
  private list: HTMLElement;
  private lastFocus: HTMLElement | null = null;
  private checkout?: Sequence;

  constructor() {
    this.el = fromHTML(this.template());
    this.list = qs(this.el, '.cart__list');
    qsa(this.el, '[data-close]').forEach((b) => b.addEventListener('click', () => this.close()));
    qs(this.el, '[data-act="checkout"]').addEventListener('click', () => this.runCheckout());
    qs(this.el, '[data-act="done"]').addEventListener('click', () => this.resetCheckout());
    cart.subscribe(() => this.render());
    this.render();
  }

  get isOpen(): boolean {
    return this.el.classList.contains('is-open');
  }

  open(): void {
    this.lastFocus = document.activeElement as HTMLElement | null;
    this.el.hidden = false;
    requestAnimationFrame(() => this.el.classList.add('is-open'));
    window.setTimeout(() => qs<HTMLButtonElement>(this.el, '.cart__close').focus({ preventScroll: true }), 60);
  }

  close(): void {
    if (!this.isOpen) return;
    this.el.classList.remove('is-open');
    window.setTimeout(() => {
      if (!this.isOpen) this.el.hidden = true;
    }, 360);
    this.lastFocus?.focus?.({ preventScroll: true });
  }

  private render(): void {
    const lines = cart.items;
    this.list.replaceChildren();
    qs(this.el, '.cart__count').textContent = pad(lines.length);
    qs(this.el, '.cart__total').textContent = formatMoney(cart.total);
    this.el.classList.toggle('is-empty', lines.length === 0);
    qs<HTMLButtonElement>(this.el, '[data-act="checkout"]').disabled = lines.length === 0;

    for (const line of lines) {
      const p = productById(line.productId);
      if (!p) continue;
      const other: LicenceId = line.licence === 'personal' ? 'merchant' : 'personal';
      const li = h(
        'li',
        { class: 'cart__item' },
        h('span', { class: 'cart__glyph', 'aria-hidden': 'true' }, CATEGORY_GLYPH[p.category]),
        h(
          'span',
          { class: 'cart__meta' },
          h('b', null, p.name.toUpperCase()),
          h('small', null, `${p.id} · ${LICENCES[line.licence].terminalLabel} LICENCE`),
        ),
        h('span', { class: 'cart__price' }, formatPrice(p.price[line.licence])),
        h(
          'span',
          { class: 'cart__acts' },
          h(
            'button',
            { type: 'button', class: 'cart__link', onclick: () => cart.set(p, other) },
            `→ ${LICENCES[other].terminalLabel}`,
          ),
          h('button', { type: 'button', class: 'cart__link cart__link--alert', onclick: () => cart.remove(p.id), 'aria-label': `Remove ${p.name}` }, 'PURGE'),
        ),
      );
      this.list.append(li);
    }
  }

  private async runCheckout(): Promise<void> {
    if (!cart.count || this.checkout) return;
    const seq = (this.checkout = new Sequence());
    const log = qs(this.el, '.cart__log');
    const ref = `A-${Math.floor(1000 + Math.random() * 9000)}`;
    const total = formatMoney(cart.total);
    this.el.classList.add('is-transmitting');
    log.replaceChildren(h('p', { class: 'is-dim' }, '+++ TRANSMISSION BEGINS +++'));
    const steps = [
      'ENCRYPTING MANIFEST',
      'CONSULTING LICENCE CODEX',
      'BINDING LICENCE SEALS',
      'NOTIFYING ARCHIVISTS',
    ];
    for (const step of steps) {
      const row = h('p', null, `> ${step}`, h('span', { class: 'dots' }, ''), h('b', null, ''));
      log.append(row);
      for (let i = 0; i < 3; i++) {
        await seq.wait(140);
        qs(row, '.dots').textContent += '.';
      }
      qs(row, 'b').textContent = ' OK';
    }
    await seq.wait(200);
    log.append(h('p', { class: 'is-hot' }, `+++ REQUISITION ${ref} ACCEPTED · ${total} +++`));
    log.append(h('p', { class: 'is-note' }, 'DEMO STOREFRONT: NO PAYMENT WAS TAKEN AND NO FILES WERE SENT.'));
    this.el.classList.add('is-done');
    cart.clear();
    qs<HTMLButtonElement>(this.el, '[data-act="done"]').focus({ preventScroll: true });
  }

  private resetCheckout(): void {
    this.checkout?.skip();
    this.checkout = undefined;
    this.el.classList.remove('is-transmitting', 'is-done');
    qs(this.el, '.cart__log').replaceChildren();
    this.close();
  }

  private template(): string {
    return /* html */ `
<aside class="cart" aria-label="Requisition manifest" hidden>
  <div class="cart__scrim" data-close></div>
  <div class="cart__panel" role="dialog" aria-modal="true" aria-labelledby="cart-title">
    <header class="cart__head">
      <h2 id="cart-title">${skull()} REQUISITION MANIFEST <span class="dim">[<span class="cart__count">00</span>]</span></h2>
      <button type="button" class="cart__close tbtn tbtn--ghost" data-close aria-label="Close manifest">${close()}</button>
    </header>
    <ul class="cart__list"></ul>
    <div class="cart__empty">
      <p>NO PATTERNS REQUISITIONED.</p>
      <p class="dim">THE ARCHIVE AWAITS YOUR SELECTION.</p>
    </div>
    <div class="cart__log" aria-live="polite"></div>
    <footer class="cart__foot">
      <div class="cart__sum"><span>TOTAL TITHE</span><b class="cart__total">€0.00</b></div>
      <button type="button" class="tbtn tbtn--primary cart__go" data-act="checkout"><span>TRANSMIT REQUISITION</span></button>
      <button type="button" class="tbtn cart__done" data-act="done"><span>CLOSE MANIFEST</span></button>
      <p class="cart__fine">Demo storefront. Checkout is simulated and no payment is taken.</p>
    </footer>
  </div>
</aside>`;
  }
}
