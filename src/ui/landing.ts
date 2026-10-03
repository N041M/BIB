import { BRAND } from '../config';
import { fromHTML, qs, qsa } from '../lib/dom';

export interface LandingCallbacks {
  /** Wake the screen. `origin` is the rectangle the takeover expands from. */
  onEnter: (origin: DOMRect) => void;
}

const ICONS = {
  layers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M12 3 3 8l9 5 9-5-9-5Z"/><path d="m3 13 9 5 9-5"/><path d="m3 17.5 9 5 9-5" opacity=".45"/></svg>',
  licence: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 12h7M9 16h5"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11m0 0-4-4m4 4 4-4"/><path d="M5 19h14"/></svg>',
  check: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m3.5 8.5 3 3 6-7"/></svg>',
};

/** The deliberately ordinary storefront landing page. */
export class Landing {
  readonly el: HTMLElement;
  private screen: HTMLButtonElement;

  constructor(private cb: LandingCallbacks) {
    this.el = fromHTML(this.template());
    this.screen = qs<HTMLButtonElement>(this.el, '.display');

    this.screen.addEventListener('click', () => this.enter(this.screenRect(), true));
    qsa(this.el, '[data-enter]').forEach((btn) =>
      btn.addEventListener('click', () => this.enter(this.originFor(btn), false)),
    );
    qsa(this.el, '[data-scroll]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const target = this.el.querySelector(`#${btn.dataset.scroll}`);
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }),
    );
  }

  show(): void {
    this.el.hidden = false;
    this.el.classList.remove('lp--leaving', 'lp--gone');
    this.screen.classList.remove('display--waking');
    document.documentElement.classList.remove('is-terminal', 'is-dimmed');
  }

  /** Fade the page out underneath the expanding screen. */
  leave(): void {
    this.el.classList.add('lp--leaving');
    // the room goes dark around the waking screen
    document.documentElement.classList.add('is-dimmed');
  }

  hide(): void {
    this.el.classList.add('lp--gone');
    this.el.hidden = true;
  }

  /** Fade back in after the screen powers down. */
  returnFromTerminal(): void {
    this.show();
    this.el.classList.add('lp--returning');
    window.setTimeout(() => this.el.classList.remove('lp--returning'), 900);
  }

  screenRect(): DOMRect {
    return qs(this.el, '.display__screen').getBoundingClientRect();
  }

  private enter(origin: DOMRect, fromScreen: boolean): void {
    if (fromScreen) this.screen.classList.add('display--waking');
    this.cb.onEnter(origin);
  }

  /** Expand from the monitor when it is on screen, otherwise from the clicked control. */
  private originFor(btn: HTMLElement): DOMRect {
    const r = this.screenRect();
    const visible = Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0));
    return visible > r.height * 0.5 ? r : btn.getBoundingClientRect();
  }

  private template(): string {
    const year = new Date().getFullYear();
    return /* html */ `
<div class="lp">
  <header class="lp-nav">
    <a class="lp-logo" href="#/" aria-label="${BRAND.name} home"><span class="lp-logo__mark" aria-hidden="true"></span>${BRAND.name}</a>
    <nav class="lp-nav__links" aria-label="Primary">
      <button type="button" data-enter>Models</button>
      <button type="button" data-scroll="how">How it works</button>
      <button type="button" data-scroll="licensing">Licensing</button>
      <button type="button" data-scroll="faq">FAQ</button>
    </nav>
    <div class="lp-nav__actions">
      <button type="button" class="lp-btn lp-btn--dark lp-btn--sm" data-enter>Browse models</button>
    </div>
  </header>

  <main>
    <section class="lp-hero">
      <div class="lp-hero__copy">
        <p class="lp-eyebrow"><span class="lp-eyebrow__dot"></span>Licensed STL files for tabletop</p>
        <h1 class="lp-title">Print-ready miniatures, licensed for your table.</h1>
        <p class="lp-lede">${BRAND.name} is a curated archive of tested STL models: armour, terrain, busts and relics. Every file comes with a clear licence for printing at home, or for selling the prints.</p>
        <div class="lp-hero__cta">
          <button type="button" class="lp-btn lp-btn--dark lp-btn--lg" data-enter>Browse the archive <span aria-hidden="true">→</span></button>
          <button type="button" class="lp-btn lp-btn--ghost lp-btn--lg" data-scroll="licensing">How licensing works</button>
        </div>
        <ul class="lp-points">
          <li>${ICONS.check}Pre-supported and test-printed</li>
          <li>${ICONS.check}Personal or merchant licence</li>
          <li>${ICONS.check}Instant download</li>
        </ul>
      </div>

      <div class="lp-hero__display">
        <button type="button" class="display" aria-label="Wake the screen to open the model archive">
          <span class="display__screen">
            <span class="display__sleep">
              <span class="display__led" aria-hidden="true"></span>
              <span class="display__hint">Click to wake</span>
            </span>
            <span class="display__tease" aria-hidden="true"></span>
            <span class="display__glare" aria-hidden="true"></span>
          </span>
          <span class="display__stand" aria-hidden="true"><span class="display__neck"></span><span class="display__foot"></span></span>
        </button>
        <p class="lp-display-caption">The full catalogue lives on this screen.</p>
      </div>
    </section>

    <section class="lp-strip" aria-label="Compatible software">
      <span>Sliced and verified in</span>
      <ul><li>Chitubox</li><li>Lychee</li><li>PrusaSlicer</li><li>Cura</li><li>Bambu Studio</li></ul>
    </section>

    <section class="lp-section" id="how">
      <div class="lp-section__head">
        <p class="lp-kicker">How it works</p>
        <h2>From checkout to build plate in minutes.</h2>
      </div>
      <div class="lp-features">
        <article class="lp-feature">
          <span class="lp-feature__icon">${ICONS.layers}</span>
          <h3>Tested before release</h3>
          <p>Each model is printed on resin and FDM machines before it goes live. Supported and unsupported files are both included.</p>
        </article>
        <article class="lp-feature">
          <span class="lp-feature__icon">${ICONS.licence}</span>
          <h3>Licences in plain language</h3>
          <p>Pick a personal licence for your own collection, or a merchant licence to sell the prints. Each order comes with a certificate.</p>
        </article>
        <article class="lp-feature">
          <span class="lp-feature__icon">${ICONS.download}</span>
          <h3>Download, slice, print</h3>
          <p>Files are delivered as a ZIP with print profiles and part guides. Updates to a model are free for as long as it's in the archive.</p>
        </article>
      </div>
    </section>

    <section class="lp-section lp-section--tinted" id="licensing">
      <div class="lp-section__head">
        <p class="lp-kicker">Licensing</p>
        <h2>Two licences. No fine print.</h2>
      </div>
      <div class="lp-tiers">
        <article class="lp-tier">
          <h3>Personal</h3>
          <p class="lp-tier__lede">For your own table, shelf and gaming group.</p>
          <ul>
            <li>${ICONS.check}Unlimited prints for personal use</li>
            <li>${ICONS.check}Free file updates</li>
            <li>${ICONS.check}Share photos of your paint jobs anywhere</li>
          </ul>
          <p class="lp-tier__price">Models from <strong>€8</strong>, plus one free sample</p>
        </article>
        <article class="lp-tier lp-tier--accent">
          <h3>Merchant</h3>
          <p class="lp-tier__lede">For print shops and commission painters.</p>
          <ul>
            <li>${ICONS.check}Sell up to 250 physical prints per month</li>
            <li>${ICONS.check}Free file updates</li>
            <li>${ICONS.check}No digital redistribution</li>
          </ul>
          <p class="lp-tier__price">3× the personal price</p>
        </article>
      </div>
    </section>

    <section class="lp-section" id="faq">
      <div class="lp-section__head">
        <p class="lp-kicker">FAQ</p>
        <h2>Questions, answered.</h2>
      </div>
      <div class="lp-faq">
        <details><summary>What scale are the models?</summary><p>Most models are sized for 28–32 mm tabletop games. Busts and display relics list their own size. STL files scale freely in any slicer.</p></details>
        <details><summary>Do the files come pre-supported?</summary><p>Most do. Each product page lists whether supports are included, and both supported and unsupported files are in every ZIP.</p></details>
        <details><summary>Can I sell prints?</summary><p>Yes, with a merchant licence. It covers up to 250 physical prints per model per month. Reselling or sharing the digital files is never allowed.</p></details>
        <details><summary>Is there a free model to try?</summary><p>Yes. The archive includes a free sample so you can test our supports on your own printer before you buy.</p></details>
      </div>
    </section>
  </main>

  <footer class="lp-footer">
    <span class="lp-logo lp-logo--sm"><span class="lp-logo__mark" aria-hidden="true"></span>${BRAND.name}</span>
    <span>© ${year} ${BRAND.name}. Demo storefront. Model files are procedurally generated placeholders.</span>
  </footer>
</div>`;
  }
}
