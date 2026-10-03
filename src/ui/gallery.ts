import { GALLERY, type GalleryItem } from '../data/gallery';
import { esc, fromHTML, qs, qsa } from '../lib/dom';
import { pad } from '../lib/format';

const src = (file: string) => `${import.meta.env.BASE_URL}gallery/${file}`;

/** The gallery section on the page: a grid of painted models and a viewer that shows one at full size. */
export class Gallery {
  readonly el: HTMLElement;
  private viewer: HTMLDialogElement;
  private index = 0;

  constructor() {
    this.el = fromHTML(this.template());
    this.viewer = qs<HTMLDialogElement>(this.el, '.viewer');

    qsa(this.el, '.shot').forEach((btn, i) => btn.addEventListener('click', () => this.open(i)));
    qs(this.viewer, '[data-act="close"]').addEventListener('click', () => this.viewer.close());
    qs(this.viewer, '[data-act="prev"]').addEventListener('click', () => this.show(this.index - 1));
    qs(this.viewer, '[data-act="next"]').addEventListener('click', () => this.show(this.index + 1));
    // a click on the backdrop, outside the figure, closes the viewer
    this.viewer.addEventListener('click', (e) => {
      if (e.target === this.viewer) this.viewer.close();
    });
    this.viewer.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') this.show(this.index - 1);
      else if (e.key === 'ArrowRight') this.show(this.index + 1);
    });
  }

  private open(i: number): void {
    this.show(i);
    this.viewer.showModal();
  }

  private show(i: number): void {
    const n = GALLERY.length;
    this.index = (i + n) % n;
    const item = GALLERY[this.index];
    qs(this.viewer, '.viewer__frame').innerHTML = this.picture(item, 'viewer__img');
    qs(this.viewer, '.viewer__title').textContent = item.title;
    qs(this.viewer, '.viewer__meta').textContent = item.meta ?? '';
    qs(this.viewer, '.viewer__count').textContent = `${pad(this.index + 1)} / ${pad(n)}`;
    const link = qs<HTMLAnchorElement>(this.viewer, '.viewer__link');
    link.hidden = !item.link;
    if (item.link) link.href = item.link;
  }

  private picture(item: GalleryItem, cls: string): string {
    if (!item.image) return `<span class="${cls} is-empty" aria-hidden="true"><span>PHOTO</span></span>`;
    return `<img class="${cls}" src="${esc(src(item.image))}" alt="${esc(item.alt ?? item.title)}" loading="lazy" decoding="async">`;
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
    <button type="button" class="viewer__close" data-act="close">Close <kbd>Esc</kbd></button>
  </dialog>
</section>`;
  }
}
