/**
 * Pictures as the blog's printer prints them: in the type's ink, as halftone
 * dots on a grid turned 45 degrees, bigger where the picture is darker.
 * Everything here is drawn in device pixels, `ratio` to the CSS pixel.
 */

/** Distance between dots, in CSS pixels. */
const CELL = 3.1;

/**
 * Print `src` (`sw` by `sh`) as a halftone `w` by `h` CSS pixels, cropped to
 * fill. White and transparent parts get no ink. The tones are stretched so
 * the darkest part prints solid and the lightest stays bare.
 */
export function halftone(src: CanvasImageSource, sw: number, sh: number, w: number, h: number, ratio: number, ink: string): HTMLCanvasElement {
  const W = Math.max(1, Math.round(w));
  const H = Math.max(1, Math.round(h));
  const sample = document.createElement('canvas');
  sample.width = W;
  sample.height = H;
  const sg = sample.getContext('2d', { willReadFrequently: true })!;
  sg.fillStyle = '#fff';
  sg.fillRect(0, 0, W, H);
  const k = Math.max(W / sw, H / sh);
  sg.drawImage(src, (W - sw * k) / 2, (H - sh * k) / 2, sw * k, sh * k);
  const px = sg.getImageData(0, 0, W, H).data;

  const lum = new Float32Array(W * H);
  const hist = new Uint32Array(256);
  for (let i = 0; i < W * H; i++) {
    const l = (px[i * 4] * 0.3 + px[i * 4 + 1] * 0.55 + px[i * 4 + 2] * 0.15) / 255;
    lum[i] = l;
    hist[Math.min(255, Math.round(l * 255))]++;
  }
  // stretch between the 2nd and 99th percentile, so dark renders still print with some range
  const pick = (q: number) => {
    let n = 0;
    for (let i = 0; i < 256; i++) if ((n += hist[i]) >= W * H * q) return i / 255;
    return 1;
  };
  const lo = pick(0.02);
  const hi = Math.max(lo + 0.05, pick(0.99));

  const out = document.createElement('canvas');
  out.width = Math.round(w * ratio);
  out.height = Math.round(h * ratio);
  const g = out.getContext('2d')!;
  g.scale(ratio, ratio);
  g.beginPath();
  g.rect(0, 0, w, h);
  g.clip();
  g.fillStyle = ink;
  g.beginPath();
  const c = Math.cos(Math.PI / 4);
  const s = Math.sin(Math.PI / 4);
  const reach = Math.hypot(w, h) / 2 + CELL;
  for (let i = -reach; i <= reach; i += CELL) {
    for (let j = -reach; j <= reach; j += CELL) {
      const x = w / 2 + i * c - j * s;
      const y = h / 2 + i * s + j * c;
      if (x < -CELL || y < -CELL || x > w + CELL || y > h + CELL) continue;
      const l = lum[Math.min(H - 1, Math.max(0, Math.round(y))) * W + Math.min(W - 1, Math.max(0, Math.round(x)))];
      const t = Math.min(1, Math.max(0, (l - lo) / (hi - lo)));
      // midtones print a little light, so dim photos and shaded drawings do not fill in
      const dark = 1 - Math.pow(t, 0.62);
      // at full darkness neighbouring dots overlap into solid ink
      const r = CELL * 0.64 * Math.sqrt(dark);
      if (r < 0.28) continue;
      g.moveTo(x + r, y);
      g.arc(x, y, r, 0, Math.PI * 2);
    }
  }
  g.fill();
  return out;
}

/** Lines drawn in black on transparent, recoloured in the ink and laid over `under`. */
export function overlay(under: HTMLCanvasElement, lines: HTMLCanvasElement, ink: string): HTMLCanvasElement {
  const tint = document.createElement('canvas');
  tint.width = lines.width;
  tint.height = lines.height;
  const t = tint.getContext('2d')!;
  t.drawImage(lines, 0, 0);
  t.globalCompositeOperation = 'source-in';
  t.fillStyle = ink;
  t.fillRect(0, 0, tint.width, tint.height);
  const g = under.getContext('2d')!;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(tint, 0, 0, under.width, under.height);
  return under;
}
