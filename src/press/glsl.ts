/**
 * GLSL shared by the press's materials: hashing, value noise, and a bump
 * that tilts the shading normal from a height worked out per pixel.
 */

export const NOISE = /* glsl */ `
uint prPcg(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v.x;
}

float prHash(vec3 i) {
  return float(prPcg(uvec3(ivec3(i) + 65536))) * (1.0 / 4294967296.0);
}

float prNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float a = prHash(i);
  float b = prHash(i + vec3(1.0, 0.0, 0.0));
  float c = prHash(i + vec3(0.0, 1.0, 0.0));
  float d = prHash(i + vec3(1.0, 1.0, 0.0));
  float e = prHash(i + vec3(0.0, 0.0, 1.0));
  float g = prHash(i + vec3(1.0, 0.0, 1.0));
  float h = prHash(i + vec3(0.0, 1.0, 1.0));
  float k = prHash(i + vec3(1.0, 1.0, 1.0));
  return mix(mix(mix(a, b, u.x), mix(c, d, u.x), u.y), mix(mix(e, g, u.x), mix(h, k, u.x), u.y), u.z);
}

float prFbm(vec3 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * prNoise(p);
    p = p * 2.03 + vec3(13.7, 7.1, 3.3);
    a *= 0.5;
  }
  return s * 1.0667;
}

/* Value noise that repeats every period cells in x and y. */
float prHashT(vec2 i, vec2 period, float z) {
  return prHash(vec3(mod(i, period), z));
}

float prNoiseT(vec2 x, vec2 period, float z) {
  vec2 i = floor(x);
  vec2 f = fract(x);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = prHashT(i, period, z);
  float b = prHashT(i + vec2(1.0, 0.0), period, z);
  float c = prHashT(i + vec2(0.0, 1.0), period, z);
  float d = prHashT(i + vec2(1.0, 1.0), period, z);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

/* fbm over a tile: x is in cells of the first octave, period is that octave's cell count. */
float prFbmT(vec2 x, vec2 period, float z) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    s += a * prNoiseT(x, period, z + float(i) * 17.0);
    x *= 2.0;
    period *= 2.0;
    a *= 0.5;
  }
  return s * 1.0323;
}

/* Tilt a view-space normal by a height given per pixel (Mikkelsen's bump mapping with screen derivatives). */
vec3 prBump(vec3 surfPos, vec3 surfNorm, float h) {
  vec3 sx = dFdx(surfPos);
  vec3 sy = dFdy(surfPos);
  vec3 r1 = cross(sy, surfNorm);
  vec3 r2 = cross(surfNorm, sx);
  float det = dot(sx, r1);
  vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  return normalize(abs(det) * surfNorm - grad);
}
`;
