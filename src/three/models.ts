import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

export interface ModelData {
  geometry: THREE.BufferGeometry;
  edges: THREE.BufferGeometry;
  /** Bounding-box size in millimetres (x = width, y = height, z = depth). */
  size: THREE.Vector3;
  /** Bounding-sphere centre and radius after normalisation (base on y = 0). */
  center: THREE.Vector3;
  radius: number;
  triangles: number;
  bytes: number;
  placeholder: boolean;
}

const loader = new STLLoader();
const cache = new Map<string, Promise<ModelData>>();

export const modelUrl = (file: string): string => `${import.meta.env.BASE_URL}models/${file}`;

/** Load (once) and normalise an STL: Z-up → Y-up, centred on X/Z, resting on y = 0. */
export function loadModel(file: string): Promise<ModelData> {
  let pending = cache.get(file);
  if (!pending) {
    pending = fetchModel(file);
    cache.set(file, pending);
  }
  return pending;
}

async function fetchModel(file: string): Promise<ModelData> {
  let geometry: THREE.BufferGeometry;
  let bytes = 0;
  let placeholder = false;
  try {
    const res = await fetch(modelUrl(file));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (res.headers.get('content-type')?.includes('text/html')) throw new Error('not an STL');
    const buffer = await res.arrayBuffer();
    bytes = buffer.byteLength;
    geometry = loader.parse(buffer);
    geometry.rotateX(-Math.PI / 2);
  } catch (err) {
    console.warn(`[archive] could not load ${file}, using a placeholder`, err);
    geometry = placeholderGeometry();
    placeholder = true;
  }
  return normalise(geometry, bytes, placeholder);
}

function normalise(geometry: THREE.BufferGeometry, bytes: number, placeholder: boolean): ModelData {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const offset = new THREE.Vector3(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  geometry.translate(offset.x, offset.y, offset.z);
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const size = geometry.boundingBox!.getSize(new THREE.Vector3());
  const sphere = geometry.boundingSphere!;
  const edges = new THREE.EdgesGeometry(geometry, 32);
  return {
    geometry,
    edges,
    size,
    center: sphere.center.clone(),
    radius: sphere.radius,
    triangles: Math.round(geometry.getAttribute('position').count / 3),
    bytes,
    placeholder,
  };
}

/** Shown if an STL is missing so the archive still renders something sensible. */
function placeholderGeometry(): THREE.BufferGeometry {
  const g = new THREE.OctahedronGeometry(20, 0);
  g.translate(0, 20, 0);
  g.computeVertexNormals();
  return g;
}

/** Warm the cache in the background without blocking anything. */
export function prefetchModels(files: string[]): void {
  const run = () => files.forEach((f) => void loadModel(f));
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(run, { timeout: 2000 });
  else setTimeout(run, 300);
}
