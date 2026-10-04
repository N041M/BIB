// Finish: grades the overlay's light back into display values, with grain.

layout(location = 0) out vec4 oColor;

uniform sampler2D uLight;
uniform float uTime;

void main() {
  vec2 uv = gl_FragCoord.xy / vec2(textureSize(uLight, 0));
  oColor = vec4(grain(grade(texelFetch(uLight, ivec2(gl_FragCoord.xy), 0).rgb, uv), 0.04, uTime), 1.0);
}
