// Live: the overlay's main pass. It turns the clean image back into light,
// lets the candle light flicker, and adds the swinging censer, its smoke and
// the glow of its embers. The sprite pass adds flames and dust on top, and
// the finish pass grades the result back into display values.

layout(location = 0) out vec4 oLight;

uniform sampler2D uBase;
uniform sampler2D uShares;
uniform sampler2D uDepth;
uniform int uFrame;

// The haze and glow between the camera and the censer. The image has them
// over everything else, so without them the censer looks pasted on.
vec3 veil(vec3 c, vec3 ro, vec3 rd, float tEnd, vec3 censer) {
  const int STEPS = 10;
  float phase = phaseHG(dot(SUN_DIR, rd), 0.35);
  float sky = cloud();
  float dt = tEnd / float(STEPS);
  vec3 scattered = vec3(0.0);
  float through = 1.0;
  for (int i = uZero; i < STEPS; i++) {
    vec3 p = ro + rd * (float(i) + 0.5) * dt;
    float d = haze(p);
    float tr = exp(-d * dt);
    scattered += through * (daylight(p) * (phase * SHAFT_GAIN * sky) + FOG_AMB) * (1.0 - tr);
    through *= tr * exp(-ABSORB * dt);
  }
  return c * through + scattered + glows(ro, rd, tEnd, censer, true);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 light = ungrade(texelFetch(uBase, ivec2(gl_FragCoord.xy), 0).rgb, uv);
  // the shares are of candle groups 0, 1 and 3 together, and 2
  vec3 share = texture(uShares, uv).rgb;
  light *= 1.0 + dot(share, uFlicker.xyz - 1.0);

  vec3 ro = uCamPos;
  vec3 rd = cameraRay(gl_FragCoord.xy);
  float t = DEPTH_NEAR * exp(texture(uDepth, uv).r * log(DEPTH_FAR / DEPTH_NEAR));
  vec3 censer = censerAt(uTime);

  vec2 span = smokeSpan(ro, rd, t);
  if (span.y > span.x) {
    float jitter = ign(gl_FragCoord.xy + float(uFrame % 64) * vec2(5.588238, 3.712));
    vec3 plume = vec3(0.0);
    float through = 1.0;
    marchSmoke(ro, rd, span, jitter, phaseHG(dot(SUN_DIR, rd), 0.55), cloud(), censer, plume, through);
    light = light * through + plume;
  }
  light += EMBER_COL * uEmber * 0.5 * pointGlow(ro, rd, censer, t, 0.06) * HAZE / (4.0 * PI);

  // four rays per pixel where the censer is, so its edges and chains stay smooth as it swings
  Censer cz = censerNow();
  vec3 hit = vec3(0.0);
  float hits = 0.0;
  float tHit = 0.0;
  for (int s = 0; s < 4; s++) {
    vec3 r = cameraRay(gl_FragCoord.xy + (vec2(float(s & 1), float(s >> 1)) - 0.5) * 0.5);
    float tc;
    if (traceCenser(cz, ro, r, t, tc)) {
      hit += shadeCenser(cz, ro + r * tc, r);
      tHit += tc;
      hits += 1.0;
    }
  }
  if (hits > 0.0) light = mix(light, veil(hit / hits, ro, rd, tHit / hits, censer), hits / 4.0);
  oLight = vec4(light, 1.0);
}
