import * as THREE from 'three';

/** Palette for the cogitator screen, in sRGB hex. */
export const PHOSPHOR = {
  dark: new THREE.Color('#06140b'),
  lit: new THREE.Color('#8fd14f'),
  rim: new THREE.Color('#d4ff7a'),
  hot: new THREE.Color('#f2ffd0'),
  line: new THREE.Color('#9be35a'),
  lineDim: new THREE.Color('#3f6b28'),
};

const vertexShader = /* glsl */ `
  uniform float uMinY;
  uniform float uMaxY;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  varying float vH;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewPos = mv.xyz;
    vNormalV = normalize(normalMatrix * normal);
    vH = (position.y - uMinY) / max(uMaxY - uMinY, 1e-4);
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uDark;
  uniform vec3 uLit;
  uniform vec3 uRim;
  uniform vec3 uHot;
  uniform float uTime;
  uniform float uReveal;
  uniform float uHover;
  uniform float uIntensity;
  uniform float uXray;
  uniform float uScan;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  varying float vH;

  void main() {
    if (vH > uReveal) discard;

    vec3 n = normalize(vNormalV);
    if (!gl_FrontFacing) n = -n;
    vec3 v = normalize(-vViewPos);

    vec3 keyDir = normalize(vec3(0.45, 0.75, 0.55));
    vec3 fillDir = normalize(vec3(-0.75, 0.15, 0.35));
    float key = max(dot(n, keyDir), 0.0);
    float fill = max(dot(n, fillDir), 0.0);
    float shade = key * 0.88 + fill * 0.22 + 0.07;
    // light posterisation: the phosphor bands a little, like an old tube
    shade = mix(shade, floor(shade * 5.0 + 0.5) / 5.0, 0.35);

    float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 2.6);
    vec3 col = mix(uDark, uLit, clamp(shade, 0.0, 1.15));
    col += uRim * fres * (0.45 + 0.55 * uHover);

    float scan = 1.0 - uScan * (0.5 + 0.5 * sin(gl_FragCoord.y * 1.35 - uTime * 5.0));
    col *= scan;

    float alpha = 1.0;
    if (uXray > 0.5) {
      float body = 0.05 + fres * 1.1;
      col = uRim * body * scan;
      alpha = clamp(body, 0.0, 1.0);
    }

    // bright build line while the pattern materialises
    float edge = (1.0 - smoothstep(0.0, 0.03, uReveal - vH)) * (1.0 - step(0.9999, uReveal));
    col = mix(col, uHot, edge);
    alpha = max(alpha, edge);

    gl_FragColor = vec4(col * uIntensity, alpha);
    #include <colorspace_fragment>
  }
`;

export interface PhosphorOptions {
  xray?: boolean;
  minY?: number;
  maxY?: number;
}

export type PhosphorMaterial = THREE.ShaderMaterial & {
  uniforms: {
    uDark: { value: THREE.Color };
    uLit: { value: THREE.Color };
    uRim: { value: THREE.Color };
    uHot: { value: THREE.Color };
    uTime: { value: number };
    uReveal: { value: number };
    uHover: { value: number };
    uIntensity: { value: number };
    uXray: { value: number };
    uScan: { value: number };
    uMinY: { value: number };
    uMaxY: { value: number };
  };
};

export function createPhosphorMaterial(opts: PhosphorOptions = {}): PhosphorMaterial {
  const xray = !!opts.xray;
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: xray,
    depthWrite: !xray,
    blending: xray ? THREE.AdditiveBlending : THREE.NormalBlending,
    side: xray ? THREE.DoubleSide : THREE.FrontSide,
    uniforms: {
      uDark: { value: PHOSPHOR.dark.clone() },
      uLit: { value: PHOSPHOR.lit.clone() },
      uRim: { value: PHOSPHOR.rim.clone() },
      uHot: { value: PHOSPHOR.hot.clone() },
      uTime: { value: 0 },
      uReveal: { value: 1 },
      uHover: { value: 0 },
      uIntensity: { value: 1 },
      uXray: { value: xray ? 1 : 0 },
      uScan: { value: 0.1 },
      uMinY: { value: opts.minY ?? 0 },
      uMaxY: { value: opts.maxY ?? 1 },
    },
  }) as PhosphorMaterial;
}
