// Bake: renders the static scene once into four layers.
//   0: daylight radiance (rgb) and the distance to the surface (a)
//   1: albedo (rgb) and how strongly the floor mirrors the flames (a)
//   2: candle light reaching the surface, one channel per flicker group
//   3: candle light reflected off the surface, one channel per flicker group
// The frame pass recombines them with the current flicker.

layout(location = 0) out vec4 oDay;
layout(location = 1) out vec4 oAlbedo;
layout(location = 2) out vec4 oCandleD;
layout(location = 3) out vec4 oCandleS;

uniform vec2 uJitter;

const vec3 END_LIGHT = vec3(0.0, 6.5, END_Z - 0.2);

vec3 ambient(vec3 p, vec3 n) {
  vec3 sky = SKY_COL * 0.006 * (0.45 + 0.55 * n.x) * (0.6 + 0.4 * n.y);
  // light thrown up off the sunlit floor
  vec3 bounce = vec3(0.85, 0.85, 0.8) * 0.025 * clamp(0.2 - 0.8 * n.y, 0.0, 1.0);
  // the end window lights the far end of the hall
  float nearEnd = exp((END_Z - p.z) * 0.15);
  sky += SKY_COL * 0.05 * nearEnd * clamp(0.35 - 0.65 * n.z, 0.0, 1.0);
  return sky + bounce;
}

void main() {
  vec3 ro = uCamPos;
  vec3 rd = cameraRay(gl_FragCoord.xy + uJitter);

  float t = 0.1;
  vec2 h = vec2(1.0, 0.0);
  for (int i = uZero; i < 240; i++) {
    h = map(ro + rd * t);
    if (abs(h.x) < 0.0003 * t || t > 70.0) break;
    t += h.x * 0.85;
  }
  vec3 p = ro + rd * t;
  vec3 n = calcNormal(p, t);
  Surf s = surface(p, n, h.y);
  vec3 v = -rd;

  vec3 day = s.emit;
  vec4 cd = vec4(0.0);
  vec4 cs = vec4(0.0);
  vec3 f0 = mix(vec3(0.04), s.alb, s.metal);
  vec3 diffAlb = s.alb * (1.0 - s.metal);
  vec4 gmask = vec4(equal(vec4(s.group), vec4(0.0, 1.0, 2.0, 3.0)));
  cd += gmask * s.glow;

  bool lit = dot(s.emit, s.emit) == 0.0;
  if (lit) {
    float ao = calcAO(p, n);
    day += diffAlb * ambient(p, n) * ao;
    vec3 sp = p + n * 0.003 * max(1.0, t * 0.3);

    // One loop over every light keeps a single call site for the shadow march.
    // -2 is the sun through the windows, -1 the glow of the end window, then the candle clusters.
    for (int li = -2; li < N_CLUSTERS; li++) {
      vec3 L;
      vec3 col;
      float tmax;
      float k;
      float group = -1.0;
      if (li == -2) {
        float bay;
        vec3 win = windowLight(p, 0.0, bay);
        if (bay < -1.5) continue;
        L = SUN_DIR;
        col = SUN_COL * win;
        tmax = bay > -0.5 ? (HALL_W - 0.05 - p.x) / SUN_DIR.x : (END_Z + 0.05 - p.z) / SUN_DIR.z;
        k = 40.0;
      } else if (li == -1) {
        vec3 dv = END_LIGHT - p;
        float dist = length(dv);
        L = dv / dist;
        col = SKY_COL * 14.0 / (dist * dist + 6.0);
        tmax = dist - 1.5;
        k = 5.0;
      } else {
        vec4 cl = CLUSTER_L[li];
        vec4 ci = CLUSTER_I[li];
        vec3 dv = cl.xyz - p;
        float dist = length(dv);
        if (dist > ci.y) continue;
        L = dv / dist;
        float fall = 1.0 - smoothstep(ci.y * 0.35, ci.y, dist);
        col = vec3(ci.x * fall / (dist * dist + cl.w * cl.w + 0.05));
        tmax = dist - cl.w - 0.06;
        k = 2.5 * dist / cl.w;
        group = ci.z;
        // pale wax right beside the flames would burn out to white
        if (h.y >= M_CANDLE) col *= 0.35;
        // a little light bounced around the cluster, without direction
        cd += vec4(equal(vec4(group), vec4(0.0, 1.0, 2.0, 3.0))) * col.x * 0.04 * ao;
      }
      float ndl = dot(n, L);
      float wrapped = (ndl + s.wrap) / (1.0 + s.wrap);
      if (wrapped <= 0.0) continue;
      float sh = tmax > 0.03 ? softShadow(sp, L, tmax, k) : 1.0;
      if (sh < 0.002) continue;
      vec3 diff = col * wrapped * sh;
      float vh = max(dot(v, normalize(v + L)), 0.0);
      vec3 fr = f0 + (1.0 - f0) * pow(1.0 - vh, 5.0);
      vec3 spec = col * fr * specGGX(n, v, L, s.rough) * max(ndl, 0.0) * sh;
      if (group < 0.0) {
        day += diffAlb * diff + spec;
      } else {
        vec4 m = vec4(equal(vec4(group), vec4(0.0, 1.0, 2.0, 3.0)));
        cd += m * diff.x;
        cs += m * dot(spec, vec3(0.3333));
      }
    }
  }

  oDay = vec4(day, t);
  oAlbedo = vec4(diffAlb, s.gloss);
  oCandleD = cd;
  oCandleS = cs;
}
