import * as THREE from 'three';
import type { ProductStage } from './stage';

export interface StageView {
  /** The DOM box the stage is drawn into. Must be transparent over the canvas. */
  el: HTMLElement;
  stage: ProductStage;
  active: boolean;
}

/**
 * One WebGL context for every product card: a canvas fixed behind the store
 * markup, drawing each stage into its element's rectangle with the scissor test.
 */
export class SharedRenderer {
  readonly canvas: HTMLCanvasElement;
  readonly supported: boolean;
  private renderer?: THREE.WebGLRenderer;
  private views = new Set<StageView>();
  private raf = 0;
  private last = 0;
  private width = 0;
  private height = 0;

  constructor(host: HTMLElement) {
    let renderer: THREE.WebGLRenderer | undefined;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (err) {
      console.warn('[archive] WebGL unavailable', err);
    }
    this.supported = !!renderer;
    if (renderer) {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setClearColor(0x000000, 0);
      renderer.localClippingEnabled = true;
      renderer.autoClear = false;
      this.renderer = renderer;
      this.canvas = renderer.domElement;
    } else {
      this.canvas = document.createElement('canvas');
    }
    this.canvas.className = 'gl-canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    host.append(this.canvas);
  }

  /** Compile a stage's shaders ahead of time so its first frame doesn't hitch. */
  precompile(view: StageView): void {
    const r = this.renderer;
    if (!r) return;
    const { scene, camera } = view.stage;
    if (typeof r.compileAsync === 'function') void r.compileAsync(scene, camera).catch(() => undefined);
    else r.compile(scene, camera);
  }

  add(view: StageView): void {
    this.views.add(view);
  }

  remove(view: StageView): void {
    this.views.delete(view);
  }

  start(): void {
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

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.renderer?.clear();
  }

  private render(dt: number): void {
    const renderer = this.renderer!;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w !== this.width || h !== this.height) {
      this.width = w;
      this.height = h;
      renderer.setSize(w, h, false);
    }
    renderer.setScissorTest(false);
    renderer.clear();
    renderer.setScissorTest(true);

    const bounds = this.canvas.getBoundingClientRect();
    for (const view of this.views) {
      if (!view.active) continue;
      const r = view.el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      if (r.bottom < bounds.top || r.top > bounds.bottom || r.right < bounds.left || r.left > bounds.right) continue;
      const left = r.left - bounds.left;
      const bottom = bounds.bottom - r.bottom;
      renderer.setViewport(left, bottom, r.width, r.height);
      renderer.setScissor(left, bottom, r.width, r.height);
      view.stage.update(dt, r.width / r.height);
      renderer.clearDepth();
      renderer.render(view.stage.scene, view.stage.camera);
    }
  }
}
