// Frame: runs every frame at the bake's resolution. It relights the baked
// layers with the current candle flicker, draws the swinging censer, and
// marches the air: haze, light shafts and the censer's smoke.

layout(location = 0) out vec4 oColor;

uniform sampler2D uDay;
uniform sampler2D uAlbedo;
uniform sampler2D uCandleD;
uniform sampler2D uCandleS;
uniform highp sampler3D uNoise;
uniform float uTime;
uniform int uFrame;
uniform vec4 uFlicker;
uniform float uEmber;
uniform vec3 uAccent;

const vec3 CANDLE_COL = vec3(1.0, 0.5, 0.19);
// candlelight through the coloured glass of the votive cups
#define VOTIVE_COL mix(CANDLE_COL, uAccent, 0.55)
const vec3 EMBER_COL = vec3(1.0, 0.32, 0.08);
const float HAZE = 0.016;
const float SHAFT_GAIN = 9.0;
// absorption in the air, so the far end sinks into the dark
const float ABSORB = 0.02;
const vec3 FOG_AMB = vec3(0.0004, 0.00055, 0.0007);
const int FOG_STEPS = 30;
const int SMOKE_STEPS = 32;

/* ───────────── noise from the 32³ texture ───────────── */

float tnoise(vec3 p) {
  vec3 y = p - 0.5;
  vec3 i = floor(y);
  vec3 f = fract(y);
  f = f * f * (3.0 - 2.0 * f);
  return textureLod(uNoise, (i + f + 0.5) / 32.0, 0.0).r;
}

/* ───────────── censer ───────────── */

// Unit vector from the pivot to the censer at a given time.
vec3 censerDir(float time) {
  float a = CENSER_AMP * sin(CENSER_W * time);
  float b = 0.22 * CENSER_AMP * sin(CENSER_W * time + 1.1);
  vec3 F = vec3(SERV_F.x, 0.0, SERV_F.y);
  vec3 R = vec3(SERV_R.x, 0.0, SERV_R.y);
  return normalize(F * sin(a) + R * sin(b) - vec3(0.0, cos(a) * cos(b), 0.0));
}

vec3 censerAt(float time) {
  return CENSER_PIVOT + censerDir(time) * CENSER_LEN;
}

// The censer in its own frame: y runs up the chain to the claw, the origin is the body's centre.
float sdCenser(vec3 q, out float chain) {
  float bowl = max(sdEllipsoid(q - vec3(0.0, -0.005, 0.0), vec3(0.085, 0.075, 0.085)), q.y);
  float lid = max(sdEllipsoid(q, vec3(0.08, 0.118, 0.08)), -q.y);
  float rim = sdTorus(q, vec2(0.084, 0.008));
  float foot = sdCylY(q - vec3(0.0, -0.08, 0.0), 0.034, 0.012) - 0.003;
  float fin = min(sdCapsule(q, vec3(0.0, 0.1, 0.0), vec3(0.0, 0.135, 0.0), 0.01), length(q - vec3(0.0, 0.142, 0.0)) - 0.016);
  float body = min(min(bowl, lid), min(rim, min(foot, fin)));
  vec3 ring = vec3(0.0, 0.29, 0.0);
  float c = sdCapsule(q, ring, vec3(0.0, CENSER_LEN, 0.0), 0.0045);
  for (int i = 0; i < 3; i++) {
    float a = float(i) * 2.0944 + 0.5;
    c = min(c, sdCapsule(q, vec3(cos(a) * 0.08, 0.004, sin(a) * 0.08), ring, 0.0032));
  }
  c = min(c, sdTorus(q - ring, vec2(0.016, 0.004)));
  chain = c;
  return min(body, c);
}

struct Censer {
  vec3 pos;
  mat3 basis; // columns: x, y (up the chain), z
};

Censer censerNow() {
  vec3 up = -censerDir(uTime);
  vec3 x = normalize(cross(up, vec3(SERV_F.x, 0.0, SERV_F.y)));
  vec3 z = cross(x, up);
  return Censer(CENSER_PIVOT - up * CENSER_LEN, mat3(x, up, z));
}

vec3 shadeCenser(Censer cz, vec3 p, vec3 rd) {
  vec3 q = (p - cz.pos) * cz.basis;
  float chain;
  float e = 0.0006;
  vec2 k = vec2(1.0, -1.0);
  vec3 nl = normalize(k.xyy * sdCenser(q + k.xyy * e, chain) + k.yyx * sdCenser(q + k.yyx * e, chain) +
                      k.yxy * sdCenser(q + k.yxy * e, chain) + k.xxx * sdCenser(q + k.xxx * e, chain));
  float d = sdCenser(q, chain);
  bool isChain = chain <= d + 1e-5;
  vec3 n = cz.basis * nl;
  vec3 v = -rd;
  vec3 alb = isChain ? vec3(0.07, 0.06, 0.05) : vec3(0.62, 0.42, 0.17) * (0.8 + 0.3 * noise3(q * 120.0));
  float rough = isChain ? 0.5 : 0.3;

  vec3 col = alb * vec3(0.02, 0.018, 0.016) * (0.6 + 0.4 * n.y);
  for (int c = uZero; c < N_CLUSTERS; c++) {
    vec4 cl = CLUSTER_L[c];
    vec4 ci = CLUSTER_I[c];
    vec3 dv = cl.xyz - p;
    float d2 = dot(dv, dv);
    if (d2 > ci.y * ci.y) continue;
    vec3 L = dv * inversesqrt(d2);
    float ndl = max(dot(n, L), 0.0);
    vec3 lc = (ci.z < 0.5 ? VOTIVE_COL : CANDLE_COL) * ci.x * uFlicker[int(ci.z)] / (d2 + cl.w * cl.w);
    col += lc * alb * ndl * (0.12 + specGGX(n, v, L, rough));
  }
  float bay;
  vec3 win = windowLight(p, 0.08, bay);
  if (bay > -1.5) {
    float ndl = max(dot(n, SUN_DIR), 0.0);
    col += SUN_COL * win * pierShadow(p) * alb * ndl * (0.12 + specGGX(n, v, SUN_DIR, rough));
  }
  // embers seen through the piercings in the lid
  if (!isChain && q.y > 0.012 && q.y < 0.1) {
    float a = atan(q.z, q.x) / (2.0 * PI);
    float row = q.y < 0.055 ? 0.0 : 1.0;
    float cols = row < 0.5 ? 10.0 : 6.0;
    vec2 cell = vec2((fract(a * cols + row * 0.5) - 0.5) * 2.0, (q.y - (row < 0.5 ? 0.034 : 0.074)) / 0.012);
    float hole = 1.0 - smoothstep(0.35, 0.6, length(cell * vec2(1.0, 0.8)));
    col += EMBER_COL * uEmber * hole * 5.0;
  }
  return col;
}

// Ray against the censer, inside a sphere round its whole swing.
bool traceCenser(Censer cz, vec3 ro, vec3 rd, float tMax, out float tHit) {
  vec3 oc = ro - CENSER_PIVOT;
  float r = CENSER_LEN + 0.16;
  float b = dot(oc, rd);
  float c = dot(oc, oc) - r * r;
  float h = b * b - c;
  if (h < 0.0) return false;
  h = sqrt(h);
  float t = max(-b - h, 0.0);
  float t1 = min(-b + h, tMax);
  float chain;
  for (int i = uZero; i < 80; i++) {
    if (t > t1) return false;
    vec3 q = (ro + rd * t - cz.pos) * cz.basis;
    float d = sdCenser(q, chain);
    if (d < 0.0004 * t) {
      tHit = t;
      return true;
    }
    t += d;
  }
  return false;
}

/* ───────────── air ───────────── */

float haze(vec3 p) {
  vec3 w = vec3(0.05, 0.012, 0.07) * uTime;
  float n = tnoise(p * 0.45 + w) * 0.6 + tnoise(p * 1.2 - w * 1.7) * 0.4;
  float h = 0.7 + 0.6 * smoothstep(1.0, 11.0, p.y);
  return HAZE * h * (0.15 + 3.0 * n * n * n);
}

// Clouds passing the sun, from 1 in clear sky down to about 0.7.
float cloud() {
  return 0.68 + 0.4 * smoothstep(0.25, 0.7, tnoise(vec3(uTime * 0.035, 1.7, 3.1)));
}

vec3 daylight(vec3 p) {
  float bay;
  vec3 win = windowLight(p, 0.08, bay);
  if (bay < -1.5) return vec3(0.0);
  return SUN_COL * win * (bay > -0.5 ? pierShadow(p) : 1.0);
}

const vec3 SMOKE_LO = CENSER_PIVOT + vec3(-0.9, -CENSER_LEN - 0.12, -0.8);
const vec3 SMOKE_HI = CENSER_PIVOT + vec3(0.8, 1.9, 0.9);

// The plume. Smoke at height h left the censer h / rise seconds ago, so it
// is centred on where the censer was then and has spread and drifted since.
float smoke(vec3 p) {
  float base = CENSER_PIVOT.y - CENSER_LEN + 0.06;
  float h = p.y - base;
  if (h < -0.06) return 0.0;
  float age = max(h, 0.0) / 0.17;
  vec3 src = censerAt(uTime - age);
  vec3 tq = p * 2.2 - vec3(0.0, uTime * 0.4, 0.0);
  vec2 turb = (vec2(tnoise(tq), tnoise(tq + 11.0)) - 0.5) * (0.03 + 0.12 * age);
  // a slow draught carries the plume toward the light in front of the servitor
  vec2 drift = vec2(-0.025, 0.045) * age;
  vec2 dxz = p.xz - src.xz - drift - turb;
  float sigma = 0.02 + 0.035 * age;
  float d = exp(-dot(dxz, dxz) / (sigma * sigma)) * pow(0.02 / sigma, 0.75);
  vec3 wq = p * vec3(5.0, 2.6, 5.0) - vec3(0.0, uTime * 0.6, 0.0);
  float wisp = 0.65 * tnoise(wq) + 0.35 * tnoise(wq * 2.3 + 5.0);
  d *= smoothstep(0.2, 0.7, wisp + 0.25 - age * 0.012);
  d *= exp(-age / 9.0) * smoothstep(-0.06, 0.06, h) * smoothstep(SMOKE_HI.y, SMOKE_HI.y - 0.6, p.y);
  return d * 9.0;
}

vec2 smokeSpan(vec3 ro, vec3 rd, float tMax) {
  vec3 inv = 1.0 / rd;
  vec3 t0 = (SMOKE_LO - ro) * inv;
  vec3 t1 = (SMOKE_HI - ro) * inv;
  vec3 tn = min(t0, t1), tf = max(t0, t1);
  return vec2(max(max(tn.x, tn.y), max(tn.z, 0.0)), min(min(tf.x, tf.y), min(tf.z, tMax)));
}

void marchSmoke(vec3 ro, vec3 rd, vec2 span, float jitter, float phase, float sky, vec3 censer, inout vec3 acc, inout float T) {
  float dt = (span.y - span.x) / float(SMOKE_STEPS);
  vec4 rack = CLUSTER_L[0];
  float rackPow = CLUSTER_I[0].x * uFlicker.x;
  for (int i = uZero; i < SMOKE_STEPS; i++) {
    vec3 p = ro + rd * (span.x + (float(i) + jitter) * dt);
    float d = smoke(p);
    if (d < 1e-4) continue;
    vec3 dc = p - censer;
    vec3 dr = p - rack.xyz;
    vec3 light = daylight(p) * (phase * 3.0 * sky);
    light += EMBER_COL * uEmber * 0.012 / (dot(dc, dc) + 0.006);
    light += VOTIVE_COL * rackPow * 0.02 / (dot(dr, dr) + rack.w * rack.w);
    light += FOG_AMB * 4.0;
    float tr = exp(-d * dt);
    acc += T * light * 0.9 * (1.0 - tr);
    T *= tr;
  }
}

vec4 air(vec3 ro, vec3 rd, float tEnd, vec3 censer) {
  float tMax = min(tEnd, 60.0);
  float jitter = ign(gl_FragCoord.xy + float(uFrame % 64) * vec2(5.588238, 3.712));
  float cs = dot(SUN_DIR, rd);
  float phaseHaze = phaseHG(cs, 0.35);
  float phaseSmoke = phaseHG(cs, 0.55);
  float sky = cloud();
  vec2 span = smokeSpan(ro, rd, tMax);
  bool smokeDone = span.y <= span.x;
  float smokeMid = 0.5 * (span.x + span.y);

  vec3 acc = vec3(0.0);
  float T = 1.0;
  float tPrev = 0.0;
  for (int i = uZero; i < FOG_STEPS; i++) {
    float tNext = tMax * pow((float(i) + 1.0) / float(FOG_STEPS), 1.6);
    float t = mix(tPrev, tNext, jitter);
    if (!smokeDone && t > smokeMid) {
      marchSmoke(ro, rd, span, jitter, phaseSmoke, sky, censer, acc, T);
      smokeDone = true;
    }
    vec3 p = ro + rd * t;
    float d = haze(p);
    float dt = tNext - tPrev;
    vec3 light = daylight(p) * (phaseHaze * SHAFT_GAIN * sky) + FOG_AMB;
    float tr = exp(-d * dt);
    acc += T * light * (1.0 - tr);
    T *= tr * exp(-ABSORB * dt);
    tPrev = tNext;
  }
  if (!smokeDone) marchSmoke(ro, rd, span, jitter, phaseSmoke, sky, censer, acc, T);
  return vec4(acc, T);
}

// In-scattered light from a point source over the ray segment [0, tEnd],
// in closed form. soft widens the source.
float pointGlow(vec3 ro, vec3 rd, vec3 c, float tEnd, float soft) {
  vec3 oc = c - ro;
  float s0 = dot(oc, rd);
  float h = sqrt(max(dot(oc, oc) - s0 * s0, 0.0) + soft * soft);
  return (atan((tEnd - s0) / h) + atan(s0 / h)) / h * exp(-(HAZE + ABSORB) * max(s0, 0.0));
}

vec3 glows(vec3 ro, vec3 rd, float tEnd, vec3 censer) {
  vec3 sum = vec3(0.0);
  for (int c = uZero; c < N_CLUSTERS; c++) {
    vec4 cl = CLUSTER_L[c];
    vec4 ci = CLUSTER_I[c];
    vec3 col = ci.z < 0.5 ? VOTIVE_COL : CANDLE_COL;
    sum += col * ci.x * uFlicker[int(ci.z)] * pointGlow(ro, rd, cl.xyz, tEnd, cl.w + 0.05);
  }
  sum += EMBER_COL * uEmber * 0.5 * pointGlow(ro, rd, censer, tEnd, 0.06);
  sum += SKY_COL * 9.0 * pointGlow(ro, rd, vec3(0.0, 5.5, END_Z + 1.0), tEnd, 2.0);
  return sum * HAZE / (4.0 * PI);
}

void main() {
  ivec2 px = ivec2(gl_FragCoord.xy);
  vec4 day = texelFetch(uDay, px, 0);
  vec4 alb = texelFetch(uAlbedo, px, 0);
  vec4 cd = texelFetch(uCandleD, px, 0);
  vec4 cs = texelFetch(uCandleS, px, 0);
  vec3 ro = uCamPos;
  vec3 rd = cameraRay(gl_FragCoord.xy);

  vec4 f = uFlicker;
  vec3 candle = VOTIVE_COL * cd.x * f.x + CANDLE_COL * dot(cd.yzw, f.yzw);
  vec3 sheen = VOTIVE_COL * cs.x * f.x + CANDLE_COL * dot(cs.yzw, f.yzw);
  vec3 col = day.rgb * cloud() + alb.rgb * candle + sheen;
  float t = day.a;

  Censer cz = censerNow();
  float tc;
  if (traceCenser(cz, ro, rd, t, tc)) {
    t = tc;
    col = shadeCenser(cz, ro + rd * tc, rd);
  }

  vec4 a = air(ro, rd, t, cz.pos);
  col = col * a.a + a.rgb;
  col += glows(ro, rd, t, cz.pos);
  oColor = vec4(col, t);
}
