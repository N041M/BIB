import * as THREE from 'three';
import { NOISE } from './glsl';

/**
 * Surface detail for a standard material, worked out per pixel in GLSL.
 *
 * `body` runs in the fragment shader with `p` (the object-space position, in
 * CSS pixels) and `n` (the object-space normal). It may set:
 *   prAlbedo  multiplies the material colour
 *   prRough   roughness, starting from the material's
 *   prMetal   metalness, starting from the material's
 *   prHeight  a height in pixels, turned into a bump
 *   prEmit    added to the emissive light
 * `head` is GLSL placed before main(), for uniforms and helpers.
 */
export interface Detail {
  name: string;
  body: string;
  head?: string;
  uniforms?: Record<string, THREE.IUniform>;
}

let programs = 0;

export function detailed<T extends THREE.MeshStandardMaterial>(mat: T, d: Detail): T {
  const key = `press-${d.name}-${programs++}`;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, d.uniforms ?? {});
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPrObj;\nvarying vec3 vPrNrm;')
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
        vPrObj = transformed;
        vPrNrm = objectNormal;
        #ifdef USE_INSTANCING
          vPrObj = (instanceMatrix * vec4(transformed, 1.0)).xyz;
          vPrNrm = mat3(instanceMatrix) * objectNormal;
        #endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vPrObj;\nvarying vec3 vPrNrm;\n${NOISE}\n${d.head ?? ''}`)
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        vec3 prAlbedo = vec3(1.0);
        float prRough = roughness;
        float prMetal = metalness;
        float prHeight = 0.0;
        vec3 prEmit = vec3(0.0);
        {
          vec3 p = vPrObj;
          vec3 n = normalize(vPrNrm);
          ${d.body}
        }
        diffuseColor.rgb *= prAlbedo;`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(prRough, 0.04, 1.0);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = clamp(prMetal, 0.0, 1.0);')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = prBump(-vViewPosition, normal, prHeight);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += prEmit;');
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

/* ───────────── the metals ───────────── */

/**
 * Cast brass, old and handled. Tarnish gathers in broad patches and in the
 * hollows, faces turned up carry dust, and the high spots are rubbed bright.
 * `wear` is how polished it is: 1 for knobs and rims, 0 for the recesses.
 */
export function brass(wear: number): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.34 });
  return detailed(mat, {
    name: `brass${wear}`,
    uniforms: { uWear: { value: wear } },
    head: 'uniform float uWear;',
    body: /* glsl */ `
      float broad = prFbm(p * 0.018);
      float mid = prFbm(p * 0.07 + 5.0);
      float fine = prNoise(p * 0.3);
      float pits = smoothstep(0.8, 0.94, prNoise(p * 0.2 + 31.0));
      // tarnish: broad blotches, more of it away from the rubbed surfaces
      float tarnish = smoothstep(0.3, 0.8, broad * 0.75 + mid * 0.45 - uWear * 0.3);
      // fine scratches run along x, the way the parts were wiped
      float scratch = smoothstep(0.62, 1.0, prNoise(p * vec3(0.02, 0.45, 0.45) + 9.0));
      vec3 bright = vec3(0.74, 0.52, 0.24);
      vec3 aged = vec3(0.38, 0.25, 0.10);
      vec3 dark = vec3(0.14, 0.09, 0.04);
      vec3 col = mix(bright, aged, tarnish);
      col = mix(col, dark, pits * 0.5 + smoothstep(0.6, 0.9, mid) * 0.25 * (1.0 - uWear));
      // dust settles on faces turned up
      float dust = smoothstep(0.35, 0.95, n.y) * (0.5 + 0.5 * prNoise(p * 0.2)) * (1.0 - uWear * 0.7);
      // verdigris in a few deep spots
      float verd = smoothstep(0.74, 0.86, prFbm(p * 0.05 + 77.0)) * (1.0 - uWear);
      prAlbedo = mix(col, vec3(0.13, 0.11, 0.08), dust * 0.55);
      prAlbedo = mix(prAlbedo, vec3(0.10, 0.17, 0.12), verd * 0.8);
      prMetal = 1.0 - max(dust * 0.55, verd * 0.9);
      prRough = mix(0.3, 0.56, tarnish) + scratch * 0.06 + dust * 0.3 + verd * 0.35 + (fine - 0.5) * 0.06 - uWear * 0.05;
      prHeight = (mid - 0.5) * 0.8 + (fine - 0.5) * 0.12 - pits * 0.3 - scratch * 0.06;
    `,
  });
}

/** Blackened iron: axles, brackets, nuts. Darker and rougher, with rust in places. */
export function iron(): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.5 });
  return detailed(mat, {
    name: 'iron',
    body: /* glsl */ `
      float broad = prFbm(p * 0.03);
      float fine = prNoise(p * 1.1);
      float rust = smoothstep(0.58, 0.82, prFbm(p * 0.08 + 11.0));
      vec3 metal = mix(vec3(0.20, 0.19, 0.18), vec3(0.09, 0.085, 0.08), broad);
      prAlbedo = mix(metal, vec3(0.22, 0.09, 0.03), rust);
      prMetal = 1.0 - rust * 0.85;
      prRough = 0.42 + broad * 0.2 + rust * 0.4 + (fine - 0.5) * 0.1;
      prHeight = (broad - 0.5) * 0.6 + (fine - 0.5) * 0.3 + rust * 0.35;
    `,
  });
}

/* ───────────── wax ───────────── */

/** Tallow candle wax: off-white, soft, and glowing a little near the flame. */
export function candleWax(flameY: number): THREE.MeshPhysicalMaterial {
  const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0, sheen: 0.4, sheenRoughness: 0.6, sheenColor: new THREE.Color(1, 0.8, 0.55) });
  const uniforms = { uFlameY: { value: flameY }, uGlow: { value: 1 } };
  mat.userData.uniforms = uniforms;
  return detailed(mat, {
    name: 'candle',
    uniforms,
    head: 'uniform float uFlameY; uniform float uGlow;',
    body: /* glsl */ `
      float m = prFbm(p * 0.12);
      // old tallow: ivory, yellowing and dirtier toward the foot
      float foot = smoothstep(uFlameY * 0.7, 0.0, p.y);
      prAlbedo = mix(vec3(0.56, 0.45, 0.29), vec3(0.40, 0.30, 0.17), m * 0.6 + foot * 0.4);
      prRough = 0.5 + m * 0.2;
      prHeight = (prFbm(p * 0.3) - 0.5) * 0.9;
      // light scattered inside the wax: the top of the candle glows from the flame
      float d = max(0.0, uFlameY - p.y);
      prEmit = vec3(1.0, 0.42, 0.1) * (exp(-d * 0.07) * 0.9 + exp(-d * 0.02) * 0.08) * uGlow;
    `,
  });
}

/** Sealing wax: deep red, a little glossy, darker where it is thick. */
export function sealWax(): THREE.MeshPhysicalMaterial {
  const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.38, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.45 });
  return detailed(mat, {
    name: 'seal',
    body: /* glsl */ `
      float m = prFbm(p * 0.15);
      prAlbedo = mix(vec3(0.36, 0.035, 0.03), vec3(0.18, 0.015, 0.015), m);
      prRough = 0.3 + m * 0.25;
      prHeight = (prFbm(p * 0.6) - 0.5) * 0.5;
    `,
  });
}

/* ───────────── glass behind the print head's windows ───────────── */

/** The windows in the print head glow red from inside, in the archive's phosphor colour. */
export function headGlass(colour: THREE.Color): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.25, metalness: 0, emissive: colour, emissiveIntensity: 1 });
  return detailed(mat, {
    name: 'glass',
    body: /* glsl */ `
      // the light behind the glass is uneven, brightest low in the middle of the head
      float f = prNoise(p * 0.08);
      prEmit = emissive * (f * 0.5 - 0.15);
    `,
  });
}
