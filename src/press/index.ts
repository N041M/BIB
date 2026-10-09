import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { BACKDROP_DIR, currentPoster } from '../backdrop/posters';
import { flicker } from '../backdrop/scene';
import { Backdrop } from './backdrop';
import { buildCandle, type Candle } from './candle';
import { drawModel, type ModelDrawing } from './drawing';
import { hallEnvironment } from './env';
import { FinishShader } from './finish';
import { buildMachine, type Machine, type MachineMaterials, type PressLayout } from './machine';
import { brass, headGlass, iron } from './materials';
import { Plates, type PlateSpec } from './plates';
import { buildSeal, type Seal } from './seal';
import { buildSkull, type Skull } from './skull';
import { bakeParchment, paperUniforms, rollMaterial, sheetMaterial, type Parchment } from './paper';

export type { PressLayout } from './machine';
export type { PlateSpec } from './plates';
export type { ModelDrawing } from './drawing';

/** How far the eye is from the sheet, in viewport heights. About a 35° lens. */
const EYE = 1.6;
/** How far behind the sheet the hall's image hangs, in viewport heights. */
const HALL = 1.6;
/** How far the eye moves with the pointer, as a share of its distance. */
const SWAY = { x: 0.07, y: 0.045 };
/**
 * Brightness of the lights, in three.js candela with world units of CSS
 * pixels. The key stands for the racks of candles in front of the machine,
 * out of view. The lamp is the candle on the arm, and only lights what is
 * near it.
 */
const KEY = 7.5e6;
const LAMP = 1.6e5;

/** The most pixels drawn in a frame: a 1440 by 900 window at twice its size. */
const PIXELS = 5.2e6;

/** A value easing from one number to another over a set time. */
class Track {
  private from = 0;
  private to = 0;
  private start = 0;
  private duration = 0;
  private ease: (t: number) => number = (t) => t;

  constructor(public value: number) {
    this.from = this.to = value;
  }

  go(to: number, now: number, duration: number, delay: number, ease: (t: number) => number): void {
    this.from = this.value;
    this.to = to;
    this.start = now + delay;
    this.duration = duration;
    this.ease = ease;
    if (duration <= 0 && delay <= 0) this.value = to;
  }

  update(now: number): number {
    if (this.value === this.to && now >= this.start + this.duration) return this.value;
    const t = this.duration > 0 ? Math.min(1, Math.max(0, (now - this.start) / this.duration)) : now >= this.start ? 1 : 0;
    this.value = this.from + (this.to - this.from) * this.ease(t);
    return this.value;
  }

  get done(): boolean {
    return this.value === this.to;
  }
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeIn = (t: number) => t * t * t;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * The blog's machine, drawn with three.js: brass side plates, two rolls, the
 * print head and a candle, lit by the candle and by what the brass reflects
 * of the hall, with the hall's image far behind.
 *
 * The camera works like a window onto the scene. Its view always maps the
 * plane of the sheet onto the same pixels, wherever the eye moves, so the
 * page's invisible text stays over the type drawn on the sheet, while the
 * parts in front of and behind the sheet shift with the eye.
 */
export class Press {
  readonly canvas: HTMLCanvasElement;
  readonly supported: boolean;
  /** Called before each frame is drawn: the place to draw the type into the ink canvas. */
  onFrame?: (now: number) => void;

  private renderer?: THREE.WebGLRenderer;
  private composer?: EffectComposer;
  private finish?: ShaderPass;
  private bloom?: UnrealBloomPass;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera();
  /** Everything that rises into view when the blog opens. */
  private rig = new THREE.Group();
  private paper = paperUniforms();
  private mats?: MachineMaterials;
  private machine?: Machine;
  private candle?: Candle;
  private seal?: Seal;
  private plates = new Plates(() => this.invalidate());
  private skull?: Skull;
  /** How far the skull has flown in, and how lit it is by the pointer. */
  private arrive = new Track(0);
  private lit = 0;
  private litTo = 0;
  private parch?: Parchment;
  private backdrop?: Backdrop;
  private ink?: THREE.CanvasTexture;
  private inkSize = '';
  private key = new THREE.SpotLight(0xffc89c, KEY, 0, 0.5, 1, 2);
  private lamp = new THREE.PointLight(0xff9848, LAMP, 520, 2);
  private glow = new THREE.PointLight(0xff2a14, 900, 0, 2);
  private daylight = new THREE.DirectionalLight(0xbfd0ff, 0.22);
  private L?: PressLayout;
  private built = '';
  private eye = new THREE.Vector2();
  private eyeTo = new THREE.Vector2();
  private lift = new Track(0);
  private turn = new Track(0);
  private lastTurn = 0;
  private raf = 0;
  /** True while a frame is being drawn, so a change made during it asks for one more frame instead of a second loop. */
  private drawing = false;
  private again = false;
  private running = false;
  private last = 0;
  private motion = true;

  constructor() {
    let renderer: THREE.WebGLRenderer | undefined;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
    } catch (err) {
      console.warn('[blog] WebGL unavailable', err);
    }
    this.supported = !!renderer;
    this.canvas = renderer?.domElement ?? document.createElement('canvas');
    this.canvas.setAttribute('aria-hidden', 'true');
    if (!renderer) return;

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.localClippingEnabled = true;
    this.renderer = renderer;

    this.scene.background = new THREE.Color(0x050302);
    this.scene.environment = hallEnvironment(renderer);
    this.scene.environmentIntensity = 0.55;

    const phosphor = getComputedStyle(document.documentElement).getPropertyValue('--p').trim() || '#ff5a43';
    this.mats = {
      brass: brass(0.12),
      rubbed: brass(0.8),
      iron: iron(),
      glass: headGlass(new THREE.Color(phosphor)),
      sheet: sheetMaterial(this.paper),
      roll: rollMaterial(this.paper),
    };

    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.radius = 6;
    this.key.shadow.bias = -0.0004;
    this.key.shadow.camera.near = 200;
    this.key.shadow.camera.far = 8000;
    this.glow.color.set(phosphor);
    this.rig.add(this.lamp, this.glow, this.plates.group);
    this.scene.add(this.rig, this.key, this.key.target, this.daylight);

    this.backdrop = new Backdrop(`${BACKDROP_DIR}${currentPoster().name}.webp`);
    this.scene.add(this.backdrop.mesh);

    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.5, 0.95);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.finish = new ShaderPass(FinishShader);
    this.composer.addPass(this.finish);

    window.addEventListener(
      'pointermove',
      (e) => {
        if (e.pointerType !== 'mouse') return;
        this.eyeTo.set((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
      },
      { passive: true },
    );
  }

  /**
   * Device pixels per CSS pixel that the scene, and so the ink canvas, are
   * drawn at: the screen's own, up to 2, unless that would draw more than
   * PIXELS a frame.
   */
  get ratio(): number {
    const budget = Math.sqrt(PIXELS / (window.innerWidth * window.innerHeight));
    const ratio = Math.max(1, Math.min(window.devicePixelRatio || 1, 2, budget));
    return Math.round(ratio * 8) / 8;
  }

  /** Build the machine round the sheet, unless it is built for this layout already. */
  layout(L: PressLayout): void {
    const renderer = this.renderer;
    const mats = this.mats;
    if (!renderer || !mats || !this.composer) return;
    const key = `${JSON.stringify(L)}@${this.ratio}`;
    if (key === this.built) return;
    this.built = key;
    this.L = L;

    const width = L.right - L.left;
    if (!this.parch || Math.abs(this.parch.width - width) > 0.5) {
      this.parch?.dispose();
      this.parch = bakeParchment(renderer, width, this.ratio);
      this.paper.uParch.value = this.parch.texture;
      this.paper.uParchSize.value.set(width, this.paper.uParchSize.value.y);
    }
    this.paper.uHalf.value.set(L.w / 2, L.h / 2);
    this.paper.uLeft.value = L.left;

    if (this.machine) {
      this.rig.remove(this.machine.group);
      this.machine.dispose();
    }
    if (this.candle) {
      this.rig.remove(this.candle.group);
      this.candle.dispose();
      this.candle = undefined;
    }
    const machine = buildMachine(L, mats, EYE * L.h);
    this.machine = machine;
    this.rig.add(machine.group);
    const roll = (mats.roll.userData as { uniforms: Record<string, THREE.IUniform> }).uniforms;
    roll.uRadius.value = L.radius;
    roll.uRollX.value = machine.rollLeft;
    if (this.seal) {
      this.rig.remove(this.seal.group);
      this.seal.dispose();
      this.seal = undefined;
    }
    if (machine.seal) {
      this.seal = buildSeal(machine.seal, Math.min(70, L.h * 0.08));
      this.rig.add(this.seal.group);
    }
    if (machine.flame && machine.stand) {
      this.candle = buildCandle(machine.flame, machine.stand.y, mats);
      this.rig.add(this.candle.group);
    }
    this.lamp.position.copy(this.flame());
    this.glow.position.copy(machine.head);

    // the servo skull hovers over the left end of the top roll, its placard just above the roll
    if (this.skull) {
      this.scene.remove(this.skull.group);
      this.skull.dispose();
    }
    const d = EYE * L.h;
    // pixels to the pattern's millimetre, and where the skull's centre sits on screen: over the right end of the top roll
    const mm = L.compact ? 1.35 : 2.1;
    const z = 80;
    const pull = (d - z) / d;
    const at = new THREE.Vector3((L.right - (L.compact ? 14 : 22) - L.w / 2) * pull, (L.h / 2 - (L.top - (L.compact ? 54 : 76))) * pull, z);
    this.skull = buildSkull(
      at,
      mm,
      '‹ Main page',
      mats,
      (p) => new THREE.Vector2(L.w / 2 + (p.x * d) / (d - p.z), L.h / 2 - (p.y * d) / (d - p.z)),
      () => this.invalidate(),
    );
    this.scene.add(this.skull.group);

    const eye = EYE * L.h;
    this.backdrop?.place({ w: L.w, h: L.h, eye }, HALL * L.h);
    this.daylight.position.set(L.w * 0.5, L.h * 0.9, eye * 0.3);
    this.key.position.set(-L.w * 0.42, L.h * 0.62, eye * 0.85);
    this.key.target.position.set(-L.w * 0.06, L.h * 0.08, 0);
    this.key.distance = 0;
    this.key.intensity = KEY * (eye / 1760) ** 2;

    renderer.setPixelRatio(this.ratio);
    renderer.setSize(L.w, L.h, false);
    this.composer.setPixelRatio(this.ratio);
    this.composer.setSize(L.w, L.h);
    this.finish!.uniforms.uAspect.value = L.w / L.h;
    this.finish!.uniforms.uScale.value = this.ratio;
    this.rig.position.y = this.rigY();
    this.invalidate();
  }

  /** Compile the shaders ahead of the first frame. */
  async warm(): Promise<void> {
    if (!this.renderer || !this.L) return;
    this.placeCamera();
    await this.renderer.compileAsync(this.scene, this.camera).catch(() => undefined);
  }

  /** The canvas the type is drawn into, and where on screen it lies. */
  setInk(source: HTMLCanvasElement, rect: { x: number; y: number; w: number; h: number }): void {
    const size = `${source.width}x${source.height}`;
    if (!this.ink || this.ink.image !== source || size !== this.inkSize) {
      this.ink?.dispose();
      const tex = new THREE.CanvasTexture(source);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.generateMipmaps = false;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      this.ink = tex;
      this.inkSize = size;
      this.paper.uInk.value = tex;
    }
    this.paper.uInkRect.value.set(rect.x, rect.y, rect.w, rect.h);
  }

  /** The ink canvas was drawn again. */
  inkChanged(): void {
    if (this.ink) this.ink.needsUpdate = true;
    this.invalidate();
  }

  /**
   * How far the paper has moved, in pixels: the parchment and the rolls'
   * surfaces move with it. `shift` is how far the page's own content has moved
   * on screen since it was laid out, which carries the pasted photos.
   */
  setPaper(offset: number, shift: number): void {
    this.paper.uScroll.value = offset;
    this.plates.place(shift);
  }

  /** The colour photos pasted onto the sheet. */
  setPlates(list: PlateSpec[]): void {
    if (this.L) this.plates.set(list, { w: this.L.w, h: this.L.h }, this.ratio);
    this.invalidate();
  }

  /** Draw a pattern's STL for the printer, `w` by `h` device pixels. */
  drawModel(file: string, w: number, h: number): Promise<ModelDrawing> {
    if (!this.renderer) return Promise.reject(new Error('no WebGL'));
    return drawModel(this.renderer, file, w, h);
  }

  /** The servo skull's place on screen, for the link that takes its clicks. */
  get backBox(): { x: number; y: number; w: number; h: number } | undefined {
    return this.skull?.box;
  }

  /** The pointer or the keyboard is on the servo skull's placard. */
  setBackHover(on: boolean): void {
    this.litTo = on ? 1 : 0;
    this.invalidate();
  }

  /** Turn from the hall to the machine and raise it. `instant` puts everything in place at once. */
  open(instant: boolean): void {
    const now = performance.now();
    this.motion = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const skip = instant || !this.motion;
    this.turn.go(1, now, skip ? 0 : 1050, 0, easeInOut);
    this.lift.go(1, now, skip ? 0 : 900, skip ? 0 : 450, easeOut);
    this.arrive.go(1, now, skip ? 0 : 1100, skip ? 0 : 750, (t) => t);
    this.lastTurn = this.turn.value;
    this.start();
  }

  /** Lower the machine and turn back to the hall. */
  close(instant: boolean): void {
    const now = performance.now();
    const skip = instant || !this.motion;
    this.lift.go(0, now, skip ? 0 : 450, 0, easeIn);
    this.arrive.go(0, now, skip ? 0 : 500, 0, (t) => t);
    this.turn.go(0, now, skip ? 0 : 1050, skip ? 0 : 250, easeInOut);
    this.invalidate();
  }

  /** Draw one frame soon, for a change that happens while the loop is not running. */
  invalidate(): void {
    if (this.drawing) this.again = true;
    else if (!this.raf && this.renderer) this.raf = requestAnimationFrame(this.frame);
  }

  /** Keep drawing every frame: the candle flickers and the eye drifts. */
  private start(): void {
    this.running = true;
    this.last = performance.now();
    this.invalidate();
  }

  /** Stop drawing once the machine is down and the view has turned back. */
  stop(): void {
    this.running = false;
  }

  private frame = (now: number): void => {
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.drawing = true;
    this.again = false;
    this.draw(now, dt);
    this.drawing = false;
    this.raf = 0;
    if (this.lift.done && this.turn.done && this.turn.value === 0) this.running = false;
    const settling = !this.lift.done || !this.turn.done || !this.arrive.done || this.lit !== this.litTo || this.eye.distanceTo(this.eyeTo) > 0.002;
    if ((this.running && this.motion) || settling || this.again) this.raf = requestAnimationFrame(this.frame);
  };

  private draw(now: number, dt: number): void {
    const composer = this.composer;
    const L = this.L;
    if (!composer || !L) return;
    const t = now / 1000;

    const turn = this.turn.update(now);
    this.lift.update(now);
    const speed = dt > 0 ? Math.min(1, Math.abs(turn - this.lastTurn) / dt / 2.2) : 0;
    this.lastTurn = turn;
    this.backdrop?.set(turn, speed);
    this.rig.position.y = this.rigY();
    if (this.machine) this.plates.clipTo(this.machine.rolls.top + this.rig.position.y, this.machine.rolls.bottom + this.rig.position.y);

    if (this.motion) {
      const drift = new THREE.Vector2(Math.sin(t * 0.21) * 0.12 + Math.sin(t * 0.53) * 0.04, Math.sin(t * 0.17 + 1) * 0.1);
      const goal = this.eyeTo.clone().add(drift);
      this.eye.lerp(goal, 1 - Math.exp(-dt * 2.2));
    } else {
      this.eye.set(0, 0);
    }

    // the candle flickers with the same rhythm as the ones in the hall
    const f = this.motion ? flicker(t, 1) : 1;
    const lean = this.motion ? Math.sin(t * 1.3) * 0.6 + Math.sin(t * 3.7 + 1) * 0.3 : 0;
    // without a candle on screen there is nothing to give off its light
    this.lamp.intensity = this.candle ? LAMP * f : 0;
    // the out-of-view candles flicker too, but there are many of them, so less
    this.key.intensity = KEY * (EYE * L.h / 1760) ** 2 * (1 + (f - 1) * 0.35);
    this.lamp.position.copy(this.flame()).add(new THREE.Vector3(lean * 3, (f - 1) * 8, 0));
    if (this.candle) {
      const u = this.candle.flame.material.uniforms;
      u.uTime.value = t;
      u.uLean.value = lean;
      u.uPower.value = 0.85 + (f - 1) * 1.6;
      this.candle.flame.scale.set(0.96 + (f - 1) * 0.4, 0.9 + (f - 1) * 1.6, 1);
      (this.candle.wax.userData.uniforms as { uGlow: THREE.IUniform }).uGlow.value = f;
    }
    if (this.motion) this.seal?.sway(t);
    this.arrive.update(now);
    this.lit += (this.litTo - this.lit) * (1 - Math.exp(-dt * 10));
    if (Math.abs(this.litTo - this.lit) < 0.002) this.lit = this.litTo;
    this.skull?.update(this.motion ? t : 0, this.lit, this.arrive.value);

    this.onFrame?.(now);
    this.placeCamera();
    this.finish!.uniforms.uTime.value = this.motion ? t : 0;
    composer.render(dt);
  }

  /** Where the candle's light comes from, just above its flame. Narrow screens have no candle, and the light is off. */
  private flame(): THREE.Vector3 {
    const at = this.machine?.flame;
    return at ? at.clone().add(new THREE.Vector3(1.5, 6, 0)) : new THREE.Vector3();
  }

  /** The rig sits below the view until it rises. */
  private rigY(): number {
    const L = this.L;
    return L ? -(1 - this.lift.value) * (L.h + 260) : 0;
  }

  /**
   * An off-axis projection through the rectangle of the screen in the plane
   * z = 0: the eye moves, the sheet's plane stays exactly where it is on
   * screen, and everything nearer or farther shifts.
   */
  private placeCamera(): void {
    const L = this.L;
    if (!L) return;
    const cam = this.camera;
    const d = EYE * L.h;
    const ex = this.eye.x * SWAY.x * d;
    const ey = this.eye.y * SWAY.y * d;
    cam.position.set(ex, ey, d);
    cam.quaternion.identity();
    cam.near = d * 0.25;
    cam.far = d * 2 + HALL * L.h * 2;
    cam.updateMatrixWorld();
    const n = cam.near / d;
    cam.projectionMatrix.makePerspective((-L.w / 2 - ex) * n, (L.w / 2 - ex) * n, (L.h / 2 - ey) * n, (-L.h / 2 - ey) * n, cam.near, cam.far);
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
  }
}
