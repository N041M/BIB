import { bindTextures, createTarget, deleteTarget, Program, type Target } from './gl';
import { BACKDROP_DIR, posterHeight, type Poster } from './posters';
import { censerPosition, ember, flicker, sceneGLSL } from './scene';
import { bakeVolume, createNoise, createSprites, createTexture3D, HEADER, setView, SPRITE_ATTRIBUTES, VOLUME } from './shared';
import censerGlsl from './shaders/censer.glsl?raw';
import commonGlsl from './shaders/common.glsl?raw';
import finishFrag from './shaders/finish.frag?raw';
import gradeGlsl from './shaders/grade.glsl?raw';
import liveFrag from './shaders/live.frag?raw';
import motionGlsl from './shaders/motion.glsl?raw';
import quadVert from './shaders/quad.vert?raw';
import smokeGlsl from './shaders/smoke.glsl?raw';
import spriteFrag from './shaders/sprite.frag?raw';
import spriteVert from './shaders/sprite.vert?raw';
import volumeFrag from './shaders/volume.frag?raw';

type ProgramName = 'volume' | 'live' | 'sprite' | 'finish';
const ORDER: ProgramName[] = ['volume', 'live', 'sprite', 'finish'];

export interface Colours {
  accent: [number, number, number];
  bg: [number, number, number];
}

/**
 * The overlay that animates the backdrop image: candle flicker, flames, the
 * swinging censer, its smoke and dust. It starts from the clean copy of the
 * image the page shows and never renders the hall itself, so it is cheap to
 * compile and to run.
 *
 * Each frame ends with a fence, and the caller checks `idle()` before asking
 * for the next one, so frames never pile up on a slow GPU.
 */
export class LiveRenderer {
  readonly gl: WebGL2RenderingContext;
  private parallel: boolean;
  private sources: Record<ProgramName, [string, string, string[]?]>;
  private programs: Partial<Record<ProgramName, Program>> = {};
  private started = 0;
  private linked = 0;
  private vao: WebGLVertexArrayObject;
  private spriteVao: WebGLVertexArrayObject;
  private spriteCount: number;
  private noise: WebGLTexture;
  private light: WebGLTexture;
  private images: WebGLTexture[];
  private target: Target;
  private frame = 0;
  private fence: WebGLSync | null = null;

  private constructor(
    private canvas: HTMLCanvasElement,
    private colours: Colours,
    gl: WebGL2RenderingContext,
    base: HTMLImageElement,
    shares: HTMLImageElement,
    depth: HTMLImageElement,
  ) {
    this.gl = gl;
    this.parallel = !!gl.getExtension('KHR_parallel_shader_compile');
    canvas.width = base.naturalWidth;
    canvas.height = base.naturalHeight;

    const scene = sceneGLSL();
    const withScene = (...parts: string[]) => [HEADER, scene, commonGlsl, ...parts].join('\n');
    const vert = HEADER + quadVert;
    this.sources = {
      volume: [vert, withScene(volumeFrag)],
      live: [vert, withScene(motionGlsl, gradeGlsl, censerGlsl, smokeGlsl, liveFrag)],
      sprite: [withScene(spriteVert), withScene('#define LIVE', spriteFrag), SPRITE_ATTRIBUTES],
      finish: [vert, HEADER + gradeGlsl + finishFrag],
    };

    this.vao = gl.createVertexArray()!;
    this.noise = createNoise(gl);
    this.light = createTexture3D(gl, VOLUME, gl.RGBA8, gl.RGBA, null);
    this.images = [base, shares, depth].map((img) => upload(gl, img));
    this.target = createTarget(gl, canvas.width, canvas.height, 1, false);
    [this.spriteVao, this.spriteCount] = createSprites(gl);
  }

  /**
   * Fetch the clean image and the maps for `poster` at `width`, and set up a
   * renderer for them. Throws when WebGL2 or half-float targets are missing.
   */
  static async create(canvas: HTMLCanvasElement, poster: Poster, width: number, colours: Colours): Promise<LiveRenderer> {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      powerPreference: 'low-power',
    });
    if (!gl) throw new Error('WebGL2 is not available');
    if (!gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('EXT_color_buffer_half_float')) {
      throw new Error('half-float render targets are not available');
    }
    const base = width === poster.widths[0] ? `${poster.name}-base.webp` : `${poster.name}-base-${width}.webp`;
    const [img, shares, depth] = await Promise.all([base, `${poster.name}-shares.png`, `${poster.name}-depth.png`].map((f) => loadImage(BACKDROP_DIR + f)));
    if (img.naturalHeight !== posterHeight(poster, width)) throw new Error(`unexpected size for ${base}`);
    return new LiveRenderer(canvas, colours, gl, img, shares, depth);
  }

  /** Move compiling along. With parallel compiling everything starts at once, otherwise one shader per call. */
  prepare(): void {
    const gl = this.gl;
    while (this.linked < this.started && this.programs[ORDER[this.linked]]!.ready(this.parallel)) {
      this.linked++;
      if (ORDER[this.linked - 1] === 'volume') bakeVolume(gl, this.program('volume'), this.light, this.vao);
    }
    const limit = this.parallel ? ORDER.length : this.linked + 1;
    for (; this.started < limit; this.started++) {
      const name = ORDER[this.started];
      const [vs, fs, attributes] = this.sources[name];
      this.programs[name] = new Program(gl, name, vs, fs, attributes);
    }
  }

  get ready(): boolean {
    return this.linked === ORDER.length;
  }

  /** True when the GPU has finished the last frame. */
  idle(): boolean {
    const gl = this.gl;
    if (!this.fence) return true;
    if (gl.getSyncParameter(this.fence, gl.SYNC_STATUS) !== gl.SIGNALED) return false;
    gl.deleteSync(this.fence);
    this.fence = null;
    return true;
  }

  /** Draw the scene at `time` seconds. */
  render(time: number): void {
    const gl = this.gl;
    const { w, h } = this.target;
    const [base, shares, depth] = this.images;
    const flick: [number, number, number, number] = [flicker(time, 0), flicker(time, 1), flicker(time, 2), flicker(time, 3)];
    gl.bindVertexArray(this.vao);

    let p = this.program('live').use();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.target.fb);
    gl.viewport(0, 0, w, h);
    setView(gl, p, w, h, w / h);
    gl.uniform1f(p.u('uTime'), time);
    gl.uniform4fv(p.u('uFlicker'), flick);
    gl.uniform1f(p.u('uEmber'), ember(time));
    gl.uniform3fv(p.u('uAccent'), this.colours.accent);
    gl.uniform3fv(p.u('uBg'), this.colours.bg);
    gl.uniform1i(p.u('uFrame'), this.frame++);
    bindTextures(gl, p, [
      ['uBase', base],
      ['uShares', shares],
      ['uDepth', depth],
      ['uNoise', this.noise, gl.TEXTURE_3D],
      ['uLight', this.light, gl.TEXTURE_3D],
    ]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    p = this.program('sprite').use();
    setView(gl, p, w, h, w / h);
    bindTextures(gl, p, [['uDepth', depth]]);
    gl.uniform1f(p.u('uTime'), time);
    gl.uniform4fv(p.u('uFlicker'), flick);
    gl.uniform3fv(p.u('uAccent'), this.colours.accent);
    gl.uniform3fv(p.u('uCenser'), censerPosition(time));
    gl.uniform1f(p.u('uEmber'), ember(time));
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.bindVertexArray(this.spriteVao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.spriteCount);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(this.vao);

    p = this.program('finish').use();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    bindTextures(gl, p, [['uLight', this.target.tex[0]]]);
    gl.uniform1f(p.u('uTime'), time);
    gl.uniform3fv(p.u('uBg'), this.colours.bg);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if (this.fence) gl.deleteSync(this.fence);
    this.fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
  }

  dispose(): void {
    const gl = this.gl;
    for (const p of Object.values(this.programs)) p?.dispose();
    for (const t of [this.noise, this.light, ...this.images]) gl.deleteTexture(t);
    deleteTarget(gl, this.target);
    if (this.fence) gl.deleteSync(this.fence);
    this.fence = null;
  }

  private program(name: ProgramName): Program {
    return this.programs[name]!;
  }
}

/** Waits for the load event rather than decode(), which Chrome holds back while the tab is hidden. */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${url}`));
    img.src = url;
  });
}

/** Upload an image unchanged: no colour conversion, bottom row first to match gl_FragCoord. */
function upload(gl: WebGL2RenderingContext, img: HTMLImageElement): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}
