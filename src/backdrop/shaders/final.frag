// Final: bloom, exposure, tone curve, grade, vignette, grain and dither, at
// the canvas's own resolution.

layout(location = 0) out vec4 oColor;

uniform sampler2D uHdr;
uniform sampler2D uBloom;
uniform vec2 uOut;
uniform float uTime;
uniform vec3 uBg; // the page background, in display values

const float EXPOSURE = 1.0;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uOut;
  vec3 c = texture(uHdr, uv).rgb;
  c += texture(uBloom, uv).rgb * 0.06;
  c *= EXPOSURE;

  // pull the deep shadows toward a cold blue-grey and keep the highlights warm
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(c * vec3(0.92, 0.98, 1.06), c, smoothstep(0.0, 0.5, l));
  c = aces(c);
  c = pow(c, vec3(1.0 / 2.2));

  vec2 d = uv - 0.5;
  c *= 1.0 - 0.55 * dot(d * vec2(1.1, 1.0), d * vec2(1.1, 1.0));
  c = uBg + (1.0 - uBg) * c;

  float g = hash(gl_FragCoord.xy + fract(uTime * 7.31) * 911.0) - 0.5;
  c += g * 0.04 * (0.35 + 0.65 * (1.0 - c));
  c += (hash(gl_FragCoord.yx * 1.37 + 17.0) - 0.5) / 255.0;
  oColor = vec4(c, 1.0);
}
