import '@fontsource/cinzel/500.css';
import '@fontsource/cinzel/600.css';
import '@fontsource/eb-garamond/500.css';
import '@fontsource/eb-garamond/500-italic.css';
import '../styles/blog.css';
import { BRAND } from '../config';
import { POSTS, postBySlug, type Block, type Post } from '../data/posts';
import { fromHTML, h, prefersReducedMotion, qs, qsa } from '../lib/dom';
import { easeOutCubic, Sequence, tween } from '../lib/sequence';
import { Press, type PlateSpec, type PressLayout } from '../press';
import { halftone, overlay } from './blog-pictures';

export interface BlogCallbacks {
  /** Esc was pressed while the blog was open. */
  onEscape: () => void;
}

type View = { kind: 'index' } | { kind: 'post'; post: Post };

/** A run of text in a line, where the page put it, and the font it is set in. */
interface Run {
  node: Text;
  /** The link the run is part of, if any. */
  link: HTMLAnchorElement | null;
  /** Font size in CSS pixels, for placing a link's underline. */
  size: number;
  /** Left edge on screen. */
  x: number;
  font: string;
  /** From the top of the line to the baseline. */
  base: number;
}

/** A line of type, a rule, or a strip of a printed picture, on the paper. */
interface Item {
  el: HTMLElement;
  /** Its box on the page with no blank paper above it and the page scrolled to the top, in CSS pixels. */
  top: number;
  left: number;
  width: number;
  height: number;
  /** Where its centre sits, measured from the top of the scroll area. */
  mid: number;
  runs: Run[];
  /** Wound onto one of the rolls. */
  hidden: boolean;
}

/** A post in the list: the frame printed round it, and the lines inside it. */
interface Frame {
  el: HTMLElement;
  /** Its box with the paper at its starting place, like an item's. */
  top: number;
  left: number;
  width: number;
  height: number;
  /** The first and last of its lines in `items`. */
  first: number;
  last: number;
}

/** How a kind of line is set: its font for measuring, from the stylesheet. */
type Kind = 'body' | 'meta' | 'strong' | 'title' | 'caption';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** Height of one strip of a printed picture. */
const STRIP = 5;
/** How long one character takes to type in a title, in ms. */
const KEY_MS = 38;
/** How long fresh ink stays wet and heavy after a key strikes, in ms. */
const WET_MS = 380;
/** How much narrower than the column a pasted photo is, on each side. */
const PLATE_INSET = 14;
/** Room between a post's frame in the list and the type inside it. */
const ENTRY_PAD = { x: 24, y: 18, narrow: 14 };

/**
 * The blog as a sheet of paper running between two rolls. The paper comes out
 * from under the bottom roll past the print head and goes under the top roll,
 * so scrolling moves the paper and the page stays still. A new page is
 * printed line by line at the head and fed up into place.
 *
 * The machine is a three.js scene (src/press). The text is real text in an
 * ordinary scroll container that covers the whole view, so the wheel and
 * touch move the paper wherever they land, and selection, links and screen
 * readers work as usual. That text is transparent. Each frame, the lines that
 * are on the sheet are drawn into a canvas in the same places, and the scene
 * prints that canvas onto the parchment.
 */
export class Blog {
  readonly el: HTMLElement;
  private press: Press;
  /** The part of the view between the top of the upper roll and the bottom of the lower one. */
  private frame: HTMLElement;
  /** The link to the main page, laid over the servo skull and its placard. */
  private back: HTMLElement;
  private scroller: HTMLElement;
  private sheet: HTMLElement;
  private items: Item[] = [];
  private frames: Frame[] = [];
  /** Items before this index have been printed. Printing always runs top to bottom. */
  private inked = 0;
  private view?: View;
  private open = false;
  /** Bumped on every show and hide, so a superseded print stops where it is. */
  private gen = 0;
  /** The layout the scene and the ink canvas were last built for. */
  private dressed = '';
  private seq?: Sequence;
  /** Lines are printed as the reader scrolls them past the head. Off while a page prints itself. */
  private autoInk = false;
  /** Blank paper added above the page while it prints, so its first line can start at the head. */
  private lead = 0;
  /** How far the old page has been fed up and away before the next one prints. */
  private slide = 0;
  /** Keeps the parchment from jumping when one page is swapped for the next. */
  private base = 0;
  /** The width of the column the type is set in. */
  private width = 600;
  /** Where the frame starts in the scroll area, and its height. */
  private top = 0;
  private height = 0;
  /** The frame size the lines were set for. */
  private size = '';
  /** Radius of both rolls. */
  private radius = 32;
  /** How far above the bottom roll lines are printed: just above the top edge of the print head. */
  private headGap = 18;
  private timers: number[] = [];

  /* the ink canvas */
  private ink = document.createElement('canvas');
  private pen = this.ink.getContext('2d')!;
  private inkRect = { x: 0, y: 0, w: 1, h: 1 };
  private dirty = true;
  private scrolled = false;
  /** When each freshly struck line was struck. */
  private strikes = new Map<HTMLElement, number>();
  /** Printed pictures, drawn once for each size, keyed by source and size. */
  private art = new Map<string, HTMLCanvasElement | null>();
  private colours = { ink: '', dim: '', red: '' };

  constructor(cb: BlogCallbacks) {
    this.el = fromHTML(TEMPLATE);
    this.frame = qs(this.el, '.blog__frame');
    this.back = qs(this.el, '.blog__back');
    this.scroller = qs(this.el, '.blog__scroll');
    this.sheet = qs(this.el, '.sheet');
    this.press = new Press();
    if (this.press.supported) {
      qs(this.el, '.blog__view').append(this.press.canvas);
      this.press.onFrame = (now) => this.frameDrawn(now);
    } else {
      this.el.classList.add('is-flat');
    }

    this.scroller.addEventListener(
      'scroll',
      () => {
        this.scrolled = true;
        this.press.invalidate();
      },
      { passive: true },
    );
    for (const [type, on] of [
      ['pointerenter', true],
      ['pointerleave', false],
      ['focus', true],
      ['blur', false],
    ] as const) {
      this.back.addEventListener(type, () => this.press.setBackHover(on));
    }
    // hovered and focused entries print in red, so the canvas follows them
    for (const type of ['pointerover', 'pointerout', 'focusin', 'focusout']) {
      this.sheet.addEventListener(type, () => this.redraw());
    }
    document.addEventListener('keydown', (e) => {
      if (this.open && e.key === 'Escape') cb.onEscape();
    });
    let pending = 0;
    new ResizeObserver(() => {
      if (!this.open || pending) return;
      pending = requestAnimationFrame(() => {
        pending = 0;
        this.rewrap();
      });
    }).observe(this.frame);
  }

  get isOpen(): boolean {
    return this.open;
  }

  /** Open on the list of posts, or on one post. `instant` skips the camera move, for a page load that starts here. */
  async show(slug?: string, opts: { instant?: boolean } = {}): Promise<void> {
    const post = slug ? postBySlug(slug) : undefined;
    const view: View = post ? { kind: 'post', post } : { kind: 'index' };
    if (this.open && this.view && same(this.view, view)) return;
    const gen = ++this.gen;
    this.seq?.skip();
    const reduced = prefersReducedMotion();
    await Promise.all(FONTS.map((f) => document.fonts.load(f))).catch(() => undefined);
    if (gen !== this.gen) return;

    if (!this.open) {
      this.open = true;
      this.timers.forEach((t) => window.clearTimeout(t));
      document.documentElement.classList.add('is-blog');
      this.el.classList.add('is-shown');
      this.el.classList.toggle('is-instant', !!opts.instant || reduced);
      void this.el.offsetWidth;
      this.el.classList.add('is-open');
      this.dress();
      this.slide = 0;
      this.layout(view);
      this.prepareLead(reduced);
      this.press.open(!!opts.instant || reduced);
      this.scroller.focus({ preventScroll: true });
      // the camera turns and the machine rises with blank paper before it prints
      if (!opts.instant && !reduced) await new Promise((r) => window.setTimeout(r, 1150));
    } else {
      await this.feedOut(reduced);
      if (gen !== this.gen) return;
      const was = this.paperOffset();
      this.slide = 0;
      this.layout(view);
      this.prepareLead(reduced);
      this.base += was - this.paperOffset();
      this.scroller.focus({ preventScroll: true });
    }
    if (gen !== this.gen) return;
    await this.print(reduced, gen);
  }

  /** Lower the machine and turn back to the hall. */
  hide(): void {
    if (!this.open) return;
    this.open = false;
    ++this.gen;
    this.seq?.skip();
    const reduced = prefersReducedMotion();
    this.el.classList.toggle('is-instant', reduced);
    this.el.classList.remove('is-open');
    this.press.close(reduced);
    if (this.el.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
    this.timers = [
      window.setTimeout(() => document.documentElement.classList.remove('is-blog'), reduced ? 0 : 700),
      window.setTimeout(
        () => {
          this.el.classList.remove('is-shown');
          this.press.stop();
          this.press.setPlates([]);
          this.view = undefined;
          this.items = [];
          this.sheet.replaceChildren();
        },
        reduced ? 0 : 1400,
      ),
    ];
  }

  /** Build the machine and compile its shaders before the blog is opened, so opening it does not wait for them. */
  prepare(): void {
    this.dress();
    void this.press.warm();
  }

  /* ───────────── layout ───────────── */

  /** Set the page in the paper's width and lay it out flat, unprinted, at the top. */
  private layout(view: View): void {
    this.view = view;
    this.top = this.frame.offsetTop;
    this.height = this.frame.clientHeight;
    const fit = this.fittings();
    this.radius = fit.radius;
    // the head and its cresting rise this far above the roll it overlaps by 8px (see buildMachine in src/press/machine.ts)
    this.headGap = fit.head - 8 + 2;
    this.setLead(0);

    const cs = getComputedStyle(this.sheet);
    this.width = this.sheet.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    this.size = `${this.frame.clientWidth}x${this.height}`;
    const blog = getComputedStyle(this.el);
    this.colours = {
      ink: blog.getPropertyValue('--type').trim(),
      dim: blog.getPropertyValue('--type-dim').trim(),
      red: blog.getPropertyValue('--type-red').trim(),
    };

    const set = this.typesetter();
    this.sheet.replaceChildren(...(view.kind === 'post' ? postPage(view.post, set) : indexPage(set)));
    this.scroller.setAttribute('aria-label', view.kind === 'post' ? view.post.title : 'Blog posts');
    this.scroller.scrollTop = 0;

    const top = this.scroller.getBoundingClientRect().top;
    const fonts = new Map<string, { font: string; base: number; size: number }>();
    const range = document.createRange();
    this.items = qsa(this.sheet, '.ln, .strip').map((el) => {
      const r = el.getBoundingClientRect();
      const runs: Run[] = [];
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let node = walk.nextNode() as Text | null; node; node = walk.nextNode() as Text | null) {
        const parent = node.parentElement ?? el;
        const style = getComputedStyle(parent);
        const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        const key = `${font}/${style.lineHeight}`;
        let f = fonts.get(key);
        if (!f) {
          this.pen.font = font;
          const m = this.pen.measureText('Hg');
          const size = parseFloat(style.fontSize);
          const ascent = m.fontBoundingBoxAscent ?? size * 0.8;
          const descent = m.fontBoundingBoxDescent ?? size * 0.2;
          f = { font, base: (parseFloat(style.lineHeight) - ascent - descent) / 2 + ascent, size };
          fonts.set(key, f);
        }
        range.selectNodeContents(node);
        const link = parent.closest<HTMLAnchorElement>('a.ln__link');
        runs.push({ node, link, size: f.size, x: range.getBoundingClientRect().left, font: f.font, base: f.base });
      }
      return { el, top: r.top - top, left: r.left, width: r.width, height: r.height, mid: r.top - top + r.height / 2, runs, hidden: false };
    });
    this.frames = qsa(this.sheet, '.entry').map((el) => {
      const r = el.getBoundingClientRect();
      const first = this.items.findIndex((it) => el.contains(it.el));
      let last = first;
      while (last + 1 < this.items.length && el.contains(this.items[last + 1].el)) last++;
      return { el, top: r.top - top, left: r.left, width: r.width, height: r.height, first, last };
    });
    this.inked = 0;
    this.autoInk = false;
    this.strikes.clear();
    this.preparePictures(top);
    this.redraw();
  }

  /**
   * Measuring for the page builders: the column's width, and how wide a piece
   * of text is in each kind of line, measured in the fonts the stylesheet sets.
   */
  private typesetter(): Typesetter {
    const fonts = new Map<Kind, string>();
    for (const kind of ['body', 'meta', 'strong', 'title', 'caption'] as Kind[]) {
      const probe = h('span', { class: kind === 'body' ? 'ln' : `ln ln--${kind}` }, 'x');
      this.sheet.append(probe);
      const style = getComputedStyle(probe);
      fonts.set(kind, `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`);
      probe.remove();
    }
    const measure = (kind: Kind, text: string) => {
      this.pen.font = fonts.get(kind)!;
      return this.pen.measureText(text).width;
    };
    return { width: this.width, measure };
  }

  /** The window changed size: set the page again and keep the reader's place. */
  private rewrap(): void {
    if (!this.view || `${this.frame.clientWidth}x${this.frame.clientHeight}` === this.size) return;
    ++this.gen;
    this.seq?.skip();
    const before = this.scroller.scrollHeight - this.scroller.clientHeight - this.lead;
    const f = before > 0 ? Math.max(0, this.scroller.scrollTop - this.lead) / before : 0;
    this.dress();
    this.layout(this.view);
    this.scroller.scrollTop = f * (this.scroller.scrollHeight - this.scroller.clientHeight);
    this.restoreTyped();
    this.autoInk = true;
    this.update(false);
  }

  /** Sizes of the rolls and the print head for this screen, in CSS pixels. */
  private fittings(): { compact: boolean; radius: number; head: number } {
    const compact = window.innerWidth <= 600;
    const radius = Math.round(Math.min(38, Math.max(24, window.innerHeight * 0.04)));
    return { compact, radius, head: compact ? 16 : 44 };
  }

  /** Build the scene for this screen and size the ink canvas to the frame, unless both are done already. */
  private dress(): void {
    if (!this.press.supported) return;
    const f = this.frame.getBoundingClientRect();
    const fit = this.fittings();
    const L: PressLayout = {
      w: this.el.clientWidth,
      h: this.el.clientHeight,
      left: f.left,
      right: f.right,
      top: f.top,
      bottom: f.bottom,
      radius: fit.radius,
      head: fit.head,
      compact: fit.compact,
    };
    const ratio = this.press.ratio;
    const key = `${JSON.stringify(L)}@${ratio}`;
    if (key === this.dressed) return;
    this.dressed = key;
    this.el.style.setProperty('--r', `${fit.radius}px`);
    this.press.layout(L);
    const box = this.press.backBox;
    if (box) Object.assign(this.back.style, { left: `${box.x}px`, top: `${box.y}px`, width: `${box.w}px`, height: `${box.h}px` });

    // the canvas starts on a device pixel, so the type maps onto the screen one texel to one pixel
    const x = Math.floor(L.left * ratio) / ratio;
    const y = Math.floor(L.top * ratio) / ratio;
    const w = Math.ceil((L.right - x) * ratio);
    const hh = Math.ceil((L.bottom - y) * ratio);
    if (this.ink.width !== w || this.ink.height !== hh) {
      this.ink.width = w;
      this.ink.height = hh;
    }
    this.inkRect = { x, y, w: w / ratio, h: hh / ratio };
    this.press.setInk(this.ink, this.inkRect);
    this.redraw();
  }

  private setLead(px: number): void {
    this.lead = px;
    this.sheet.style.setProperty('--lead', `${px}px`);
  }

  /** Add blank paper above the page so its first line sits just below the print head. */
  private prepareLead(skip: boolean): void {
    if (skip || !this.items.length) return this.update(false);
    const head = this.height - 2 * this.radius - this.headGap;
    this.setLead(Math.max(0, Math.round(head - (this.items[0].mid - this.top) + 14)));
    this.update(false);
  }

  /** How far the paper has moved under the type since the blog was built. */
  private paperOffset(): number {
    return this.base + this.scroller.scrollTop - this.lead + this.slide;
  }

  /* ───────────── pictures ───────────── */

  /**
   * Pasted photos go to the scene as plates. Printed photos and drawings are
   * drawn as halftones in the ink, once for each size, and printed strip by
   * strip like the lines of type.
   */
  private preparePictures(top: number): void {
    const ratio = this.press.ratio;
    const plates: PlateSpec[] = [];
    qsa(this.sheet, '.photo').forEach((photo, i) => {
      const r = photo.getBoundingClientRect();
      const kind = photo.dataset.kind;
      if (kind === 'plate') {
        const h = Number(photo.dataset.height);
        plates.push({ id: `p${i}`, src: photo.dataset.src!, x: r.left + PLATE_INSET, top: r.top - top + 6, w: r.width - 2 * PLATE_INSET, h, tilt: i % 2 ? 0.012 : -0.016 });
        return;
      }
      const key = artKey(photo, r.width, ratio);
      photo.dataset.art = key;
      if (this.art.has(key)) return;
      this.art.set(key, null);
      const w = r.width;
      const h = Number(photo.dataset.height);
      const done = (canvas: HTMLCanvasElement) => {
        this.art.set(key, canvas);
        this.redraw();
      };
      const ink = this.colours.ink;
      if (kind === 'drawing') {
        this.press
          .drawModel(photo.dataset.file!, Math.round(w * ratio), Math.round(h * ratio))
          .then((d) => done(overlay(halftone(d.shade, d.shade.width, d.shade.height, w, h, ratio, ink), d.lines, ink)))
          .catch((err) => console.warn('[blog] could not draw', photo.dataset.file, err));
      } else {
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => done(halftone(img, img.naturalWidth, img.naturalHeight, w, h, ratio, ink));
        img.src = photo.dataset.src!;
      }
    });
    this.press.setPlates(plates);
  }

  /* ───────────── printing ───────────── */

  /**
   * Print the first screenful at the head, feeding the paper up one line at a
   * time until the top of the page is in place. Any key, wheel or touch
   * finishes it at once.
   */
  private async print(skip: boolean, gen: number): Promise<void> {
    const head = this.height - 2 * this.radius - this.headGap;
    const count = this.items.findIndex((it) => it.mid - this.top >= head);
    const shown = count < 0 ? this.items.length : count;

    const seq = (this.seq = new Sequence());
    if (skip) seq.skip();
    const stop = new AbortController();
    for (const type of ['wheel', 'touchstart', 'pointerdown', 'keydown']) {
      this.el.addEventListener(type, () => seq.skip(), { signal: stop.signal, passive: true });
    }

    for (let i = 0; i < shown && !seq.skipped; i++) {
      const it = this.items[i];
      await this.feedTo(it.mid + this.lead - this.top - head + 1, seq);
      if (seq.skipped) break;
      const text = it.el.dataset.text;
      if (text !== undefined) {
        it.el.textContent = '';
        this.inkTo(i + 1, true);
        for (let n = 1; n <= text.length && !seq.skipped; n++) {
          it.el.textContent = text.slice(0, n);
          this.strikes.set(it.el, performance.now());
          this.redraw();
          await seq.wait(text[n - 1] === ' ' ? KEY_MS / 2 : KEY_MS);
        }
        await seq.wait(90);
      } else {
        this.inkTo(i + 1, true);
        await seq.wait(it.el.classList.contains('strip') ? 4 : 8);
      }
    }
    if (!seq.skipped) await this.feedTo(this.lead, seq);
    stop.abort();
    if (gen !== this.gen) return;

    if (seq.skipped) this.scroller.scrollTop = this.lead;
    this.restoreTyped();
    this.inkTo(shown, false);
    // take the blank paper away again and scroll by the same amount, so nothing moves on screen
    const lead = this.lead;
    this.setLead(0);
    this.scroller.scrollTop = Math.max(0, this.scroller.scrollTop - lead);
    this.autoInk = true;
    this.update(false);
  }

  private feedTo(to: number, seq: Sequence): Promise<void> {
    const from = this.scroller.scrollTop;
    const d = to - from;
    if (Math.abs(d) < 0.5) return Promise.resolve();
    return tween(
      Math.min(150, 20 + Math.abs(d) * 1.1),
      (t) => {
        this.scroller.scrollTop = from + d * t;
        this.update(true);
      },
      easeOutCubic,
      seq,
    );
  }

  /** Lines typed one key at a time get their full text back. */
  private restoreTyped(): void {
    qsa(this.sheet, '[data-text]').forEach((el) => (el.textContent = el.dataset.text ?? ''));
    this.redraw();
  }

  /** Print every item before `end`. Only items the reader can see are struck wet. */
  private inkTo(end: number, strike: boolean): void {
    const now = performance.now();
    while (this.inked < end && this.inked < this.items.length) {
      const el = this.items[this.inked++].el;
      el.classList.add('is-inked');
      if (strike) this.strikes.set(el, now);
      else el.classList.add('is-quiet');
    }
    this.redraw();
  }

  /** Feed the old page up under the top roll before the next one prints. */
  private async feedOut(reduced: boolean): Promise<void> {
    if (reduced) return;
    const from = this.slide;
    const to = this.height * 0.8;
    await tween(
      380,
      (t) => {
        this.slide = from + (to - from) * t;
        this.redraw();
      },
      (t) => t * t,
    );
  }

  /* ───────────── the rolls ───────────── */

  /**
   * Print the lines that have come out past the head, and hide the lines that
   * have gone under a roll, so they cannot be clicked or selected there.
   */
  private update(strike: boolean): void {
    const st = this.scroller.scrollTop;
    const r = this.radius;
    const head = this.height - 2 * r - this.headGap;
    // where an item sits in the frame is its place on the paper plus this
    const shift = this.lead - st - this.top;
    if (this.autoInk) {
      let end = this.inked;
      while (end < this.items.length && this.items[end].mid + shift < head) end++;
      // lines that went past out of sight, after a jump to the end, are printed without the strike
      while (this.inked < end) {
        const it = this.items[this.inked];
        this.inkTo(this.inked + 1, strike && it.mid + shift > 2 * r);
      }
    }

    // the rolls cover the paper down to their centre lines, so anything past those is wound on
    for (const it of this.items) {
      const v = it.mid + shift;
      const hidden = v < r || v > this.height - r;
      if (hidden !== it.hidden) {
        it.el.style.visibility = hidden ? 'hidden' : '';
        it.hidden = hidden;
      }
    }
    this.redraw();
  }

  /* ───────────── the ink ───────────── */

  private redraw(): void {
    this.dirty = true;
    this.press.invalidate();
  }

  /** The scene is about to draw a frame: bring the type and the paper's position up to date. */
  private frameDrawn(now: number): void {
    if (this.scrolled) {
      this.scrolled = false;
      this.update(true);
    }
    this.press.setPaper(this.paperOffset(), this.lead - this.scroller.scrollTop - this.slide);
    if (!this.dirty) return;
    this.dirty = false;
    this.paint(now);
    this.press.inkChanged();
  }

  /** Draw what is printed on the sheet into the ink canvas, where the page's own text sits. */
  private paint(now: number): void {
    const pen = this.pen;
    const ratio = this.press.ratio;
    const R = this.inkRect;
    const C = this.colours;
    pen.setTransform(1, 0, 0, 1, 0, 0);
    pen.clearRect(0, 0, this.ink.width, this.ink.height);
    pen.setTransform(ratio, 0, 0, ratio, -R.x * ratio, -R.y * ratio);
    pen.textBaseline = 'alphabetic';
    pen.lineJoin = 'round';

    const shift = this.lead - this.scroller.scrollTop - this.slide;
    const active = document.activeElement;
    const focused = active instanceof HTMLElement && this.sheet.contains(active) ? active : null;
    let wet = false;
    for (const f of this.frames) this.paintFrame(f, shift, focused);
    for (const it of this.items) {
      const y = it.top + shift;
      if (y + it.height < R.y || y > R.y + R.h) continue;
      const el = it.el;
      if (!el.classList.contains('is-inked')) continue;
      if (el.classList.contains('strip')) {
        this.paintStrip(it, y);
        continue;
      }
      if (el.classList.contains('ln--rule')) {
        this.paintRule(it, y, C.dim);
        continue;
      }
      // under the pointer or the keyboard, a post's title and its link line print red, and so does the back link
      const lit = el.matches('.entry:hover .ln--strong, .ln--link:hover') || (!!focused && focused.contains(el) && !el.matches('.entry .ln:not(.ln--strong)'));
      const colour = lit || el.matches('.ln--title, .ln--more') ? C.red : el.matches('.ln--meta, .ln--caption') ? C.dim : C.ink;
      const strong = el.matches('.ln--title, .ln--strong');
      pen.fillStyle = colour;
      pen.strokeStyle = colour;
      // a firm strike: the ink spreads a little past each letter's outline
      pen.lineWidth = strong ? 0.25 : 0.35;
      const struck = this.strikes.get(el);
      const fresh = struck === undefined ? 0 : Math.max(0, 1 - (now - struck) / WET_MS);
      if (struck !== undefined && fresh === 0) this.strikes.delete(el);
      if (fresh > 0) {
        // the key leaves heavy ink that spreads a little, then settles
        wet = true;
        pen.shadowColor = colour;
        pen.shadowBlur = 1.4 * fresh * ratio;
      }
      // a line being typed has lost its measured text node, so it is drawn from its text in the first run's place
      const runs = el.dataset.text !== undefined && it.runs.length ? [{ ...it.runs[0], text: el.textContent ?? '' }] : it.runs.map((r) => ({ ...r, text: r.node.data }));
      for (const run of runs) {
        if (!run.text.trim()) continue;
        pen.font = run.font;
        // a link in the text prints red over a thin rule, which thickens under the pointer or the keyboard
        const hot = !!run.link && (run.link.matches(':hover') || focused === run.link);
        const ink = run.link ? C.red : colour;
        pen.fillStyle = ink;
        pen.strokeStyle = ink;
        if (hot) pen.lineWidth = 0.7;
        pen.fillText(run.text, run.x, y + run.base);
        pen.strokeText(run.text, run.x, y + run.base);
        if (hot) pen.lineWidth = strong ? 0.25 : 0.35;
        if (run.link) {
          const lead = run.text.length - run.text.trimStart().length;
          const x0 = run.x + (lead ? pen.measureText(run.text.slice(0, lead)).width : 0);
          const w = pen.measureText(run.text.trim()).width;
          pen.fillRect(x0, y + run.base + run.size * 0.14, w, hot ? 2 : 0.8);
        }
      }
      pen.shadowBlur = 0;
    }

    if (focused?.matches(':focus-visible') && !focused.classList.contains('entry')) {
      const r = focused.getBoundingClientRect();
      pen.strokeStyle = C.ink;
      pen.lineWidth = 1;
      pen.setLineDash([3, 3]);
      pen.strokeRect(r.left - 4.5, r.top - 4.5, r.width + 9, r.height + 9);
      pen.setLineDash([]);
    }
    if (wet) this.dirty = true;
  }

  /**
   * The frame round a post in the list: a double rule with a diamond at each
   * corner. It is printed down to the post's last printed line, so it comes
   * out of the head with the type. It turns red under the pointer or the
   * keyboard, with the post's title.
   */
  private paintFrame(f: Frame, shift: number, focused: HTMLElement | null): void {
    const items = this.items;
    if (f.first < 0 || !items[f.first].el.classList.contains('is-inked')) return;
    let done = f.first;
    while (done < f.last && items[done + 1].el.classList.contains('is-inked')) done++;
    const y = f.top + shift;
    const bottom = done === f.last ? y + f.height : items[done].top + shift + items[done].height;
    const R = this.inkRect;
    if (bottom < R.y || y > R.y + R.h) return;
    const lit = f.el.matches(':hover') || focused === f.el;
    const pen = this.pen;
    pen.save();
    pen.beginPath();
    pen.rect(f.left - 6, y - 6, f.width + 12, bottom - y + 6);
    pen.clip();
    pen.strokeStyle = lit ? this.colours.red : this.colours.dim;
    pen.fillStyle = pen.strokeStyle;
    pen.lineWidth = lit ? 1.4 : 1;
    pen.strokeRect(f.left + 0.5, y + 0.5, f.width - 1, f.height - 1);
    pen.lineWidth = 0.6;
    pen.strokeRect(f.left + 4, y + 4, f.width - 8, f.height - 8);
    for (const [cx, cy] of [
      [f.left, y],
      [f.left + f.width, y],
      [f.left, y + f.height],
      [f.left + f.width, y + f.height],
    ]) {
      pen.beginPath();
      pen.moveTo(cx, cy - 4.5);
      pen.lineTo(cx + 4.5, cy);
      pen.lineTo(cx, cy + 4.5);
      pen.lineTo(cx - 4.5, cy);
      pen.closePath();
      pen.fill();
    }
    pen.restore();
  }

  /** A double rule across the column with a small diamond in its middle. */
  private paintRule(it: Item, y: number, colour: string): void {
    const pen = this.pen;
    const mid = y + it.height / 2;
    const cx = it.left + it.width / 2;
    pen.fillStyle = colour;
    pen.fillRect(it.left, mid - 2.2, it.width / 2 - 9, 0.9);
    pen.fillRect(it.left, mid + 1.3, it.width / 2 - 9, 0.9);
    pen.fillRect(cx + 9, mid - 2.2, it.width / 2 - 9, 0.9);
    pen.fillRect(cx + 9, mid + 1.3, it.width / 2 - 9, 0.9);
    pen.beginPath();
    pen.moveTo(cx, mid - 4.5);
    pen.lineTo(cx + 5, mid);
    pen.lineTo(cx, mid + 4.5);
    pen.lineTo(cx - 5, mid);
    pen.closePath();
    pen.fill();
  }

  /** A strip of a printed picture. */
  private paintStrip(it: Item, y: number): void {
    const photo = it.el.parentElement;
    const art = photo?.dataset.art ? this.art.get(photo.dataset.art) : null;
    if (!photo || !art) return;
    const ratio = this.press.ratio;
    const ph = Number(photo.dataset.height);
    const sy = Number(it.el.dataset.y);
    const rows = Math.min(STRIP + 1, ph - sy);
    this.pen.drawImage(art, 0, Math.round(sy * ratio), art.width, Math.round(rows * ratio), it.left, y, it.width, rows);
  }
}

/** The fonts the page is set in, loaded before the first page is measured. */
const FONTS = ["500 20px 'EB Garamond'", "italic 500 20px 'EB Garamond'", "500 14px 'Cinzel'", "600 36px 'Cinzel'"];

const artKey = (photo: HTMLElement, width: number, ratio: number) =>
  `${photo.dataset.kind}|${photo.dataset.src ?? photo.dataset.file}|${Math.round(width)}x${photo.dataset.height}@${ratio}`;

/* ───────────── pages ───────────── */

const TEMPLATE = /* html */ `
<section class="blog" aria-label="Blog">
  <div class="blog__view" aria-hidden="true"></div>
  <div class="blog__frame" aria-hidden="true"></div>
  <div class="blog__scroll" tabindex="0" role="region">
    <article class="sheet"></article>
  </div>
  <a class="blog__back" href="#/">‹ Main page</a>
</section>`;

interface Typesetter {
  /** The column's width in CSS pixels. */
  width: number;
  measure: (kind: Kind, text: string) => number;
}

function same(a: View, b: View): boolean {
  return a.kind === b.kind && (a.kind === 'index' || a.post === (b as { post: Post }).post);
}

function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** A word of running text: whether a space comes before it, and the link it is part of. */
interface Word {
  text: string;
  gap: boolean;
  href?: string;
}

/** A link in a post's text is written `[the words](address)`. */
const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g;

/** Text without its link markup, for places that cannot hold a link, like the summaries in the list. */
const plain = (text: string) => text.replace(LINK, '$1');

function words(text: string): Word[] {
  const out: Word[] = [];
  let gap = false;
  const add = (piece: string, href?: string) => {
    for (const m of piece.matchAll(/(\s+)|(\S+)/g)) {
      if (m[1]) gap = true;
      else {
        out.push({ text: m[2], gap: gap && out.length > 0, href });
        gap = false;
      }
    }
  };
  let last = 0;
  for (const m of text.matchAll(LINK)) {
    add(text.slice(last, m.index));
    add(m[1], m[2]);
    last = m.index + m[0].length;
  }
  add(text.slice(last));
  return out;
}

const joined = (ws: Word[]) => ws.map((w, i) => (i && w.gap ? ' ' : '') + w.text).join('');

/** Break text into lines no wider than `width`, measured in the font of `kind`. */
function wrap(text: string, set: Typesetter, kind: Kind, width = set.width): Word[][] {
  const out: Word[][] = [];
  const fits = (ws: Word[]) => set.measure(kind, joined(ws)) <= width;
  let line: Word[] = [];
  for (let word of words(text)) {
    if (line.length && fits([...line, word])) {
      line.push(word);
      continue;
    }
    if (line.length) out.push(line);
    // a word longer than a whole line is cut
    while (!fits([word])) {
      let n = word.text.length - 1;
      while (n > 1 && !fits([{ ...word, text: word.text.slice(0, n) }])) n--;
      out.push([{ ...word, text: word.text.slice(0, n) }]);
      word = { ...word, text: word.text.slice(n), gap: false };
    }
    line = [word];
  }
  if (line.length) out.push(line);
  return out;
}

const cls = (kind: Kind, extra = '') => `ln${kind === 'body' ? '' : ` ln--${kind}`}${extra ? ` ${extra}` : ''}`;
const line = (text: string, kind: Kind = 'body', extra = '') => h('span', { class: cls(kind, extra) }, text);

/** One line of running text. The words of a link are wrapped in it, so a link that breaks over lines is one link on each. */
function textLine(ws: Word[], kind: Kind, prefix = ''): HTMLElement {
  const el = h('span', { class: cls(kind) }, prefix);
  let anchor: HTMLAnchorElement | null = null;
  ws.forEach((w, i) => {
    const space = i && w.gap ? ' ' : '';
    if (w.href && anchor?.getAttribute('href') === w.href) {
      anchor.append(space + w.text);
      return;
    }
    if (space) el.append(space);
    if (w.href) {
      const away = /^https?:/.test(w.href);
      anchor = h('a', { class: 'ln__link', href: w.href, target: away ? '_blank' : null, rel: away ? 'noopener' : null }, w.text);
      el.append(anchor);
    } else {
      anchor = null;
      el.append(w.text);
    }
  });
  el.normalize();
  return el;
}

const lines = (text: string, set: Typesetter, kind: Kind = 'body') => wrap(text, set, kind).map((ws) => textLine(ws, kind));
const rule = () => h('span', { class: 'ln ln--rule', role: 'presentation' });
/** Two pieces of small type on one line, one at each end. */
const spread = (left: string, right: string) => h('span', { class: 'ln ln--meta ln--spread' }, h('span', null, left), h('span', null, right));
const end = () => h('p', { class: 'blk blk--end' }, line('Finis', 'meta', 'ln--center'));

/** Lines that are typed one key at a time when the page prints. */
function typed(els: HTMLElement[]): HTMLElement[] {
  els.forEach((el) => (el.dataset.text = el.textContent ?? ''));
  return els;
}

function indexPage(set: Typesetter): HTMLElement[] {
  const padX = set.width < 420 ? ENTRY_PAD.narrow : ENTRY_PAD.x;
  const inner: Typesetter = { ...set, width: set.width - 2 * padX };
  return [
    h('header', { class: 'blk' }, spread(BRAND.name, `${POSTS.length} posts`), rule(), h('h1', { class: 'sheet__title' }, ...typed(lines('Blog', set, 'title')))),
    ...POSTS.map((p) => {
      const entry = h(
        'a',
        { class: 'blk entry', href: `#/blog/${p.slug}` },
        line(longDate(p.date), 'meta'),
        ...lines(p.title, inner, 'strong'),
        ...lines(plain(p.summary), inner),
        line('Read the post ›', 'meta', 'ln--more'),
      );
      entry.style.padding = `${ENTRY_PAD.y}px ${padX}px ${ENTRY_PAD.y - 4}px`;
      return entry;
    }),
    end(),
  ];
}

function postPage(post: Post, set: Typesetter): HTMLElement[] {
  const back = () => h('nav', { class: 'blk' }, h('a', { class: 'ln ln--meta ln--link', href: '#/blog' }, '‹ All posts'));
  return [
    back(),
    h(
      'header',
      { class: 'blk' },
      spread(BRAND.name, longDate(post.date)),
      rule(),
      h('h1', { class: 'sheet__title' }, ...typed(lines(post.title, set, 'title'))),
      rule(),
    ),
    ...post.blocks.map((b) => block(b, set)),
    end(),
    back(),
  ];
}

function block(b: Block, set: Typesetter): HTMLElement {
  switch (b.type) {
    case 'p':
      return h('p', { class: 'blk' }, ...lines(b.text, set));
    case 'h':
      return h('h2', { class: 'blk blk--head' }, ...lines(b.text, set, 'strong'));
    case 'list':
      return h('ul', { class: 'blk' }, ...b.items.map((item) => h('li', null, ...listItem(item, set))));
    case 'image':
      return picture(b.style === 'plate' ? 'plate' : 'print', { 'data-src': new URL(b.src, document.baseURI).href }, b.aspect, b.alt, b.caption, set);
    case 'drawing':
      return picture('drawing', { 'data-file': b.file }, 16 / 9, b.alt, b.caption, set);
  }
}

/** A list item with a bullet, its following lines hung under the text rather than the bullet. */
function listItem(text: string, set: Typesetter): HTMLElement[] {
  const bullet = '•  ';
  const hang = set.measure('body', bullet);
  return wrap(text, set, 'body', set.width - hang).map((ws, i) => {
    if (!i) return textLine(ws, 'body', bullet);
    const el = textLine(ws, 'body');
    el.style.paddingLeft = `${hang}px`;
    return el;
  });
}

/**
 * A picture. A printed one is cut into thin strips, so it is printed and goes
 * under the rolls a strip at a time like the type does. A pasted one is a
 * plate in the scene, and the page only keeps its space.
 */
function picture(kind: 'print' | 'plate' | 'drawing', source: Record<string, string>, aspect: number, alt: string, caption: string | undefined, set: Typesetter): HTMLElement {
  const width = kind === 'plate' ? set.width - 2 * PLATE_INSET : set.width;
  const height = Math.round(width / aspect / STRIP) * STRIP;
  const img = h('div', { class: `photo photo--${kind}`, role: 'img', 'aria-label': alt, 'data-kind': kind, 'data-height': height, ...source });
  if (source['data-src']) img.style.setProperty('--src', `url("${source['data-src']}")`);
  if (kind === 'plate') {
    img.style.height = `${height + 18}px`;
  } else {
    for (let y = 0; y < height; y += STRIP) img.append(h('i', { class: 'strip', 'data-y': y }));
  }
  return h('figure', { class: 'blk' }, img, caption ? h('figcaption', null, ...lines(caption, set, 'caption')) : null);
}
