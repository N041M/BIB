import { LICENCES } from '../config';
import { CATEGORIES, type Product } from '../data/catalog';
import { esc, fromHTML, qs } from '../lib/dom';
import { formatInt, formatPrice } from '../lib/format';
import { skull } from '../lib/glyphs';
import { scramble, settle } from '../lib/scramble';
import { loadModel, type ModelData } from '../three/models';
import type { SharedRenderer, StageView } from '../three/renderer';
import { ProductStage } from '../three/stage';

export interface CardCallbacks {
  onInspect: (product: Product) => void;
  onToggleCart: (product: Product) => void;
}

/** A product tile with its own live, draggable holo-plinth. */
export class ProductCard {
  readonly el: HTMLElement;
  readonly view: StageView;
  private stage: ProductStage;
  private model?: ModelData;
  private entered = false;
  private dragStart?: { x: number; y: number; yaw: number; pitch: number; moved: boolean; t: number };

  constructor(
    readonly product: Product,
    renderer: SharedRenderer,
    private cb: CardCallbacks,
  ) {
    this.el = fromHTML(this.template());
    this.stage = new ProductStage();
    this.stage.hideModel();
    const viewEl = qs(this.el, '.card__view');
    this.view = { el: viewEl, stage: this.stage, active: false };
    renderer.add(this.view);

    if (!renderer.supported) viewEl.classList.add('is-offline');

    loadModel(product.file).then((data) => {
      this.model = data;
      this.stage.setModel(data);
      if (this.entered) this.stage.build(1300);
      else this.stage.hideModel();
      qs(this.el, '[data-spec="tris"]').textContent = formatInt(data.triangles);
      viewEl.classList.add('is-loaded');
    });

    this.bindViewport(viewEl);
    qs(this.el, '[data-act="inspect"]').addEventListener('click', () => cb.onInspect(product));
    qs(this.el, '[data-act="cart"]').addEventListener('click', () => cb.onToggleCart(product));
  }

  /** Stream the card in (called by the store intro, staggered). */
  enter(animated: boolean): void {
    if (this.entered) return;
    this.entered = true;
    this.view.active = true;
    this.el.classList.add('is-in');
    const name = qs(this.el, '.card__name');
    if (animated) {
      this.el.classList.add('is-streaming');
      scramble(name, this.product.name.toUpperCase(), { duration: 520, delay: 140 });
      if (this.model) this.stage.build(1300);
    } else {
      settle(name, this.product.name.toUpperCase());
      if (this.model) this.stage.showModel();
    }
  }

  reset(): void {
    this.entered = false;
    this.view.active = false;
    this.el.classList.remove('is-in', 'is-streaming', 'is-refresh');
    this.stage.hideModel();
  }

  setInCart(licence: string | undefined): void {
    const btn = qs<HTMLButtonElement>(this.el, '[data-act="cart"]');
    btn.classList.toggle('is-active', !!licence);
    btn.setAttribute('aria-pressed', String(!!licence));
    qs(btn, 'span').textContent = licence ? 'IN REQUISITION' : 'REQUISITION';
  }

  setVisible(visible: boolean): void {
    this.el.hidden = !visible;
    this.view.active = visible && this.entered;
  }

  setActive(active: boolean): void {
    this.view.active = active && this.entered && !this.el.hidden;
  }

  private bindViewport(el: HTMLElement): void {
    el.addEventListener('pointerenter', () => (this.stage.hoverTarget = 1));
    el.addEventListener('pointerleave', () => (this.stage.hoverTarget = 0));
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this.dragStart = { x: e.clientX, y: e.clientY, yaw: this.stage.yaw, pitch: this.stage.pitch, moved: false, t: performance.now() };
    });
    el.addEventListener('pointermove', (e) => {
      const d = this.dragStart;
      if (!d) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (!d.moved && Math.hypot(dx, dy) > 4) {
        d.moved = true;
        el.setPointerCapture(e.pointerId);
        this.stage.dragging = true;
        el.classList.add('is-dragging');
      }
      if (!d.moved) return;
      const prevYaw = this.stage.yaw;
      this.stage.yaw = d.yaw + dx * 0.012;
      this.stage.pitch = Math.max(-0.35, Math.min(0.55, d.pitch + dy * 0.006));
      this.stage.yawVelocity = (this.stage.yaw - prevYaw) * 0.6;
      this.stage.poke();
    });
    const end = (e: PointerEvent) => {
      const d = this.dragStart;
      this.dragStart = undefined;
      this.stage.dragging = false;
      el.classList.remove('is-dragging');
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      if (d && !d.moved && e.type === 'pointerup') this.cb.onInspect(this.product);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.cb.onInspect(this.product);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        this.stage.yawVelocity = e.key === 'ArrowLeft' ? -0.06 : 0.06;
        this.stage.poke();
      }
    });
  }

  private template(): string {
    const p = this.product;
    const cat = CATEGORIES.find((c) => c.id === p.category)?.label ?? '';
    const tagClass = p.tag === 'FREE' ? 'tag tag--alert' : 'tag';
    return /* html */ `
<article class="card${p.featured ? ' card--featured' : ''}" data-id="${esc(p.id)}" data-cat="${p.category}">
  <header class="card__head">
    <span class="card__id">${esc(p.id)}</span>
    <span class="card__cat">${cat}</span>
    ${p.tag ? `<span class="${tagClass}">${p.tag}</span>` : ''}
    <span class="card__skull">${skull()}</span>
  </header>
  <div class="card__view" tabindex="0" role="button" aria-label="Inspect ${esc(p.name)} in 3D. Drag to rotate.">
    <span class="card__corner card__corner--tl"></span><span class="card__corner card__corner--tr"></span>
    <span class="card__corner card__corner--bl"></span><span class="card__corner card__corner--br"></span>
    <span class="card__hint">DRAG ⟲ ROTATE · CLICK INSPECT</span>
    <span class="card__loading">LOADING PATTERN…</span>
    ${p.featured ? '<span class="card__feature">◆ PATTERN OF THE MONTH</span>' : ''}
  </div>
  <div class="card__body">
    <h3 class="card__name">${esc(p.name.toUpperCase())}</h3>
    <p class="card__desc">${esc(p.short)}</p>
    <p class="card__more">${esc(p.description)}</p>
    <dl class="card__specs">
      <div><dt>TRIS</dt><dd data-spec="tris">—</dd></div>
      <div><dt>PARTS</dt><dd>${p.parts}</dd></div>
      <div><dt>SCALE</dt><dd>${esc(p.scale)}</dd></div>
      <div><dt>SUPPORTS</dt><dd>${p.presupported ? 'YES' : 'NO'}</dd></div>
    </dl>
  </div>
  <footer class="card__foot">
    <div class="card__price"><b>${formatPrice(p.price.personal)}</b><small>${LICENCES.personal.terminalLabel} LICENCE</small></div>
    <button type="button" class="tbtn tbtn--ghost" data-act="inspect">INSPECT</button>
    <button type="button" class="tbtn" data-act="cart" aria-pressed="false"><span>REQUISITION</span></button>
  </footer>
</article>`;
  }
}
