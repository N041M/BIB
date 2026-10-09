import * as THREE from 'three';

/**
 * What the brass reflects: the dark hall round the machine, worked out as a
 * small HDR panorama. Racks of candles burn at about head height in front of
 * the machine and to its sides, a tall window lets cold daylight in high up
 * on the right, and everything else is soot-dark stone.
 */
export function hallEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const w = 512;
  const h = 256;
  const data = new Uint16Array(w * h * 4);
  const half = THREE.DataUtils.toHalfFloat;

  // directions toward light sources: x right, y up, z toward the viewer (behind the camera)
  const candles: { d: THREE.Vector3; size: number; power: number }[] = [];
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 18; i++) {
    const yaw = (rand() * 2 - 1) * Math.PI * 0.95;
    const pitch = -0.05 + rand() * 0.32;
    candles.push({
      d: new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)),
      size: 0.05 + rand() * 0.06,
      power: 0.6 + rand() * 1.4,
    });
  }
  const windowDir = new THREE.Vector3(0.62, 0.55, -0.55).normalize();
  const fill = new THREE.Vector3(-0.4, 0.15, 0.9).normalize();

  const d = new THREE.Vector3();
  for (let y = 0; y < h; y++) {
    const lat = ((y + 0.5) / h - 0.5) * Math.PI;
    for (let x = 0; x < w; x++) {
      const lon = ((x + 0.5) / w - 0.5) * Math.PI * 2;
      d.set(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon));
      // stone: a little warmer and brighter round the horizon where the candles light it
      const horizon = Math.exp(-Math.pow(d.y - 0.05, 2) * 9);
      let cr = 0.006 + 0.03 * horizon;
      let cg = 0.004 + 0.018 * horizon;
      let cb = 0.003 + 0.009 * horizon;
      if (d.y < 0) {
        const floor = 0.6 + 0.4 * (1 + d.y);
        cr *= floor;
        cg *= floor;
        cb *= floor;
      }
      // warm bounce from the side the machine's own candle stands on
      const f = Math.max(0, d.dot(fill));
      cr += 0.06 * f ** 6;
      cg += 0.03 * f ** 6;
      cb += 0.01 * f ** 6;
      for (const c of candles) {
        const a = 1 - d.dot(c.d);
        if (a > 0.08) continue;
        const k = Math.exp(-a / (c.size * c.size * 0.5)) * c.power + Math.exp(-a / (c.size * 0.4)) * c.power * 0.04;
        cr += k;
        cg += k * 0.55;
        cb += k * 0.22;
      }
      // the window: a tall soft panel of cold light
      const wx = d.x - windowDir.x;
      const wy = d.y - windowDir.y;
      const wz = d.z - windowDir.z;
      const inWindow = Math.exp(-(wx * wx + wz * wz) / 0.012 - (wy * wy) / 0.05);
      cr += inWindow * 0.55;
      cg += inWindow * 0.62;
      cb += inWindow * 0.75;
      const i = (y * w + x) * 4;
      data[i] = half(cr);
      data[i + 1] = half(cg);
      data[i + 2] = half(cb);
      data[i + 3] = half(1);
    }
  }

  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(tex).texture;
  pmrem.dispose();
  tex.dispose();
  return env;
}
