import { GALLERY, type GalleryItem } from '../data/gallery';
import { esc, fromHTML, prefersReducedMotion, qs, qsa } from '../lib/dom';
import { pad } from '../lib/format';

const src = (file: string) => `${import.meta.env.BASE_URL}gallery/${file}`;
const EASE = 'cubic-bezier(.2,.8,.2,1)';

/**
 * The gallery section on the page: a grid of painted models and a viewer
 * that shows one at full size. A photo grows out of its tile when it opens
 * and shrinks back into it when the viewer closes.
 */
export class Gallery {
  readonly el: HTMLElement;
  private viewer: HTMLDialogElement;
  private tiles: HTMLElement[];
  private index = 0;
  private closing = false;

  constructor() {
    this.el = fromHTML(this.template());
    this.viewer = qs<HTMLDialogElement>(this.el, '.viewer');
    this.tiles = qsa(this.el, '.shot__frame');

    qsa(this.el, '.shot').forEach((btn, i) => btn.addEventListener('click', () => this.open(i)));
    qs(this.viewer, '[data-act="close"]').addEventListener('click', () => this.close());
    qs(this.viewer, '[data-act="prev"]').addEventListener('click', () => this.step(-1));
    qs(this.viewer, '[data-act="next"]').addEventListener('click', () => this.step(1));
    // a click on the backdrop, outside the figure, closes the viewer
    this.viewer.addEventListener('click', (e) => {
      if (e.target === this.viewer) this.close();
    });
    // Esc closes through the same animation
    this.viewer.addEventListener('cancel', (e) => {
      e.preventDefault();
      this.close();
    });
    this.viewer.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') this.step(-1);
      else if (e.key === 'ArrowRight') this.step(1);
    });
  }

  private open(i: number): void {
    this.show(i);
    this.viewer.showModal();
    if (prefersReducedMotion()) return;
    const photo = this.photo();
    const from = this.tiles[this.index].getBoundingClientRect();
    const grow = () => {
      const to = photo.getBoundingClientRect();
      if (!to.width) return;
      photo.animate([{ ...this.flip(from, to), opacity: 0.85 }, { transform: 'none', clipPath: 'inset(0px 0px)', opacity: 1 }], {
        duration: 320,
        easing: EASE,
      });
    };
    if (photo instanceof HTMLImageElement && !photo.complete) photo.addEventListener('load', grow, { once: true });
    else grow();
    qs(this.viewer, '.viewer__cap').animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], {
      duration: 220,
      delay: 120,
      easing: EASE,
      fill: 'backwards',
    });
    qs(this.viewer, '.viewer__close').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, delay: 120, fill: 'backwards' });
  }

  private close(): void {
    if (!this.viewer.open || this.closing) return;
    if (prefersReducedMotion()) {
      this.viewer.close();
      return;
    }
    this.closing = true;
    this.viewer.classList.add('is-closing');
    const photo = this.photo();
    const from = this.tiles[this.index].getBoundingClientRect();
    const to = photo.getBoundingClientRect();
    const tileOnScreen = from.bottom > 0 && from.top < window.innerHeight && to.width > 0;
    const frames: Keyframe[] = tileOnScreen
      ? [{ transform: 'none', clipPath: 'inset(0px 0px)' }, this.flip(from, to)]
      : [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.96)' }];
    const extras = [qs(this.viewer, '.viewer__cap'), qs(this.viewer, '.viewer__close')].map((el) =>
      el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 100, fill: 'forwards' }),
    );
    const shrink = photo.animate(frames, { duration: 260, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
    const done = () => {
      this.viewer.close();
      this.viewer.classList.remove('is-closing');
      extras.forEach((a) => a.cancel());
      shrink.cancel();
      this.closing = false;
    };
    shrink.finished.then(done, done);
  }

  /** Previous or next photo, sliding in from the side it comes from. */
  private step(d: number): void {
    if (this.closing) return;
    this.show(this.index + d);
    if (prefersReducedMotion()) return;
    this.photo().animate([{ opacity: 0, transform: `translateX(${d * 28}px)` }, { opacity: 1, transform: 'none' }], {
      duration: 200,
      easing: EASE,
    });
  }

  private photo(): HTMLElement {
    return qs(this.viewer, '.viewer__img');
  }

  /**
   * The transform and crop that put the full photo (`to`) exactly over a
   * grid tile (`from`): scaled to the tile's width and cropped to its shape,
   * the way the tile crops it.
   */
  private flip(from: DOMRect, to: DOMRect): Keyframe {
    const aspect = from.width / from.height;
    let w = to.width;
    let h = to.height;
    if (w / h > aspect) w = h * aspect;
    else h = w / aspect;
    const s = from.width / w;
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    return {
      transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${s.toFixed(4)})`,
      clipPath: `inset(${((to.height - h) / 2).toFixed(1)}px ${((to.width - w) / 2).toFixed(1)}px)`,
    };
  }

  private show(i: number): void {
    const n = GALLERY.length;
    this.index = (i + n) % n;
    const item = GALLERY[this.index];
    qs(this.viewer, '.viewer__frame').innerHTML = this.picture(item, 'viewer__img', false);
    qs(this.viewer, '.viewer__title').textContent = item.title;
    qs(this.viewer, '.viewer__meta').textContent = item.meta ?? '';
    qs(this.viewer, '.viewer__count').textContent = `${pad(this.index + 1)} / ${pad(n)}`;
    const link = qs<HTMLAnchorElement>(this.viewer, '.viewer__link');
    link.hidden = !item.link;
    if (item.link) link.href = item.link;
  }

  private picture(item: GalleryItem, cls: string, lazy = true): string {
    if (!item.image) return `<span class="${cls} is-empty" aria-hidden="true"><span>PHOTO</span></span>`;
    return `<img class="${cls}" src="${esc(src(item.image))}" alt="${esc(item.alt ?? item.title)}"${lazy ? ' loading="lazy"' : ''} decoding="async">`;
  }

  private template(): string {
    const tiles = GALLERY.map(
      (item) => `
      <li>
        <button type="button" class="shot" aria-label="View ${esc(item.title)}">
          <span class="shot__frame">${this.picture(item, 'shot__img')}</span>
          <span class="shot__cap"><b>${esc(item.title)}</b>${item.meta ? `<small>${esc(item.meta)}</small>` : ''}</span>
        </button>
      </li>`,
    ).join('');
    return /* html */ `
<section class="gallery" id="gallery" aria-labelledby="gallery-h">
  <header class="gallery__head">
    <h2 id="gallery-h">Gallery</h2>
    <span class="gallery__rule" aria-hidden="true"></span>
    <span class="gallery__count">${pad(GALLERY.length)} painted models</span>
  </header>
  <ul class="gallery__grid">${tiles}</ul>
  <dialog class="viewer" aria-labelledby="viewer-title">
    <figure class="viewer__fig">
      <div class="viewer__frame"></div>
      <figcaption class="viewer__cap">
        <span class="viewer__text"><b class="viewer__title" id="viewer-title"></b><small class="viewer__meta"></small></span>
        <a class="link viewer__link" target="_blank" rel="noopener" hidden>Watch <span aria-hidden="true">↗</span></a>
        <span class="viewer__nav">
          <button type="button" class="viewer__btn" data-act="prev" aria-label="Previous photo">←</button>
          <span class="viewer__count"></span>
          <button type="button" class="viewer__btn" data-act="next" aria-label="Next photo">→</button>
        </span>
      </figcaption>
    </figure>
    <button type="button" class="viewer__close" data-act="close" autofocus>Close <kbd>Esc</kbd></button>
  </dialog>
</section>`;
  }
}
