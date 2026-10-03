import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { LICENCES, type LicenceId } from '../config';
import { CATEGORIES, type Product } from '../data/catalog';
import { esc, fromHTML, prefersReducedMotion, qs, qsa } from '../lib/dom';
import { formatBytes, formatInt, formatMoney, formatPrice } from '../lib/format';
import { close, skull } from '../lib/glyphs';
import { scramble } from '../lib/scramble';
import { cart } from '../state/cart';
import { loadModel, type ModelData } from '../three/models';
import { ProductStage, type RenderMode } from '../three/stage';

export interface InspectorCallbacks {
  onClose: () => void;
  onOpenCart: () => void;
}

/** Full-screen pattern inspection: orbit, zoom, pan, render modes, licence picker. */
export class Inspector {
  readonly el: HTMLElement;
  private renderer?: THREE.WebGLRenderer;
  private controls?: OrbitControls;
  private stage = new ProductStage({ floor: true, fit: 1.12, elevation: 0.38, edgeOpacity: 0.18 });
  private viewEl: HTMLElement;
  private product?: Product;
  private model?: ModelData;
  private licence: LicenceId = 'personal';
  private raf = 0;
  private last = 0;
  private baseDistance = 1;
  /** Aspect the camera was last framed for; re-framed on resize until the visitor takes over. */
  private framedAspect = 0;
  private interacted = false;
  private lastFocus: HTMLElement | null = null;
  private token = 0;

  constructor(cb: InspectorCallbacks) {
    this.el = fromHTML(this.template());
    this.viewEl = qs(this.el, '.insp__view');
    this.stage.autoSpin = false;
    this.stage.cameraLocked = true;

    qsa(this.el, '[data-close]').forEach((b) => b.addEventListener('click', () => cb.onClose()));
    qsa<HTMLButtonElement>(this.el, '[data-mode]').forEach((b) =>
      b.addEventListener('click', () => this.setMode(b.dataset.mode as RenderMode)),
    );
    qs(this.el, '[data-act="spin"]').addEventListener('click', (e) => {
      if (!this.controls) return;
      this.controls.autoRotate = !this.controls.autoRotate;
      (e.currentTarget as HTMLElement).classList.toggle('is-on', this.controls.autoRotate);
      (e.currentTarget as HTMLElement).setAttribute('aria-pressed', String(this.controls.autoRotate));
    });
    qs(this.el, '[data-act="reset"]').addEventListener('click', () => this.resetView());
    qsa<HTMLInputElement>(this.el, 'input[name="licence"]').forEach((input) =>
      input.addEventListener('change', () => {
        this.licence = input.value as LicenceId;
        this.syncBuy();
      }),
    );
    qs(this.el, '[data-act="add"]').addEventListener('click', () => {
      if (!this.product) return;
      const current = cart.licenceOf(this.product.id);
      if (current === this.licence) {
        cb.onOpenCart();
        return;
      }
      cart.set(this.product, this.licence);
      const btn = qs(this.el, '[data-act="add"]');
      btn.classList.remove('is-pulse');
      void btn.offsetWidth;
      btn.classList.add('is-pulse');
    });
    this.el.addEventListener('keydown', (e) => this.trapFocus(e));
    cart.subscribe(() => this.syncBuy());
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  open(product: Product): void {
    const token = ++this.token;
    this.product = product;
    this.licence = cart.licenceOf(product.id) ?? 'personal';
    this.lastFocus = document.activeElement as HTMLElement | null;
    this.fill(product);
    this.el.hidden = false;
    this.el.classList.remove('is-closing');
    requestAnimationFrame(() => this.el.classList.add('is-open'));
    this.ensureRenderer();
    this.stage.hideModel();
    this.stage.yaw = -0.55;
    this.stage.pitch = 0;
    this.setMode('solid');
    loadModel(product.file).then((data) => {
      if (token !== this.token) return;
      this.model = data;
      this.stage.setModel(data);
      this.stage.build(1400);
      this.resetView(true);
      this.fillModelSpecs(data);
    });
    this.start();
    window.setTimeout(() => qs<HTMLButtonElement>(this.el, '.insp__close').focus({ preventScroll: true }), 50);
  }

  close(): void {
    if (this.el.hidden) return;
    this.token++;
    this.el.classList.remove('is-open');
    this.el.classList.add('is-closing');
    window.setTimeout(() => {
      this.el.hidden = true;
      this.el.classList.remove('is-closing');
      this.stop();
    }, 320);
    this.lastFocus?.focus?.({ preventScroll: true });
  }

  private ensureRenderer(): void {
    if (this.renderer) return;
    try {
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setClearColor(0x000000, 0);
      renderer.localClippingEnabled = true;
      renderer.domElement.className = 'insp__canvas';
      this.viewEl.prepend(renderer.domElement);
      this.renderer = renderer;
      const controls = new OrbitControls(this.stage.camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.autoRotate = !prefersReducedMotion();
      controls.autoRotateSpeed = 1.1;
      controls.addEventListener('start', () => {
        this.interacted = true;
        this.viewEl.classList.add('is-grabbing');
      });
      controls.addEventListener('end', () => this.viewEl.classList.remove('is-grabbing'));
      this.controls = controls;
    } catch (err) {
      console.warn('[archive] inspector WebGL unavailable', err);
      this.viewEl.classList.add('is-offline');
    }
  }

  private resetView(initial = false): void {
    if (!this.controls || !this.model) return;
    const aspect = Math.max(0.3, this.viewEl.clientWidth / Math.max(1, this.viewEl.clientHeight));
    this.stage.frame(aspect, true);
    this.framedAspect = aspect;
    this.interacted = false;
    const { radius } = this.model;
    this.controls.target.copy(this.stage.target);
    this.baseDistance = this.stage.camera.position.distanceTo(this.stage.target);
    this.controls.minDistance = radius * 0.6;
    this.controls.maxDistance = Math.max(radius * 5, this.baseDistance * 2);
    this.controls.update();
    if (!initial) this.stage.build(500, 0.0);
  }

  private setMode(mode: RenderMode): void {
    this.stage.setMode(mode);
    qsa<HTMLButtonElement>(this.el, '[data-mode]').forEach((b) => {
      const on = b.dataset.mode === mode;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }

  private start(): void {
    if (this.raf || !this.renderer) return;
    this.last = performance.now();
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.render(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private render(dt: number): void {
    const renderer = this.renderer!;
    const canvas = renderer.domElement;
    const w = this.viewEl.clientWidth;
    const h = this.viewEl.clientHeight;
    if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
    }
    const aspect = w / Math.max(1, h);
    if (!this.interacted && this.model && this.framedAspect && Math.abs(aspect / this.framedAspect - 1) > 0.02) {
      this.resetView(true);
    }
    this.stage.update(dt, aspect);
    this.controls?.update(dt);
    renderer.render(this.stage.scene, this.stage.camera);
    this.updateReadouts(h);
  }

  private updateReadouts(viewHeight: number): void {
    if (!this.controls || !this.model) return;
    const az = THREE.MathUtils.radToDeg(this.controls.getAzimuthalAngle());
    const el = 90 - THREE.MathUtils.radToDeg(this.controls.getPolarAngle());
    const dist = this.stage.camera.position.distanceTo(this.controls.target);
    const zoom = this.baseDistance / dist;
    qs(this.el, '[data-ro="az"]').textContent = `${((az + 360) % 360).toFixed(0).padStart(3, '0')}°`;
    qs(this.el, '[data-ro="el"]').textContent = `${el >= 0 ? '+' : ''}${el.toFixed(0).padStart(2, '0')}°`;
    qs(this.el, '[data-ro="zoom"]').textContent = `${zoom.toFixed(2)}×`;

    // scale bar: millimetres per pixel at the orbit target
    const vfov = THREE.MathUtils.degToRad(this.stage.camera.fov);
    const mmPerPx = (2 * dist * Math.tan(vfov / 2)) / Math.max(1, viewHeight);
    const steps = [5, 10, 20, 25, 50, 100];
    const mm = steps.find((s) => s / mmPerPx >= 60) ?? 100;
    const bar = qs(this.el, '.insp__scale-bar');
    bar.style.width = `${Math.round(mm / mmPerPx)}px`;
    qs(this.el, '.insp__scale-label').textContent = `${mm} MM`;
  }

  private fill(p: Product): void {
    const cat = CATEGORIES.find((c) => c.id === p.category)?.label ?? '';
    qs(this.el, '.insp__id').textContent = p.id;
    qs(this.el, '.insp__cat').textContent = `${cat} · ${p.scale}`;
    scramble(qs(this.el, '.insp__name'), p.name.toUpperCase(), { duration: 480, delay: 120 });
    qs(this.el, '.insp__desc').textContent = p.description;
    qs(this.el, '[data-spec="parts"]').textContent = String(p.parts);
    qs(this.el, '[data-spec="supports"]').textContent = p.presupported ? 'PRE-SUPPORTED + RAW' : 'RAW · SUPPORT-FREE';
    qs(this.el, '[data-spec="scale"]').textContent = p.scale;
    ['dims', 'tris', 'size'].forEach((k) => (qs(this.el, `[data-spec="${k}"]`).textContent = 'COMPUTING…'));
    (['personal', 'merchant'] as LicenceId[]).forEach((id) => {
      qs(this.el, `[data-price="${id}"]`).textContent = formatPrice(p.price[id]);
      const input = qs<HTMLInputElement>(this.el, `input[value="${id}"]`);
      input.checked = id === this.licence;
    });
    this.syncBuy();
  }

  private fillModelSpecs(m: ModelData): void {
    const { x, y, z } = m.size;
    qs(this.el, '[data-spec="dims"]').textContent = `${x.toFixed(0)} × ${z.toFixed(0)} × ${y.toFixed(0)} MM`;
    qs(this.el, '[data-spec="tris"]').textContent = formatInt(m.triangles);
    qs(this.el, '[data-spec="size"]').textContent = m.placeholder ? 'UNAVAILABLE' : formatBytes(m.bytes);
  }

  private syncBuy(): void {
    if (!this.product) return;
    const price = this.product.price[this.licence];
    qs(this.el, '.insp__price').textContent = price === 0 ? 'FREE' : formatMoney(price);
    const current = cart.licenceOf(this.product.id);
    const btn = qs(this.el, '[data-act="add"]');
    const label = qs(btn, 'span');
    if (current === this.licence) label.textContent = 'IN REQUISITION · VIEW';
    else if (current) label.textContent = `SWITCH TO ${LICENCES[this.licence].terminalLabel}`;
    else label.textContent = 'ADD TO REQUISITION';
    btn.classList.toggle('is-active', current === this.licence);
  }

  private trapFocus(e: KeyboardEvent): void {
    if (e.key !== 'Tab') return;
    const focusables = qsa<HTMLElement>(this.el, 'button, input, [tabindex]:not([tabindex="-1"])').filter(
      (el) => !el.hasAttribute('disabled') && el.offsetParent !== null,
    );
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  private template(): string {
    const licence = (id: LicenceId) => {
      const l = LICENCES[id];
      return `
        <label class="lic">
          <input type="radio" name="licence" value="${id}">
          <span class="lic__box">
            <span class="lic__head"><i class="box"></i><b>${l.terminalLabel}</b><em data-price="${id}"></em></span>
            <span class="lic__sum">${esc(l.summary)}</span>
            <span class="lic__terms">${l.terms.map((t) => esc(t.toUpperCase())).join(' · ')}</span>
          </span>
        </label>`;
    };
    return /* html */ `
<div class="insp" role="dialog" aria-modal="true" aria-labelledby="insp-title" hidden>
  <div class="insp__scrim" data-close></div>
  <div class="insp__panel">
    <header class="insp__head">
      <span class="insp__head-l">${skull()} PATTERN INSPECTION // <b class="insp__id"></b></span>
      <button type="button" class="insp__close tbtn tbtn--ghost" data-close aria-label="Close inspection">CLOSE <kbd>ESC</kbd> ${close()}</button>
    </header>
    <div class="insp__body">
      <div class="insp__view">
        <span class="card__corner card__corner--tl"></span><span class="card__corner card__corner--tr"></span>
        <span class="card__corner card__corner--bl"></span><span class="card__corner card__corner--br"></span>
        <div class="insp__ro">
          <span>AZ <b data-ro="az">000°</b></span>
          <span>EL <b data-ro="el">+00°</b></span>
          <span>ZOOM <b data-ro="zoom">1.00×</b></span>
        </div>
        <div class="insp__scale"><span class="insp__scale-bar"></span><span class="insp__scale-label">10 MM</span></div>
        <p class="insp__hint">DRAG ROTATE · WHEEL/PINCH ZOOM · RIGHT-DRAG PAN</p>
        <div class="insp__modes" role="toolbar" aria-label="Render mode">
          <button type="button" class="tbtn tbtn--seg is-on" data-mode="solid" aria-pressed="true">SOLID</button>
          <button type="button" class="tbtn tbtn--seg" data-mode="wire" aria-pressed="false">WIRE</button>
          <button type="button" class="tbtn tbtn--seg" data-mode="xray" aria-pressed="false">X-RAY</button>
          <span class="insp__modes-gap"></span>
          <button type="button" class="tbtn tbtn--seg is-on" data-act="spin" aria-pressed="true">AUTO-ROT</button>
          <button type="button" class="tbtn tbtn--seg" data-act="reset">RESET</button>
        </div>
      </div>
      <div class="insp__info">
        <p class="insp__cat"></p>
        <h2 class="insp__name" id="insp-title"></h2>
        <p class="insp__desc"></p>
        <dl class="insp__specs">
          <div><dt>DIMENSIONS</dt><dd data-spec="dims"></dd></div>
          <div><dt>TRIANGLES</dt><dd data-spec="tris"></dd></div>
          <div><dt>FILE SIZE</dt><dd data-spec="size"></dd></div>
          <div><dt>PARTS</dt><dd data-spec="parts"></dd></div>
          <div><dt>SUPPORTS</dt><dd data-spec="supports"></dd></div>
          <div><dt>SCALE</dt><dd data-spec="scale"></dd></div>
          <div><dt>FORMAT</dt><dd>STL · BINARY · MM</dd></div>
        </dl>
        <fieldset class="insp__lic">
          <legend>SELECT LICENCE</legend>
          ${licence('personal')}
          ${licence('merchant')}
        </fieldset>
        <div class="insp__buy">
          <span class="insp__price"></span>
          <button type="button" class="tbtn tbtn--primary" data-act="add"><span>ADD TO REQUISITION</span></button>
        </div>
        <p class="insp__fine">Delivered as a ZIP with supported and raw STL files, slicer profiles and a licence certificate.</p>
      </div>
    </div>
  </div>
</div>`;
  }
}
