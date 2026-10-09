import * as THREE from 'three';

/**
 * The hall behind the machine: the hero's rendered image on a far plane,
 * out of focus and in shadow. Turning toward the machine slides the image
 * across with motion blur. It is far behind the machine, so it moves the most
 * when the viewer's head does.
 */

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
varying vec2 vUv;
uniform sampler2D uPoster;
uniform float uReady;
/* the plane's aspect divided by the image's */
uniform float uFit;
/* 0 looking at the hero's view, 1 turned to the machine */
uniform float uTurn;
/* how fast it is turning, for the motion blur */
uniform float uSpeed;

vec3 tap(vec2 uv, float lod) {
  return textureLod(uPoster, clamp(uv, 0.001, 0.999), lod).rgb;
}

void main() {
  // cover the plane with the image, then pan and push in for the turned view
  vec2 uv = vUv - 0.5;
  if (uFit > 1.0) uv.y /= uFit; else uv.x *= uFit;
  float zoom = mix(1.0, 1.14, uTurn);
  uv /= zoom;
  uv.x -= mix(0.0, 0.21, uTurn);
  uv += 0.5;

  float lod = mix(1.0, 3.2, uTurn);
  vec3 col = vec3(0.0);
  float blur = uSpeed * 0.05;
  for (int i = 0; i < 9; i++) {
    float o = (float(i) / 8.0 - 0.5) * blur;
    vec2 jitter = vec2(o, 0.0) + vec2(sin(float(i) * 2.4), cos(float(i) * 2.4)) * 0.0035 * uTurn;
    col += tap(uv + jitter, lod + uSpeed * 2.0);
  }
  col /= 9.0;

  // the hall is in shadow behind the machine, and a little less saturated
  float grey = dot(col, vec3(0.3, 0.55, 0.15));
  col = mix(vec3(grey), col, mix(1.0, 0.8, uTurn));
  col *= mix(1.0, 0.42, uTurn);
  float pool = smoothstep(0.85, 0.15, length((vUv - vec2(0.5, 0.42)) * vec2(1.2, 1.0)));
  col *= mix(1.0, 0.55 + 0.45 * pool, uTurn);
  gl_FragColor = vec4(col * uReady, 1.0);
}`;

export class Backdrop {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private texture?: THREE.Texture;
  private aspect = 16 / 10;

  constructor(src: string) {
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: {
          uPoster: { value: null },
          uReady: { value: 0 },
          uFit: { value: 1 },
          uTurn: { value: 1 },
          uSpeed: { value: 0 },
        },
        depthWrite: false,
      }),
    );
    this.mesh.renderOrder = -1;
    new THREE.TextureLoader().load(src, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      this.texture = tex;
      this.aspect = tex.image.width / tex.image.height;
      const u = this.mesh.material.uniforms;
      u.uPoster.value = tex;
      u.uReady.value = 1;
      this.fit();
    });
  }

  /** Place the plane `depth` behind the sheet, big enough to fill the view from anywhere the eye goes. */
  place(view: { w: number; h: number; eye: number }, depth: number): void {
    const k = ((view.eye + depth) / view.eye) * 1.3;
    this.mesh.scale.set(view.w * k, view.h * k, 1);
    this.mesh.position.set(0, 0, -depth);
    this.fit();
  }

  set(turn: number, speed: number): void {
    const u = this.mesh.material.uniforms;
    u.uTurn.value = turn;
    u.uSpeed.value = speed;
  }

  private fit(): void {
    this.mesh.material.uniforms.uFit.value = this.mesh.scale.x / this.mesh.scale.y / this.aspect;
  }

  dispose(): void {
    this.texture?.dispose();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
