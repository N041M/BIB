// Maps: what the live overlay needs to know about the rendered image, at a
// quarter of its resolution. Rendered from the clean image, without the
// censer, smoke or flames.
//   A: how much of the light here comes from candle group 0, groups 1 and 3 together, and group 2
//   B: the distance to the surface on a log scale from DEPTH_NEAR to DEPTH_FAR, in every channel

layout(location = 0) out vec4 oA;
layout(location = 1) out vec4 oB;

uniform sampler2D uDay;
uniform sampler2D uAlbedo;
uniform sampler2D uCandleD;
uniform sampler2D uCandleS;
uniform sampler2D uAir;
uniform sampler2D uHdr;
uniform vec3 uAccent;

const vec3 CANDLE_COL = vec3(1.0, 0.5, 0.19);
#define VOTIVE_COL mix(CANDLE_COL, uAccent, 0.55)

float lum(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

void main() {
  ivec2 block = ivec2(gl_FragCoord.xy) * 4;
  vec4 share = vec4(0.0);
  for (int j = 0; j < 4; j++) {
    for (int i = 0; i < 4; i++) {
      ivec2 px = block + ivec2(i, j);
      vec3 alb = texelFetch(uAlbedo, px, 0).rgb;
      vec4 cd = texelFetch(uCandleD, px, 0);
      vec4 cs = texelFetch(uCandleS, px, 0);
      float seen = texelFetch(uAir, px / 2, 0).a / max(lum(texelFetch(uHdr, px, 0).rgb), 1e-4);
      vec4 g = vec4(lum((alb * cd.x + cs.x) * VOTIVE_COL), lum((alb * cd.y + cs.y) * CANDLE_COL), lum((alb * cd.z + cs.z) * CANDLE_COL), lum((alb * cd.w + cs.w) * CANDLE_COL));
      share += clamp(g * seen, 0.0, 1.0);
    }
  }
  share /= 16.0;
  float t = texelFetch(uDay, block + 2, 0).a;
  float depth = clamp(log(t / DEPTH_NEAR) / log(DEPTH_FAR / DEPTH_NEAR), 0.0, 1.0);
  oA = vec4(share.x, share.y + share.w, share.z, 1.0);
  oB = vec4(depth, depth, depth, 1.0);
}
