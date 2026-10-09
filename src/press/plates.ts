import * as THREE from 'three';
import { sealWax } from './materials';
import { extrude } from './shapes';

/** A colour photo pasted onto the sheet, in the space the page keeps for it. */
export interface PlateSpec {
  id: string;
  src: string;
  /** Its box in screen pixels while the paper is at its starting place. */
  x: number;
  top: number;
  w: number;
  h: number;
  /** How far it is turned, in radians, as if pasted by hand. */
  tilt: number;
}

interface Plate {
  key: string;
  spec: PlateSpec;
  obj: THREE.Group;
  dispose(): void;
}

/**
 * Photo prints stuck to the sheet with two dabs of wax. Each is a slightly
 * curled card with a white border and a glossy face, a soft shadow on the
 * parchment under it, and the wax at its top corners. They move with the
 * paper and are cut off where the paper winds round the rolls.
 */
export class Plates {
  readonly group = new THREE.Group();
  /** Keep only what is between the two rolls' axes. The constants are set every frame. */
  readonly clip = [new THREE.Plane(new THREE.Vector3(0, -1, 0), 0), new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)];
  private plates = new Map<string, Plate>();
  private wax: THREE.MeshPhysicalMaterial;
  private view = { w: 1, h: 1 };
  private shift = 0;

  constructor(private onReady: () => void) {
    this.wax = sealWax();
    this.wax.clippingPlanes = this.clip;
    this.wax.clipShadows = true;
  }

  /** Show these plates, and only these. `ratio` is the device pixels per CSS pixel their photos are drawn at. */
  set(list: PlateSpec[], view: { w: number; h: number }, ratio: number): void {
    this.view = view;
    const keep = new Set<string>();
    for (const spec of list) {
      const key = `${spec.src}|${spec.w}x${spec.h}@${ratio}`;
      keep.add(spec.id);
      const had = this.plates.get(spec.id);
      if (had && had.key === key) {
        had.spec = spec;
        continue;
      }
      had?.dispose();
      this.plates.set(spec.id, this.build(spec, key, ratio));
    }
    for (const [id, plate] of this.plates) {
      if (keep.has(id)) continue;
      plate.dispose();
      this.plates.delete(id);
    }
    this.place(this.shift);
  }

  /** The paper has moved: `shift` is added to every plate's top. */
  place(shift: number): void {
    this.shift = shift;
    for (const { spec, obj } of this.plates.values()) {
      obj.position.set(spec.x + spec.w / 2 - this.view.w / 2, this.view.h / 2 - (spec.top + shift + spec.h / 2), 0);
    }
  }

  /** Where the paper meets the rolls, in world space: nothing above `top` or below `bottom` shows. */
  clipTo(top: number, bottom: number): void {
    this.clip[0].constant = top;
    this.clip[1].constant = -bottom;
  }

  private build(spec: PlateSpec, key: string, ratio: number): Plate {
    const obj = new THREE.Group();
    obj.rotation.z = spec.tilt;
    this.group.add(obj);
    let photo: THREE.MeshPhysicalMaterial | undefined;
    let texture: THREE.Texture | undefined;
    const geometries: THREE.BufferGeometry[] = [];

    // the card, its corners lifting a little off the sheet
    const card = new THREE.PlaneGeometry(spec.w, spec.h, 16, 16);
    const pos = card.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const nx = pos.getX(i) / (spec.w / 2);
      const ny = pos.getY(i) / (spec.h / 2);
      pos.setZ(i, 1.2 + 2.4 * ((nx ** 4 + ny ** 4) / 2) + 0.8 * nx * nx * ny * ny);
    }
    card.computeVertexNormals();
    geometries.push(card);

    // its shadow on the parchment, soft and a little down and to the right
    const shadowGeo = new THREE.PlaneGeometry(spec.w + 28, spec.h + 28);
    geometries.push(shadowGeo);
    const shade = shadowTexture(spec.w, spec.h, 14);
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x1c0e05, alphaMap: shade, transparent: true, opacity: 0.6, depthWrite: false, clippingPlanes: this.clip });
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.position.set(3, -5, 0.3);
    obj.add(shadow);

    // two dabs of wax hold the top corners
    for (const side of [-1, 1]) {
      const blob = new THREE.Shape();
      for (let i = 0; i <= 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const k = 6.5 * (1 + 0.12 * Math.sin(a * 3 + side * 2) + 0.06 * Math.sin(a * 5 + 1));
        if (i === 0) blob.moveTo(Math.cos(a) * k, Math.sin(a) * k);
        else blob.lineTo(Math.cos(a) * k, Math.sin(a) * k);
      }
      const geo = extrude(blob, 1.2, 1.8, 3);
      geometries.push(geo);
      const dab = new THREE.Mesh(geo, this.wax);
      dab.position.set(side * (spec.w / 2 - 5), spec.h / 2 - 5, 3.2);
      dab.castShadow = true;
      obj.add(dab);
    }

    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      if (!obj.parent) return;
      texture = new THREE.CanvasTexture(printCanvas(img, spec.w, spec.h, ratio));
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
      photo = new THREE.MeshPhysicalMaterial({
        map: texture,
        roughness: 0.55,
        metalness: 0,
        clearcoat: 0.55,
        clearcoatRoughness: 0.32,
        clippingPlanes: this.clip,
        clipShadows: true,
      });
      const mesh = new THREE.Mesh(card, photo);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      obj.add(mesh);
      this.onReady();
    };
    img.src = spec.src;

    return {
      key,
      spec,
      obj,
      dispose: () => {
        this.group.remove(obj);
        img.onload = null;
        geometries.forEach((g) => g.dispose());
        shadowMat.dispose();
        shade.dispose();
        photo?.dispose();
        texture?.dispose();
      },
    };
  }
}

/** The face of the print: the photo cropped to fill, inside an off-white border, a little yellowed and faded at the edges. */
function printCanvas(img: HTMLImageElement, w: number, h: number, ratio: number): HTMLCanvasElement {
  const scale = Math.min(ratio, 2048 / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  const g = c.getContext('2d')!;
  g.scale(scale, scale);
  const paper = g.createLinearGradient(0, 0, w, h);
  paper.addColorStop(0, '#ece4d2');
  paper.addColorStop(1, '#ddd1b8');
  g.fillStyle = paper;
  g.fillRect(0, 0, w, h);

  const b = Math.max(7, Math.round(w * 0.028));
  const iw = w - 2 * b;
  const ih = h - 2 * b - b * 0.6;
  const k = Math.max(iw / img.naturalWidth, ih / img.naturalHeight);
  const sw = iw / k;
  const sh = ih / k;
  g.save();
  g.beginPath();
  g.rect(b, b, iw, ih);
  g.clip();
  g.filter = 'saturate(0.82) contrast(1.06) sepia(0.12)';
  g.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, b, b, iw, ih);
  g.filter = 'none';
  // the print has faded toward its edges
  const fade = g.createRadialGradient(w / 2, b + ih / 2, Math.min(iw, ih) * 0.35, w / 2, b + ih / 2, Math.hypot(iw, ih) * 0.6);
  fade.addColorStop(0, 'rgba(255, 236, 200, 0)');
  fade.addColorStop(1, 'rgba(120, 80, 40, 0.28)');
  g.fillStyle = fade;
  g.fillRect(b, b, iw, ih);
  g.restore();
  g.strokeStyle = 'rgba(40, 28, 16, 0.35)';
  g.lineWidth = 0.6;
  g.strokeRect(b, b, iw, ih);
  return c;
}

/** A soft shadow the size of a `w` by `h` card, with `pad` pixels round it for the blur, as an alpha map. */
function shadowTexture(w: number, h: number, pad: number): THREE.CanvasTexture {
  const s = 0.25;
  const c = document.createElement('canvas');
  c.width = Math.ceil((w + 2 * pad) * s);
  c.height = Math.ceil((h + 2 * pad) * s);
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, c.width, c.height);
  g.filter = `blur(${5 * s}px)`;
  g.fillStyle = '#fff';
  g.fillRect(pad * s, pad * s, w * s, h * s);
  return new THREE.CanvasTexture(c);
}
