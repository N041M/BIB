import * as THREE from 'three';
import { loadModel } from '../three/models';

/** A pattern drawn for the printer: its shading in grey on white, and its edges in black on transparent. */
export interface ModelDrawing {
  shade: HTMLCanvasElement;
  lines: HTMLCanvasElement;
}

/** Drawn at twice the size and scaled down, so the lines come out smooth. */
const SUPER = 2;

/**
 * Draw a pattern from the archive for the blog's printer, `w` by `h` device
 * pixels, seen from the front right and a little above. The shading is lit
 * like a plaster cast, and the lines are the model's creases, with the ones
 * at the back hidden.
 */
export async function drawModel(renderer: THREE.WebGLRenderer, file: string, w: number, h: number): Promise<ModelDrawing> {
  const model = await loadModel(file);
  const tw = w * SUPER;
  const th = h * SUPER;
  const target = new THREE.WebGLRenderTarget(tw, th, { depthBuffer: true });

  const camera = new THREE.PerspectiveCamera(22, w / h, 1, 1);
  const dir = new THREE.Vector3(0.82, 0.5, 1).normalize();
  // start from the bounding sphere, then move in until the model's outline fills 90% of the picture
  const half = THREE.MathUtils.degToRad(11);
  const halfW = Math.atan(Math.tan(half) * (w / h));
  let dist = model.radius / Math.sin(Math.min(half, halfW));
  const position = model.geometry.attributes.position;
  const step = Math.max(1, Math.floor(position.count / 20000));
  const corner = new THREE.Vector3();
  for (let pass = 0; pass < 3; pass++) {
    camera.position.copy(model.center).addScaledVector(dir, dist);
    camera.near = Math.max(0.1, dist - model.radius * 1.2);
    camera.far = dist + model.radius * 1.2;
    camera.lookAt(model.center);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    let reach = 0;
    for (let i = 0; i < position.count; i += step) {
      corner.fromBufferAttribute(position, i).project(camera);
      reach = Math.max(reach, Math.abs(corner.x), Math.abs(corner.y));
    }
    dist *= reach / 0.9;
  }
  camera.position.copy(model.center).addScaledVector(dir, dist);
  camera.near = Math.max(0.1, dist - model.radius * 1.2);
  camera.far = dist + model.radius * 1.2;
  camera.lookAt(model.center);
  camera.updateProjectionMatrix();

  const scene = new THREE.Scene();
  const plaster = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
  const mesh = new THREE.Mesh<THREE.BufferGeometry, THREE.Material>(model.geometry, plaster);
  const sky = new THREE.HemisphereLight(0xffffff, 0x606060, 1.9);
  const sun = new THREE.DirectionalLight(0xffffff, 3.4);
  sun.position.copy(model.center).add(new THREE.Vector3(-1, 1.6, 1.1).multiplyScalar(model.radius * 4));
  sun.target.position.copy(model.center);
  scene.add(mesh, sky, sun, sun.target);

  const before = {
    target: renderer.getRenderTarget(),
    colour: renderer.getClearColor(new THREE.Color()),
    alpha: renderer.getClearAlpha(),
    autoClear: renderer.autoClear,
  };

  // the shading, on white
  renderer.setRenderTarget(target);
  renderer.setClearColor(0xffffff, 1);
  renderer.clear();
  renderer.render(scene, camera);
  const shade = read(renderer, target, tw, th, w, h);

  // the creases, in black on nothing. The model only writes depth, pushed back a little,
  // so lines on its near side pass and lines behind it do not. Drawing them a few times,
  // a pixel apart, gives them the weight of a pen line.
  scene.remove(sky, sun);
  const depth = new THREE.MeshBasicMaterial({ colorWrite: false, polygonOffset: true, polygonOffsetFactor: 1.5, polygonOffsetUnits: 2 });
  mesh.material = depth;
  const ink = new THREE.LineBasicMaterial({ color: 0x000000 });
  const lines = new THREE.LineSegments(model.edges, ink);
  scene.add(lines);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.autoClear = false;
  for (const [dx, dy] of [
    [0, 0],
    [1.4, 0],
    [-1.4, 0],
    [0, 1.4],
    [0, -1.4],
  ]) {
    camera.setViewOffset(tw, th, dx, dy, tw, th);
    renderer.clearDepth();
    renderer.render(scene, camera);
  }
  const outline = read(renderer, target, tw, th, w, h);

  renderer.setRenderTarget(before.target);
  renderer.setClearColor(before.colour, before.alpha);
  renderer.autoClear = before.autoClear;
  target.dispose();
  plaster.dispose();
  depth.dispose();
  ink.dispose();
  return { shade, lines: outline };
}

/** Read a render target back into a canvas `w` by `h`, the right way up and scaled down. */
function read(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget, tw: number, th: number, w: number, h: number): HTMLCanvasElement {
  const buf = new Uint8Array(tw * th * 4);
  renderer.readRenderTargetPixels(target, 0, 0, tw, th, buf);
  const full = document.createElement('canvas');
  full.width = tw;
  full.height = th;
  const fg = full.getContext('2d')!;
  const img = fg.createImageData(tw, th);
  const row = tw * 4;
  for (let y = 0; y < th; y++) img.data.set(buf.subarray((th - 1 - y) * row, (th - y) * row), y * row);
  fg.putImageData(img, 0, 0);
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const g = out.getContext('2d')!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(full, 0, 0, w, h);
  return out;
}
