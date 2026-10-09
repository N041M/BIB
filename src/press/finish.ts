/**
 * The lens and film over the finished picture, after tone mapping: a little
 * colour fringing toward the corners, a vignette, and moving grain like the
 * archive screen's.
 */
export const FinishShader = {
  name: 'PressFinish',
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAspect: { value: 1 },
    /* device pixels per CSS pixel, so the grain stays the same size on every screen */
    uScale: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uAspect;
    uniform float uScale;
    varying vec2 vUv;

    float hash(vec2 p) {
      vec3 q = fract(vec3(p.xyx) * 0.1031);
      q += dot(q, q.yzx + 33.33);
      return fract((q.x + q.y) * q.z);
    }

    void main() {
      vec2 c = vUv - 0.5;
      vec2 a = c * vec2(uAspect, 1.0);
      float r2 = dot(a, a);
      vec2 shift = c * r2 * 0.003;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + shift).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - shift).b;

      float v = smoothstep(1.05, 0.25, length(a * vec2(0.8, 1.0)));
      col *= mix(0.42, 1.0, v);

      vec2 px = floor(gl_FragCoord.xy / max(uScale, 1.0));
      float g = hash(px + fract(uTime * 7.31) * 517.0) + hash(px * 1.7 + fract(uTime * 3.77) * 211.0) - 1.0;
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col += g * 0.022 * (1.0 - lum * 0.6);
      // the darkest shadows lift a little and go warm, like the hero image
      col = max(col, vec3(0.0)) + vec3(0.010, 0.006, 0.004) * (1.0 - col);
      gl_FragColor = vec4(col, 1.0);
    }`,
};
