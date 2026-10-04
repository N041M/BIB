// Live: the overlay's main pass. It turns the clean image back into light,
// lets the candle light flicker, and adds the swinging censer, its smoke and
// the glow of its embers. The sprite pass adds flames and dust on top, and
// the finish pass grades the result back into display values.

layout(location = 0) out vec4 oLight;

uniform sampler2D uBase;
uniform sampler2D uShares;
uniform sampler2D uDepth;
uniform int uFrame;

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
  Censer cz = censerNow();
  float tc;
  if (traceCenser(cz, ro, rd, t, tc)) {
    light = shadeCenser(cz, ro + rd * tc, rd) * exp(-(HAZE + ABSORB) * tc);
    t = tc;
  }
  vec2 span = smokeSpan(ro, rd, t);
  if (span.y > span.x) {
    float jitter = ign(gl_FragCoord.xy + float(uFrame % 64) * vec2(5.588238, 3.712));
    vec3 plume = vec3(0.0);
    float through = 1.0;
    marchSmoke(ro, rd, span, jitter, phaseHG(dot(SUN_DIR, rd), 0.55), cloud(), censer, plume, through);
    light = light * through + plume;
  }
  light += EMBER_COL * uEmber * 0.5 * pointGlow(ro, rd, censer, t, 0.06) * HAZE / (4.0 * PI);
  oLight = vec4(light, 1.0);
}
