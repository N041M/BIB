import { bindTextures, createTarget, deleteTarget, Program, type Target } from './gl';
import { CANDLES, ember, flameCentre, flameHeight, flicker, frameView, Kind, OPTIC, sceneGLSL } from './scene';
import bakeFrag from './shaders/bake.frag?raw';
import bloomFrag from './shaders/bloom.frag?raw';
import commonGlsl from './shaders/common.glsl?raw';
import finalFrag from './shaders/final.frag?raw';
import frameFrag from './shaders/frame.frag?raw';
import hallGlsl from './shaders/hall.glsl?raw';
import quadVert from './shaders/quad.vert?raw';
import servitorGlsl from './shaders/servitor.glsl?raw';
import spriteFrag from './shaders/sprite.frag?raw';
import spriteVert from './shaders/sprite.vert?raw';

const HEADER = '#version 300 es\nprecision highp float;\nprecision highp int;\nprecision highp sampler3D;\n';
/** Samples per pixel the bake averages. The first pass is shown, the rest refine it. */
const BAKE_PASSES = 5;
const BLOOM_LEVELS = 6;
const NOISE_SIZE = 32;
const DUST_MOTES = 900;
const SPRITE_ATTRIBUTES = ['aCorner', 'aPos', 'aInfo'];

export interface Size {
  /** Internal resolution: the bake and the frame pass. */
  w: number;
  h: number;
  /** Canvas resolution: the final pass. */
  outW: number;
  outH: number;
}

/**
 * Draws the corridor into a canvas. The static scene is baked once, in
 * strips, then each frame relights it and adds what moves.
 */
export class Renderer {
  readonly gl: WebGL2RenderingContext;
  private parallel: boolean;
  private programs: Record<'bake' | 'frame' | 'sprite' | 'bloom' | 'final', Program>;
  private compiled = false;
  private vao: WebGLVertexArrayObject;
  private spriteVao: WebGLVertexArrayObject;
  private spriteCount: number;
  private noise: WebGLTexture;
  private size: Size = { w: 0, h: 0, outW: 0, outH: 0 };
  private bake?: Target;
  private hdr?: Target;
  private bloom: Target[] = [];
  private bakeRow = 0;
  private bakePass = 0;
  private frame = 0;
  private accent: [number, number, number];
  private bg: [number, number, number];

  constructor(
    private canvas: HTMLCanvasElement,
    colours: { accent: [number, number, number]; bg: [number, number, number] },
  ) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'default',
    });
    if (!gl) throw new Error('WebGL2 is not available');
    if (!gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('EXT_color_buffer_half_float')) {
      throw new Error('half-float render targets are not available');
    }
    this.gl = gl;
    this.parallel = !!gl.getExtension('KHR_parallel_shader_compile');
    this.accent = colours.accent;
    this.bg = colours.bg;

    const scene = sceneGLSL();
    const withScene = (...parts: string[]) => [HEADER, scene, commonGlsl, ...parts].join('\n');
    const vert = HEADER + quadVert;
    this.programs = {
      bake: new Program(gl, 'bake', vert, withScene(hallGlsl, servitorGlsl, bakeFrag)),
      frame: new Program(gl, 'frame', vert, withScene(frameFrag)),
      sprite: new Program(gl, 'sprite', withScene(spriteVert), withScene(spriteFrag), SPRITE_ATTRIBUTES),
      bloom: new Program(gl, 'bloom', vert, HEADER + bloomFrag),
      final: new Program(gl, 'final', vert, HEADER + finalFrag),
    };

    this.vao = gl.createVertexArray()!;
    this.noise = this.createNoise();
    [this.spriteVao, this.spriteCount] = this.createSprites();
  }

  /** True once every program has compiled. Never blocks when the driver compiles in parallel. */
  ready(): boolean {
    if (this.compiled) return true;
    for (const p of Object.values(this.programs)) if (!p.ready(this.parallel)) return false;
    this.compiled = true;
    return true;
  }

  /** True once the first bake pass has finished, so there is a picture to show. */
  get hasImage(): boolean {
    return this.bakePass > 0;
  }

  /** True while the bake still has passes to run. */
  get baking(): boolean {
    return this.bakePass < BAKE_PASSES;
  }

  /** Keep the passes baked so far and skip the rest, on a GPU too slow to spend time refining. */
  settle(): void {
    if (this.hasImage) this.bakePass = BAKE_PASSES;
  }

  /** Set the internal and canvas resolution. A new size starts the bake again. */
  resize(size: Size): void {
    const s = this.size;
    if (size.w === s.w && size.h === s.h && size.outW === s.outW && size.outH === s.outH) return;
    const gl = this.gl;
    const internalChanged = size.w !== s.w || size.h !== s.h;
    this.size = size;
    if (!internalChanged) return;
    if (this.bake) deleteTarget(gl, this.bake);
    if (this.hdr) deleteTarget(gl, this.hdr);
    for (const t of this.bloom) deleteTarget(gl, t);
    this.bake = createTarget(gl, size.w, size.h, 4, false);
    this.hdr = createTarget(gl, size.w, size.h, 1, true);
    this.bloom = [];
    let w = size.w;
    let h = size.h;
    for (let i = 0; i < BLOOM_LEVELS && w > 2 && h > 2; i++) {
      w = Math.max(1, w >> 1);
      h = Math.max(1, h >> 1);
      this.bloom.push(createTarget(gl, w, h, 1, true));
    }
    this.bakeRow = 0;
    this.bakePass = 0;
  }

  /** Bake up to `rows` rows of the current pass. */
  bakeStrip(rows: number): void {
    const gl = this.gl;
    const t = this.bake;
    if (!t || !this.baking) return;
    const n = Math.min(Math.max(1, Math.round(rows)), t.h - this.bakeRow);
    const p = this.programs.bake.use();
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
    gl.viewport(0, 0, t.w, t.h);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(0, this.bakeRow, t.w, n);
    if (this.bakePass > 0) {
      // running average of the passes so far
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.CONSTANT_ALPHA, gl.ONE_MINUS_CONSTANT_ALPHA);
      gl.blendColor(0, 0, 0, 1 / (this.bakePass + 1));
    }
    this.setView(p, t.w, t.h);
    gl.uniform2f(p.u('uJitter'), halton(this.bakePass, 2) - 0.5, halton(this.bakePass, 3) - 0.5);
    gl.uniform3fv(p.u('uAccent'), this.accent);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.BLEND);
    gl.disable(gl.SCISSOR_TEST);
    this.bakeRow += n;
    if (this.bakeRow >= t.h) {
      this.bakeRow = 0;
      this.bakePass++;
    }
  }

  /** Draw one frame at `time` seconds. */
  render(time: number): void {
    const gl = this.gl;
    const { bake, hdr } = this;
    if (!bake || !hdr || !this.hasImage) return;
    const { w, h, outW, outH } = this.size;
    if (this.canvas.width !== outW || this.canvas.height !== outH) {
      this.canvas.width = outW;
      this.canvas.height = outH;
    }
    const flick: [number, number, number, number] = [flicker(time, 0), flicker(time, 1), flicker(time, 2), flicker(time, 3)];
    gl.bindVertexArray(this.vao);

    // relight the bake, draw the censer, march the air
    let p = this.programs.frame.use();
    gl.bindFramebuffer(gl.FRAMEBUFFER, hdr.fb);
    gl.viewport(0, 0, w, h);
    this.setView(p, w, h);
    bindTextures(gl, p, [
      ['uDay', bake.tex[0]],
      ['uAlbedo', bake.tex[1]],
      ['uCandleD', bake.tex[2]],
      ['uCandleS', bake.tex[3]],
      ['uNoise', this.noise, gl.TEXTURE_3D],
    ]);
    gl.uniform1f(p.u('uTime'), time);
    gl.uniform1i(p.u('uFrame'), this.frame++);
    gl.uniform4fv(p.u('uFlicker'), flick);
    gl.uniform1f(p.u('uEmber'), ember(time));
    gl.uniform3fv(p.u('uAccent'), this.accent);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // flames and glows, added on top
    p = this.programs.sprite.use();
    this.setView(p, w, h);
    bindTextures(gl, p, [
      ['uDay', bake.tex[0]],
      ['uAlbedo', bake.tex[1]],
    ]);
    gl.uniform1f(p.u('uTime'), time);
    gl.uniform4fv(p.u('uFlicker'), flick);
    gl.uniform3fv(p.u('uAccent'), this.accent);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.bindVertexArray(this.spriteVao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.spriteCount);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(this.vao);

    // bloom: down the chain, then back up adding each level onto the next
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

    // tone, grade and grain into the canvas
    p = this.programs.final.use();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, outW, outH);
    bindTextures(gl, p, [
      ['uHdr', hdr.tex[0]],
      ['uBloom', this.bloom[0]?.tex[0] ?? hdr.tex[0]],
    ]);
    gl.uniform2f(p.u('uOut'), outW, outH);
    gl.uniform1f(p.u('uTime'), time);
    gl.uniform3fv(p.u('uBg'), this.bg);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  dispose(): void {
    const gl = this.gl;
    for (const p of Object.values(this.programs)) p.dispose();
    if (this.bake) deleteTarget(gl, this.bake);
    if (this.hdr) deleteTarget(gl, this.hdr);
    for (const t of this.bloom) deleteTarget(gl, t);
    gl.deleteTexture(this.noise);
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

  private setView(p: Program, w: number, h: number): void {
    const gl = this.gl;
    const view = frameView(this.size.outW / this.size.outH);
    gl.uniform2f(p.u('uRes'), w, h);
    gl.uniform3fv(p.u('uCamPos'), view.pos);
    gl.uniformMatrix3fv(p.u('uCamBasis'), false, view.basis);
    gl.uniform4fv(p.u('uLens'), view.lens);
    gl.uniform1i(p.u('uZero'), 0);
  }

  /** Smooth value noise is built in the shader from this 32³ grid of random values. */
  private createNoise(): WebGLTexture {
    const gl = this.gl;
    const data = new Uint8Array(NOISE_SIZE ** 3);
    let s = 0x2545f491;
    for (let i = 0; i < data.length; i++) {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      data[i] = s & 255;
    }
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_3D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.R8, NOISE_SIZE, NOISE_SIZE, NOISE_SIZE, 0, gl.RED, gl.UNSIGNED_BYTE, data);
    for (const wrap of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, wrap, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return tex;
  }

  /** One instance per flame, one per reflection of a flame, the servitor's optic and the dust. */
  private createSprites(): [WebGLVertexArrayObject, number] {
    const gl = this.gl;
    const data: number[] = [];
    const lit = CANDLES.filter((c) => c.lit);
    for (const kind of [0, 1]) {
      lit.forEach((c, i) => {
        const f = flameCentre(c);
        const bright = c.kind === Kind.Cup ? 0.55 : 1;
        data.push(f[0], f[1], f[2], flameHeight(c), c.group, ((i * 0.618034) % 1) + 0.01, kind, bright);
      });
    }
    data.push(OPTIC[0], OPTIC[1], OPTIC[2], 0.012, 0, 0.3, 2, 1);
    let s = 0x9e3779b9;
    const rand = () => {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return (s >>> 0) / 4294967296;
    };
    for (let i = 0; i < DUST_MOTES; i++) {
      data.push(rand() * 5.6 - 2.8, rand() * 6.5, -0.8 - rand() * 11, 0.004, 0, rand(), 3, 1);
    }
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    for (const loc of [1, 2]) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 32, (loc - 1) * 16);
      gl.vertexAttribDivisor(loc, 1);
    }
    gl.bindVertexArray(null);
    return [vao, data.length / 8];
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
