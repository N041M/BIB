import * as THREE from 'three';
import { NOISE } from './glsl';
import { detailed } from './materials';

/**
 * The parchment: one texture of it baked on the GPU when the press is built,
 * the flat sheet between the rolls, and the outer turn of paper on each roll.
 *
 * The texture is as wide as the sheet and repeats along its length every
 * PERIOD pixels. Its alpha is the torn edge.
 */
const PERIOD = 1024;

const BAKE_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const BAKE_HEAD = /* glsl */ `
varying vec2 vUv;
uniform vec2 uSize;
`;

export interface Parchment {
  texture: THREE.Texture;
  /** Width in CSS pixels. */
  width: number;
  dispose(): void;
}

/** Bake the parchment for a sheet `width` pixels wide, at `density` texels per pixel. */
export function bakeParchment(renderer: THREE.WebGLRenderer, width: number, density: number): Parchment {
  const tw = Math.min(4096, Math.ceil(width * density));
  const th = Math.min(4096, Math.ceil(PERIOD * density));
  const target = new THREE.WebGLRenderTarget(tw, th, {
    type: THREE.UnsignedByteType,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.RepeatWrapping,
    generateMipmaps: true,
    depthBuffer: false,
  });
  target.texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

  const material = new THREE.ShaderMaterial({
    vertexShader: BAKE_VERT,
    fragmentShader: BAKE_HEAD + NOISE + PARCHMENT,
    uniforms: { uSize: { value: new THREE.Vector2(width, PERIOD) } },
    depthTest: false,
    depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  const scene = new THREE.Scene();
  scene.add(quad);
  const camera = new THREE.Camera();

  const before = renderer.getRenderTarget();
  const tone = renderer.toneMapping;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setRenderTarget(target);
  renderer.render(scene, camera);
  renderer.setRenderTarget(before);
  renderer.toneMapping = tone;

  quad.geometry.dispose();
  material.dispose();
  return { texture: target.texture, width, dispose: () => target.dispose() };
}

/*
 * Sizes are chosen so every layer repeats exactly over PERIOD pixels:
 * 256, 64, 16 and 4 pixel cells all divide 1024.
 */
const PARCHMENT = /* glsl */ `
float tear(float v, float seed) {
  // ragged at two scales: long bites and short fibres
  return 2.5 + 8.0 * prFbmT(vec2(v / 64.0, seed), vec2(${PERIOD / 64}.0, 1000.0), seed) + 3.0 * prNoiseT(vec2(v / 4.0, seed), vec2(${PERIOD / 4}.0, 1000.0), seed + 3.0);
}

void main() {
  vec2 px = vUv * uSize;
  float v = px.y;
  vec2 big = vec2(1000.0, ${PERIOD / 256}.0);

  float stain = prFbmT(px / 256.0, big, 1.0);
  float blot = prFbmT(px / 64.0, big * 4.0, 2.0);
  float grain = prNoiseT(px / 4.0, big * 64.0, 3.0);
  // fibres run along the sheet
  float fibre = prNoiseT(vec2(px.x / 1.5, px.y / 16.0), vec2(4000.0, ${PERIOD / 16}.0), 4.0);
  fibre = smoothstep(0.55, 0.95, fibre);
  // tide lines from old damp: thin dark rings where a slow noise crosses a level
  float tide = prFbmT(px / 256.0, big, 5.0);
  float ring = smoothstep(0.035, 0.0, abs(tide - 0.58)) * smoothstep(0.4, 0.7, stain);
  // foxing: small rust-brown spots
  float fox = smoothstep(0.86, 0.95, prNoiseT(px / 16.0, big * 16.0, 6.0)) * smoothstep(0.45, 0.8, prNoiseT(px / 64.0, big * 4.0, 7.0));

  // the torn edges: how far this texel is from the nearer one
  float dl = px.x - tear(v, 11.0);
  float dr = uSize.x - px.x - tear(v, 23.0);
  float d = min(dl, dr);
  // the sheet aged most toward its edges; the middle, where the type runs, stayed paler and cleaner
  float worn = 1.0 - smoothstep(18.0, uSize.x * 0.2, d);

  vec3 light = vec3(0.71, 0.59, 0.39);
  vec3 base = vec3(0.58, 0.45, 0.27);
  vec3 dark = vec3(0.30, 0.19, 0.085);
  vec3 col = mix(light, base, smoothstep(0.3, 0.75, stain) * mix(0.55, 1.0, worn));
  col = mix(col, dark, smoothstep(0.62, 0.9, blot * 0.6 + stain * 0.5) * mix(0.25, 0.55, worn));
  col *= 0.95 + 0.07 * grain;
  col = mix(col, col * vec3(0.9, 0.85, 0.78), fibre * 0.3);
  col = mix(col, dark * 0.9, ring * mix(0.25, 0.5, worn));
  col = mix(col, vec3(0.30, 0.13, 0.05), fox * mix(0.25, 0.7, worn));

  float brown = exp(-max(d, 0.0) / 16.0);
  col = mix(col, vec3(0.30, 0.17, 0.07), brown * 0.65);
  col = mix(col, vec3(0.10, 0.05, 0.02), exp(-max(d, 0.0) / 2.2) * 0.7);
  float cover = smoothstep(-0.6, 0.6, d);

  gl_FragColor = vec4(col, cover);
}
`;

/** Where the sheet is, so the paper's shader can find the type and the parchment for each pixel. */
export interface PaperUniforms {
  uParch: THREE.IUniform<THREE.Texture | null>;
  /** The parchment texture's size in CSS pixels: the sheet's width and PERIOD. */
  uParchSize: THREE.IUniform<THREE.Vector2>;
  uInk: THREE.IUniform<THREE.Texture | null>;
  /** The rectangle the ink canvas covers on screen: left, top, width, height. */
  uInkRect: THREE.IUniform<THREE.Vector4>;
  /** Half the viewport's size, to turn world positions into screen pixels. */
  uHalf: THREE.IUniform<THREE.Vector2>;
  /** Left edge of the sheet on screen. */
  uLeft: THREE.IUniform<number>;
  /** How far the paper has moved, in pixels. The parchment moves with it. */
  uScroll: THREE.IUniform<number>;
}

export function paperUniforms(): PaperUniforms {
  return {
    uParch: { value: null },
    uParchSize: { value: new THREE.Vector2(1, PERIOD) },
    uInk: { value: null },
    uInkRect: { value: new THREE.Vector4(0, 0, 1, 1) },
    uHalf: { value: new THREE.Vector2(1, 1) },
    uLeft: { value: 0 },
    uScroll: { value: 0 },
  };
}

const PAPER_HEAD = /* glsl */ `
uniform sampler2D uParch;
uniform vec2 uParchSize;
uniform sampler2D uInk;
uniform vec4 uInkRect;
uniform vec2 uHalf;
uniform float uLeft;
uniform float uScroll;
`;

/**
 * The flat sheet. It lies in the plane z = 0, which the camera maps exactly
 * onto the screen, so a pixel's world position is also its place on screen.
 * The type comes from a canvas drawn in screen pixels, so it lines up with
 * the page's own (invisible) text.
 */
export function sheetMaterial(u: PaperUniforms): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.86, metalness: 0 });
  return detailed(mat, {
    name: 'sheet',
    uniforms: u as unknown as Record<string, THREE.IUniform>,
    head: PAPER_HEAD,
    body: /* glsl */ `
      vec2 s = vec2(p.x + uHalf.x, uHalf.y - p.y);
      vec2 tuv = vec2((s.x - uLeft) / uParchSize.x, (s.y + uScroll) / uParchSize.y);
      vec4 parch = texture2D(uParch, tuv);
      if (parch.a < 0.5) discard;
      vec2 iuv = (s - uInkRect.xy) / uInkRect.zw;
      vec4 ink = texture2D(uInk, vec2(iuv.x, 1.0 - iuv.y));
      // the ribbon leaves uneven ink: thin patches and dry spots that stay with the paper
      vec3 q = vec3(s.x, s.y + uScroll, 0.0);
      float mottle = prNoise(q * 0.12) * 0.6 + prNoise(q * 0.4 + 7.0) * 0.4;
      // dark ink takes the ribbon's unevenness; the pale tones of a printed photo hardly do
      float dark = 1.0 - smoothstep(0.05, 0.4, dot(ink.rgb, vec3(0.3, 0.55, 0.15)));
      float a = ink.a * mix(1.0, clamp(0.8 + mottle * 0.32, 0.0, 1.0), dark);
      prAlbedo = parch.rgb * mix(vec3(1.0), ink.rgb, a);
      prRough = mix(0.88, 0.6, a);
      float lum = dot(parch.rgb, vec3(0.3, 0.5, 0.2));
      // fibres stand up a little, each struck letter is pressed into the sheet,
      // and the whole sheet cockles in broad, shallow waves
      float cockle = (prNoise(q * vec3(0.006, 0.009, 0.0)) - 0.5) * 16.0 + (prNoise(q * 0.022 + 3.0) - 0.5) * 3.5;
      prHeight = (lum - 0.45) * 0.9 - a * 0.3 + cockle;
    `,
  });
}

/**
 * The outer turn of paper on a roll: the back of the sheet, wound round.
 * The paper runs up the backs of both rolls, so both turn the same way, and
 * their fronts move down as the paper feeds up. The parchment turns with the
 * roll, and its torn edges match the sheet's. The roll's axis is x, and
 * `uRadius` turns an angle into a length of paper.
 */
export function rollMaterial(u: PaperUniforms): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
  const uniforms = { ...u, uRadius: { value: 32 }, uRollX: { value: 0 } } as unknown as Record<string, THREE.IUniform>;
  mat.userData.uniforms = uniforms;
  return detailed(mat, {
    name: 'roll',
    uniforms,
    head: PAPER_HEAD + 'uniform float uRadius; uniform float uRollX;',
    body: /* glsl */ `
      // the angle grows from the top of the roll toward the viewer; the roll turns back by the paper's travel
      float ang = atan(p.z, p.y);
      float along = ang * uRadius - uScroll;
      vec2 tuv = vec2((p.x - uRollX) / uParchSize.x, along / uParchSize.y);
      vec4 parch = texture2D(uParch, tuv);
      if (parch.a < 0.5) discard;
      // the back of the sheet is a little darker, and the layers underneath show as faint bands
      float bands = prNoise(vec3(p.x * 0.02, ang * 3.0, 0.0));
      prAlbedo = parch.rgb * (0.82 + 0.1 * bands);
      float lum = dot(parch.rgb, vec3(0.3, 0.5, 0.2));
      prHeight = (lum - 0.45) * 1.0;
    `,
  });
}
