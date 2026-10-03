import * as THREE from 'three';
import type { ModelData } from './models';
import { createPhosphorMaterial, PHOSPHOR, type PhosphorMaterial } from './phosphor';

export type RenderMode = 'solid' | 'wire' | 'xray';

export interface StageOptions {
  /** Camera elevation in radians. */
  elevation?: number;
  /** >1 pulls the camera back, <1 pushes it in (the boot hero overflows the screen). */
  fit?: number;
  fov?: number;
  floor?: boolean;
  /** Idle spin speed in radians per second. */
  spin?: number;
  /** Edge-line opacity in solid mode. */
  edgeOpacity?: number;
  /** Override the phosphor ramp (sRGB hex), e.g. for the dark silhouette behind the HUD. */
  palette?: { dark: string; lit: string; rim: string; spec?: number; rimStrength?: number } | null;
}

const tmpPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);

/**
 * One product on a holo-plinth. Owns its scene + camera; something else
 * (the shared scissor renderer, or the inspector) decides where it is drawn.
 */
export class ProductStage {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly pivot = new THREE.Group();
  readonly opts: Required<StageOptions>;

  model?: ModelData;
  mode: RenderMode = 'solid';

  /** 0→1 build progress (bottom-up). */
  reveal = 1;
  private revealFrom = 1;
  /** ms timestamp the running build started at; -1 = queued for the first visible frame. */
  private revealStart = 0;
  private revealDuration = 0;

  hover = 0;
  hoverTarget = 0;
  intensity = 1;

  yaw = Math.random() * Math.PI * 2;
  pitch = 0;
  yawVelocity = 0;
  dragging = false;
  /** When false the stage never spins itself (inspector uses OrbitControls). */
  autoSpin = true;
  /** When true, only an explicit `frame(aspect, true)` may move the camera. */
  cameraLocked = false;
  private idleFor = 10;

  private solid?: THREE.Mesh<THREE.BufferGeometry, PhosphorMaterial>;
  private xray?: THREE.Mesh<THREE.BufferGeometry, PhosphorMaterial>;
  private edges?: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private floor?: THREE.Group;
  private scanRing?: THREE.LineLoop<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
  /** Orbit/look-at target: the middle of the model's swept cylinder. */
  readonly target = new THREE.Vector3();
  private time = 0;
  private aspect = 1;

  constructor(options: StageOptions = {}) {
    this.opts = {
      elevation: 0.32,
      fit: 1.05,
      fov: 30,
      floor: true,
      spin: 0.32,
      edgeOpacity: 0.16,
      palette: null,
      ...options,
    };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) this.opts.spin = 0;
    this.camera = new THREE.PerspectiveCamera(this.opts.fov, 1, 0.5, 5000);
    this.scene.add(this.pivot);
  }

  setModel(data: ModelData): void {
    this.clearModel();
    this.model = data;
    const { geometry, edges, size } = data;

    const solidMat = createPhosphorMaterial({ minY: 0, maxY: size.y });
    const pal = this.opts.palette;
    if (pal) {
      solidMat.uniforms.uDark.value.set(pal.dark);
      solidMat.uniforms.uLit.value.set(pal.lit);
      solidMat.uniforms.uRim.value.set(pal.rim);
      if (pal.spec !== undefined) solidMat.uniforms.uSpec.value = pal.spec;
      if (pal.rimStrength !== undefined) solidMat.uniforms.uRimStrength.value = pal.rimStrength;
    }
    solidMat.polygonOffset = true;
    solidMat.polygonOffsetFactor = 1;
    solidMat.polygonOffsetUnits = 1;
    this.solid = new THREE.Mesh(geometry, solidMat);

    const xrayMat = createPhosphorMaterial({ xray: true, minY: 0, maxY: size.y });
    this.xray = new THREE.Mesh(geometry, xrayMat);
    this.xray.visible = false;

    const edgeMat = new THREE.LineBasicMaterial({
      color: PHOSPHOR.line,
      transparent: true,
      opacity: this.opts.edgeOpacity,
      clippingPlanes: [this.clip],
      depthWrite: false,
    });
    this.edges = new THREE.LineSegments(edges, edgeMat);

    this.pivot.add(this.solid, this.xray, this.edges);
    if (this.opts.floor) this.buildFloor(data);
    this.applyMode();
    this.frame(this.aspect, true);
  }

  setMode(mode: RenderMode): void {
    this.mode = mode;
    this.applyMode();
  }

  /** Animate the bottom-up build. It starts on the first frame the stage is actually drawn. */
  build(duration = 1100, from = 0): void {
    this.revealFrom = from;
    this.reveal = from;
    this.revealStart = -1;
    this.revealDuration = duration;
  }

  hideModel(): void {
    this.reveal = this.revealFrom = 0;
    this.revealDuration = 0;
  }

  showModel(): void {
    this.reveal = this.revealFrom = 1;
    this.revealDuration = 0;
  }

  /** Mark user interaction so idle spin waits a beat before resuming. */
  poke(): void {
    this.idleFor = 0;
  }

  frame(aspect: number, force = false): void {
    if (!force && Math.abs(aspect - this.aspect) < 1e-3) return;
    this.aspect = aspect;
    const cam = this.camera;
    cam.aspect = aspect;
    if (this.model && (force || !this.cameraLocked)) {
      // The model spins, so fit the cylinder it sweeps rather than its bounding sphere.
      const { size } = this.model;
      const r = Math.hypot(size.x, size.z) / 2;
      const el = this.opts.elevation;
      const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
      const tanH = tanV * aspect;
      const halfV = (size.y * Math.cos(el) + 2 * r * Math.sin(el)) / 2;
      const dist = Math.max(halfV / tanV, r / tanH) * this.opts.fit + r * 0.55;
      const target = this.target.set(0, size.y / 2, 0);
      cam.position.set(0, target.y + Math.sin(el) * dist, Math.cos(el) * dist);
      cam.near = Math.max(0.5, dist - r * 4);
      cam.far = dist + r * 6;
      cam.lookAt(target);
    }
    cam.updateProjectionMatrix();
  }

  update(dt: number, aspect: number): void {
    this.time += dt;
    this.frame(aspect);

    if (this.revealDuration > 0) {
      const now = performance.now();
      if (this.revealStart < 0) this.revealStart = now;
      const t = Math.min(1, (now - this.revealStart) / this.revealDuration);
      this.reveal = this.revealFrom + (1 - this.revealFrom) * (1 - Math.pow(1 - t, 2.2));
      if (t >= 1) this.revealDuration = 0;
    }

    this.hover += (this.hoverTarget - this.hover) * Math.min(1, dt * 8);

    if (!this.dragging) {
      this.idleFor += dt;
      this.yaw += this.yawVelocity;
      this.yawVelocity *= Math.pow(0.04, dt);
      if (this.autoSpin && this.idleFor > 1.2) {
        const speed = this.opts.spin * (1 + this.hover * 1.4);
        this.yaw += speed * dt * Math.min(1, (this.idleFor - 1.2) * 0.8);
      }
      if (this.idleFor > 2.5) this.pitch *= Math.pow(0.3, dt);
    }
    this.pivot.rotation.set(this.pitch, this.yaw, 0, 'XYZ');

    const reveal = Math.max(0, Math.min(1, this.reveal));
    for (const mesh of [this.solid, this.xray]) {
      if (!mesh) continue;
      const u = mesh.material.uniforms;
      u.uTime.value = this.time;
      u.uReveal.value = reveal >= 1 ? 1.01 : reveal;
      u.uHover.value = this.hover;
      u.uIntensity.value = this.intensity;
    }
    if (this.model && this.edges) {
      const h = this.model.size.y;
      tmpPlane.set(new THREE.Vector3(0, -1, 0), reveal >= 1 ? h * 10 : reveal * h);
      this.clip.copy(tmpPlane);
      this.edges.material.opacity = this.edgeOpacityFor() * this.intensity;
    }

    if (this.scanRing && this.model) {
      const cycle = (this.time * 0.35) % 1;
      const r = 0.25 + cycle * 1.0;
      this.scanRing.scale.setScalar(r);
      this.scanRing.material.opacity = (1 - cycle) * 0.5 * this.intensity;
    }
    if (this.floor) {
      this.floor.rotation.y = this.yaw * 0.25;
    }
  }

  dispose(): void {
    this.clearModel();
  }

  private edgeOpacityFor(): number {
    if (this.mode === 'wire') return 0.95;
    if (this.mode === 'xray') return 0.18;
    return this.opts.edgeOpacity + this.hover * 0.25;
  }

  private applyMode(): void {
    if (!this.solid || !this.xray || !this.edges) return;
    const wire = this.mode === 'wire';
    this.solid.visible = this.mode !== 'xray';
    // wire mode keeps the solid as a depth-only occluder for hidden-line edges
    this.solid.material.colorWrite = !wire;
    this.xray.visible = this.mode === 'xray';
    this.edges.material.color.copy(wire ? PHOSPHOR.red : PHOSPHOR.line);
  }

  private buildFloor(data: ModelData): void {
    const r = Math.hypot(data.size.x, data.size.z) / 2;
    const floor = new THREE.Group();
    const mat = new THREE.LineBasicMaterial({ color: PHOSPHOR.lineDim, transparent: true, opacity: 0.7, depthWrite: false });

    const ring = (radius: number, segments = 96) => {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
      }
      return new THREE.BufferGeometry().setFromPoints(pts);
    };
    floor.add(new THREE.LineLoop(ring(r), mat));
    floor.add(new THREE.LineLoop(ring(r * 0.72), mat));

    const ticks: THREE.Vector3[] = [];
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const inner = i % 4 === 0 ? r * 1.0 : r * 1.0;
      const outer = i % 4 === 0 ? r * 1.12 : r * 1.05;
      ticks.push(new THREE.Vector3(Math.cos(a) * inner, 0, Math.sin(a) * inner));
      ticks.push(new THREE.Vector3(Math.cos(a) * outer, 0, Math.sin(a) * outer));
    }
    ticks.push(new THREE.Vector3(-r * 1.25, 0, 0), new THREE.Vector3(-r * 0.8, 0, 0));
    ticks.push(new THREE.Vector3(r * 0.8, 0, 0), new THREE.Vector3(r * 1.25, 0, 0));
    ticks.push(new THREE.Vector3(0, 0, -r * 1.25), new THREE.Vector3(0, 0, -r * 0.8));
    ticks.push(new THREE.Vector3(0, 0, r * 0.8), new THREE.Vector3(0, 0, r * 1.25));
    floor.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(ticks), mat));

    const scanMat = new THREE.LineBasicMaterial({ color: PHOSPHOR.red, transparent: true, opacity: 0.4, depthWrite: false });
    this.scanRing = new THREE.LineLoop(ring(r), scanMat);
    this.scene.add(this.scanRing);

    this.floor = floor;
    this.scene.add(floor);
  }

  private clearModel(): void {
    for (const obj of [this.solid, this.xray, this.edges]) {
      if (!obj) continue;
      this.pivot.remove(obj);
      obj.material.dispose();
    }
    if (this.floor) {
      this.scene.remove(this.floor);
      this.floor.traverse((o) => {
        if (o instanceof THREE.Line) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
    }
    if (this.scanRing) {
      this.scene.remove(this.scanRing);
      this.scanRing.geometry.dispose();
      this.scanRing.material.dispose();
    }
    this.solid = this.xray = this.edges = undefined;
    this.floor = undefined;
    this.scanRing = undefined;
  }
}
