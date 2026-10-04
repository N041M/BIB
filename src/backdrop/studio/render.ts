import { posterHeight, STILL_TIME, TALL, WIDE, type Poster } from '../posters';
import { StudioRenderer } from './renderer';

/** Samples per pixel. Enough to smooth the edges and soft shadows. */
const PASSES = 8;
const WEBP_QUALITY = 0.82;

/**
 * Renders the backdrop images and saves them into public/backdrop/ through
 * the dev server. Runs in development only, at /?render-backdrop. The dev
 * server reloads the page once the files are written, and the reload shows
 * the new images.
 *
 * For each poster it writes:
 *   <name>.webp, <name>-<width>.webp       the scene as the page shows it
 *   <name>-base.webp, <name>-base-<width>.webp   the same without the censer, smoke, flames and dust
 *   <name>-shares.png, <name>-depth.png   candle shares and depth for the live overlay
 */
export async function renderBackdrop(): Promise<void> {
  const status = document.createElement('pre');
  status.style.cssText = 'position:fixed;inset:auto 16px 16px auto;z-index:9999;margin:0;padding:12px 16px;background:#000c;color:#cfc;font:12px/1.5 monospace';
  document.body.append(status);
  const log = (line: string) => {
    status.textContent += line + '\n';
    console.info('[render-backdrop]', line);
  };

  const files: { name: string; blob: Blob }[] = [];
  const keep = async (name: string, blob: Blob) => {
    files.push({ name, blob });
    log(`  ${name}  ${Math.round(blob.size / 1024)} KB`);
  };

  const canvas = document.createElement('canvas');
  const style = getComputedStyle(document.documentElement);
  const studio = new StudioRenderer(canvas, { accent: toLinear(hex(style.getPropertyValue('--accent'))), bg: hex(style.getPropertyValue('--bg')) });

  for (const poster of [WIDE, TALL]) {
    const [full, ...smaller] = poster.widths;
    const h = posterHeight(poster, full);
    log(`${poster.name}: baking ${full}×${h}`);
    studio.resize(full, h);
    studio.bakeScene(PASSES);
    await frame();

    studio.render(STILL_TIME, { dynamic: true, grain: false });
    await keepSizes(poster, canvas, '', smaller, keep);
    studio.render(STILL_TIME, { dynamic: false, grain: false });
    await keepSizes(poster, canvas, '-base', smaller, keep);

    const maps = studio.readMaps();
    // the shares are smooth, so half the map's size is plenty
    await keep(`${poster.name}-shares.png`, await encode(halve(pixels(maps.a, maps.w, maps.h)), 'image/png'));
    await keep(`${poster.name}-depth.png`, await encode(pixels(maps.b, maps.w, maps.h), 'image/png'));
  }

  // leave the studio address first, so the reload after saving shows the page
  history.replaceState(null, '', location.pathname);
  const body = JSON.stringify(await Promise.all(files.map(async (f) => ({ name: f.name, data: await base64(f.blob) }))));
  const res = await fetch('/__backdrop', { method: 'POST', body });
  log(res.ok ? 'saved' : `saving failed: ${res.status}`);
}

type Keep = (name: string, blob: Blob) => Promise<void>;

async function keepSizes(poster: Poster, canvas: HTMLCanvasElement, suffix: string, smaller: number[], keep: Keep): Promise<void> {
  await keep(`${poster.name}${suffix}.webp`, await encode(canvas, 'image/webp'));
  for (const w of smaller) {
    const small = document.createElement('canvas');
    small.width = w;
    small.height = posterHeight(poster, w);
    const ctx = small.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canvas, 0, 0, small.width, small.height);
    await keep(`${poster.name}${suffix}-${w}.webp`, await encode(small, 'image/webp'));
  }
}

/** The raw bytes of a map as an opaque canvas, flipped from GL's bottom-up rows. */
function pixels(data: Uint8Array, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const img = new ImageData(w, h);
  for (let y = 0; y < h; y++) img.data.set(data.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  c.getContext('2d')!.putImageData(img, 0, 0);
  return c;
}

function halve(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = src.width / 2;
  c.height = src.height / 2;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

function encode(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error(`could not encode ${type}`))), type, WEBP_QUALITY));
}

async function base64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

const frame = () => new Promise((r) => setTimeout(r, 0));

function hex(value: string): [number, number, number] {
  const m = value.trim().match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return [0, 0, 0];
  return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
}

function toLinear(c: [number, number, number]): [number, number, number] {
  return c.map((v) => Math.pow(v, 2.2)) as [number, number, number];
}
