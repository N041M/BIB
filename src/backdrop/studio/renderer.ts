import { bindTextures, createTarget, deleteTarget, Program, type Target } from '../gl';
import { censerPosition, ember, sceneGLSL } from '../scene';
import { bakeVolume, createNoise, createSprites, createTexture3D, HEADER, setView, SPRITE_ATTRIBUTES, VOLUME } from '../shared';
import airFrag from '../shaders/air.frag?raw';
import bakeFrag from '../shaders/bake.frag?raw';
import bloomFrag from '../shaders/bloom.frag?raw';
import censerGlsl from '../shaders/censer.glsl?raw';
import commonGlsl from '../shaders/common.glsl?raw';
import finalFrag from '../shaders/final.frag?raw';
import frameFrag from '../shaders/frame.frag?raw';
import gradeGlsl from '../shaders/grade.glsl?raw';
import hallGlsl from '../shaders/hall.glsl?raw';
import mapsFrag from '../shaders/maps.frag?raw';
import motionGlsl from '../shaders/motion.glsl?raw';
import quadVert from '../shaders/quad.vert?raw';
import servitorGlsl from '../shaders/servitor.glsl?raw';
import smokeGlsl from '../shaders/smoke.glsl?raw';
import spriteFrag from '../shaders/sprite.frag?raw';
import spriteVert from '../shaders/sprite.vert?raw';
import volumeFrag from '../shaders/volume.frag?raw';

const BLOOM_LEVELS = 6;
/** Every candle group at its average brightness, so the live overlay can flicker around it. */
const STEADY: [number, number, number, number] = [1, 1, 1, 1];

type ProgramName = 'bake' | 'volume' | 'air' | 'frame' | 'sprite' | 'maps' | 'bloom' | 'final';

export interface RenderOptions {
  /** Draw the censer, its smoke, the flames and the dust. */
  dynamic: boolean;
  grain: boolean;
}

/**
 * The full renderer, used only by the studio tool that renders the backdrop
 * images. It raymarches the whole scene, which takes far too long to compile
 * and run on a visitor's machine. Output and internal resolution are the
 * same: the size of the image being made.
 */
export class StudioRenderer {
  readonly gl: WebGL2RenderingContext;
  private programs: Record<ProgramName, Program>;
  private vao: WebGLVertexArrayObject;
  private spriteVao: WebGLVertexArrayObject;
  private spriteCount: number;
  private noise: WebGLTexture;
  private light: WebGLTexture;
  private w = 0;
  private h = 0;
  private bake?: Target;
  private air?: Target;
  private hdr?: Target;
  private maps?: Target;
  private bloom: Target[] = [];

  constructor(
    private canvas: HTMLCanvasElement,
    private colours: { accent: [number, number, number]; bg: [number, number, number] },
  ) {
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL2 is not available');
    if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('float render targets are not available');
    this.gl = gl;

    const scene = sceneGLSL();
    const withScene = (...parts: string[]) => [HEADER, scene, commonGlsl, ...parts].join('\n');
    const vert = HEADER + quadVert;
    this.programs = {
      bake: new Program(gl, 'bake', vert, withScene(hallGlsl, servitorGlsl, bakeFrag)),
      volume: new Program(gl, 'volume', vert, withScene(volumeFrag)),
      air: new Program(gl, 'air', vert, withScene(motionGlsl, smokeGlsl, airFrag)),
      frame: new Program(gl, 'frame', vert, withScene(motionGlsl, censerGlsl, frameFrag)),
      sprite: new Program(gl, 'sprite', withScene(spriteVert), withScene(spriteFrag), SPRITE_ATTRIBUTES),
      maps: new Program(gl, 'maps', vert, withScene(mapsFrag)),
      bloom: new Program(gl, 'bloom', vert, HEADER + bloomFrag),
      final: new Program(gl, 'final', vert, HEADER + gradeGlsl + finalFrag),
    };
    for (const p of Object.values(this.programs)) p.ready(false);

    this.vao = gl.createVertexArray()!;
    this.noise = createNoise(gl);
    this.light = createTexture3D(gl, VOLUME, gl.RGBA8, gl.RGBA, null);
    bakeVolume(gl, this.programs.volume, this.light, this.vao);
    [this.spriteVao, this.spriteCount] = createSprites(gl);
  }

  /** Set the size of the image, which starts a new bake. */
  resize(w: number, h: number): void {
    const gl = this.gl;
    for (const t of [this.bake, this.air, this.hdr, this.maps, ...this.bloom]) if (t) deleteTarget(gl, t);
    this.w = w;
    this.h = h;
    this.canvas.width = w;
    this.canvas.height = h;
    this.bake = createTarget(gl, w, h, 4, false);
    this.air = createTarget(gl, Math.ceil(w / 2), Math.ceil(h / 2), 1, false);
    this.hdr = createTarget(gl, w, h, 1, true);
    this.maps = createTarget(gl, w / 4, h / 4, 2, false, gl.RGBA8);
    this.bloom = [];
    let bw = w;
    let bh = h;
    for (let i = 0; i < BLOOM_LEVELS && bw > 2 && bh > 2; i++) {
      bw = Math.max(1, bw >> 1);
      bh = Math.max(1, bh >> 1);
      this.bloom.push(createTarget(gl, bw, bh, 1, true));
    }
  }

  /** Bake the static scene, averaging `passes` samples per pixel. */
  bakeScene(passes: number): void {
    const gl = this.gl;
    const t = this.bake!;
    const p = this.programs.bake.use();
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
    gl.viewport(0, 0, t.w, t.h);
    this.setView(p);
    gl.uniform3fv(p.u('uAccent'), this.colours.accent);
    gl.bindVertexArray(this.vao);
    for (let pass = 0; pass < passes; pass++) {
      if (pass > 0) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.CONSTANT_ALPHA, gl.ONE_MINUS_CONSTANT_ALPHA);
        gl.blendColor(0, 0, 0, 1 / (pass + 1));
      }
      gl.uniform2f(p.u('uJitter'), halton(pass, 2) - 0.5, halton(pass, 3) - 0.5);
      // in strips, so no single draw keeps the GPU busy for long
      gl.enable(gl.SCISSOR_TEST);
      for (let y = 0; y < t.h; y += 128) {
        gl.scissor(0, y, t.w, 128);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.disable(gl.SCISSOR_TEST);
      gl.disable(gl.BLEND);
    }
  }

  /** Draw the image at `time` seconds into the canvas. */
  render(time: number, opts: RenderOptions): void {
    const gl = this.gl;
    const bake = this.bake!;
    const air = this.air!;
    const hdr = this.hdr!;
    gl.bindVertexArray(this.vao);

    let p = this.programs.air.use();
    gl.bindFramebuffer(gl.FRAMEBUFFER, air.fb);
    gl.viewport(0, 0, air.w, air.h);
    this.setView(p);
    this.setMotion(p, time);
    gl.uniform1i(p.u('uDynamic'), opts.dynamic ? 1 : 0);
    gl.uniform1i(p.u('uFrame'), 0);
    bindTextures(gl, p, [
      ['uDay', bake.tex[0]],
      ['uNoise', this.noise, gl.TEXTURE_3D],
      ['uLight', this.light, gl.TEXTURE_3D],
    ]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    p = this.programs.frame.use();
    gl.bindFramebuffer(gl.FRAMEBUFFER, hdr.fb);
    gl.viewport(0, 0, this.w, this.h);
    this.setView(p);
    this.setMotion(p, time);
    gl.uniform1i(p.u('uDynamic'), opts.dynamic ? 1 : 0);
    bindTextures(gl, p, [
      ['uDay', bake.tex[0]],
      ['uAlbedo', bake.tex[1]],
      ['uCandleD', bake.tex[2]],
      ['uCandleS', bake.tex[3]],
      ['uAir', air.tex[0]],
      ['uNoise', this.noise, gl.TEXTURE_3D],
      ['uLight', this.light, gl.TEXTURE_3D],
    ]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if (opts.dynamic) {
      p = this.programs.sprite.use();
      this.setView(p);
      bindTextures(gl, p, [
        ['uDay', bake.tex[0]],
        ['uAlbedo', bake.tex[1]],
      ]);
      gl.uniform1f(p.u('uTime'), time);
      gl.uniform4fv(p.u('uFlicker'), STEADY);
      gl.uniform3fv(p.u('uAccent'), this.colours.accent);
      gl.uniform3fv(p.u('uCenser'), censerPosition(time));
      gl.uniform1f(p.u('uEmber'), ember(time));
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.bindVertexArray(this.spriteVao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.spriteCount);
      gl.disable(gl.BLEND);
      gl.bindVertexArray(this.vao);
    }

    p = this.programs.bloom.use();
    let src = hdr;
    gl.uniform1i(p.u('uMode'), 0);
    this.bloom.forEach((dst, i) => {
      gl.uniform1i(p.u('uFirst'), i === 0 ? 1 : 0);
      this.bloomPass(p, src, dst);
      src = dst;
    });
    gl.uniform1i(p.u('uMode'), 1);
    gl.uniform1i(p.u('uFirst'), 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    for (let i = this.bloom.length - 1; i > 0; i--) this.bloomPass(p, this.bloom[i], this.bloom[i - 1]);
    gl.disable(gl.BLEND);

    p = this.programs.final.use();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.w, this.h);
    bindTextures(gl, p, [
      ['uHdr', hdr.tex[0]],
      ['uBloom', this.bloom[0].tex[0]],
    ]);
    gl.uniform2f(p.u('uOut'), this.w, this.h);
    gl.uniform1f(p.u('uTime'), time);
    gl.uniform1f(p.u('uGrain'), opts.grain ? 1 : 0);
    gl.uniform3fv(p.u('uBg'), this.colours.bg);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /**
   * The two maps for the live overlay, from the last render. Render the clean
   * image first, so the shares are of the light without the censer or flames.
   */
  readMaps(): { a: Uint8Array; b: Uint8Array; w: number; h: number } {
    const gl = this.gl;
    const bake = this.bake!;
    const maps = this.maps!;
    const p = this.programs.maps.use();
    gl.bindFramebuffer(gl.FRAMEBUFFER, maps.fb);
    gl.viewport(0, 0, maps.w, maps.h);
    gl.uniform3fv(p.u('uAccent'), this.colours.accent);
    bindTextures(gl, p, [
      ['uDay', bake.tex[0]],
      ['uAlbedo', bake.tex[1]],
      ['uCandleD', bake.tex[2]],
      ['uCandleS', bake.tex[3]],
      ['uAir', this.air!.tex[0]],
      ['uHdr', this.hdr!.tex[0]],
    ]);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const read = (i: number) => {
      const out = new Uint8Array(maps.w * maps.h * 4);
      gl.readBuffer(gl.COLOR_ATTACHMENT0 + i);
      gl.readPixels(0, 0, maps.w, maps.h, gl.RGBA, gl.UNSIGNED_BYTE, out);
      return out;
    };
    return { a: read(0), b: read(1), w: maps.w, h: maps.h };
  }

  private bloomPass(p: Program, src: Target, dst: Target): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
    gl.viewport(0, 0, dst.w, dst.h);
    bindTextures(gl, p, [['uSrc', src.tex[0]]]);
    gl.uniform2f(p.u('uTexel'), 1 / src.w, 1 / src.h);
    gl.uniform2f(p.u('uDst'), dst.w, dst.h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private setView(p: Program): void {
    setView(this.gl, p, this.w, this.h, this.w / this.h);
  }

  private setMotion(p: Program, time: number): void {
    const gl = this.gl;
    gl.uniform1f(p.u('uTime'), time);
    gl.uniform4fv(p.u('uFlicker'), STEADY);
    gl.uniform1f(p.u('uEmber'), ember(time));
    gl.uniform3fv(p.u('uAccent'), this.colours.accent);
  }
}

function halton(i: number, base: number): number {
  let f = 1;
  let r = 0;
  let n = i;
  while (n > 0) {
    f /= base;
    r += f * (n % base);
    n = Math.floor(n / base);
  }
  return r;
}
