import { fromHTML, qs, qsa } from '../lib/dom';
import { sigil, skull } from '../lib/glyphs';
import { noiseText, scramble } from '../lib/scramble';
import { rand, type Sequence } from '../lib/sequence';
import { pad } from '../lib/format';

/**
 * The visor overlay that flickers up first when the screen wakes: noisy,
 * busy, half-legible. It is torn down once the terminal clears.
 */
export class Hud {
  readonly el: HTMLElement;
  private frame: SVGSVGElement;
  private timer = 0;
  private tick = 0;

  constructor() {
    this.el = fromHTML(this.template());
    this.frame = qs<SVGSVGElement>(this.el, '.hud__frame');
  }

  mount(parent: HTMLElement): void {
    parent.append(this.el);
    this.drawFrame();
    window.addEventListener('resize', this.drawFrame);
  }

  destroy(): void {
    window.clearInterval(this.timer);
    window.removeEventListener('resize', this.drawFrame);
    this.el.remove();
  }

  /** Flicker every element in at a random moment inside `window` ms. */
  async flickerIn(seq: Sequence, spread = 1100): Promise<void> {
    this.el.classList.add('hud--on');
    const items = qsa(this.el, '[data-flk]');
    items.forEach((el) => {
      const order = Number(el.dataset.flk || 0);
      el.style.animationDelay = `${Math.round(order * spread * 0.18 + rand(0, spread * 0.55))}ms`;
      el.classList.add('flk-in');
    });
    qsa<SVGPathElement>(this.frame, 'path').forEach((p, i) => {
      const len = p.getTotalLength();
      p.style.strokeDasharray = `${len}`;
      p.style.strokeDashoffset = `${len}`;
      p.style.animationDelay = `${Math.round(i * 40 + rand(0, 260))}ms`;
      p.classList.add('draw');
    });
    this.startReadouts();
    await seq.wait(spread * 0.75);
    const tab = qs(this.el, '.hud__title-text');
    scramble(tab, 'ACQUIRING SIGNAL', { duration: 420 });
  }

  async lock(seq: Sequence): Promise<void> {
    const title = qs(this.el, '.hud__title');
    const text = qs(this.el, '.hud__title-text');
    title.classList.add('is-locked');
    await scramble(text, 'SIGNAL LOCKED', { duration: 360 });
    const alert = qs(this.el, '.hud__alert-text');
    scramble(alert, 'UNSANCTIONED PATTERNS PURGED', { duration: 500 });
    qs(this.el, '.hud__alert').classList.add('is-resolved');
    qs(this.el, '.hud__reticle').classList.add('is-locked');
    await seq.wait(80);
  }

  /** Tear-and-collapse exit: a glitch burst, then every element flickers out. */
  async clear(seq: Sequence): Promise<void> {
    this.el.classList.add('hud--glitch');
    await seq.wait(320);
    this.el.classList.remove('hud--glitch');
    qsa(this.el, '[data-flk]').forEach((el) => {
      el.classList.remove('flk-in');
      el.style.animationDelay = `${Math.round(rand(0, 360))}ms`;
      el.classList.add('flk-out');
    });
    this.frame.classList.add('is-out');
    await seq.wait(560);
  }

  private startReadouts(): void {
    const coords = qs(this.el, '.hud__coords-val');
    const rn = qs(this.el, '.hud__rn');
    const ch = qs(this.el, '.hud__ch');
    const fuel = qs(this.el, '.hud__fuel-fill');
    const logs = qsa(this.el, '.hud__log-line');
    let lat = 23.78943;
    let lon = 199.5482;
    this.timer = window.setInterval(() => {
      this.tick++;
      lat += rand(-0.004, 0.004);
      lon += rand(-0.004, 0.004);
      coords.textContent = `${lat.toFixed(5)} ; ${lon.toFixed(5)}`;
      rn.textContent = `RN ${pad(60 + (this.tick % 30))}/89`;
      ch.textContent = `CH ${1 + (this.tick % 40)}/40`;
      fuel.style.transform = `scaleX(${Math.min(1, 0.15 + this.tick * 0.03)})`;
      const line = logs[this.tick % logs.length];
      if (line) line.textContent = noiseText(line.textContent?.length || 16);
    }, 90);
  }

  /** Bracket geometry is computed in pixels so the 45° chamfers never distort. */
  private drawFrame = (): void => {
    const w = this.el.clientWidth || window.innerWidth;
    const h = this.el.clientHeight || window.innerHeight;
    const m = Math.round(Math.min(Math.max(Math.min(w, h) * 0.035, 12), 40));
    const c = Math.round(Math.min(w, h) * 0.05);
    const narrow = w < 720;
    const paths = [
      // top-left bracket
      `M${m + c + w * 0.12} ${m} H${m + c} L${m} ${m + c} V${h * 0.4}`,
      // bottom-left bracket
      `M${m} ${h * 0.6} V${h - m - c} L${m + c} ${h - m} H${m + c + w * 0.14}`,
      // top-right
      `M${w - m - c - w * 0.12} ${m} H${w - m - c} L${w - m} ${m + c} V${h * 0.4}`,
      // bottom-right
      `M${w - m} ${h * 0.6} V${h - m - c} L${w - m - c} ${h - m} H${w - m - c - w * 0.14}`,
      // inner side rails
      `M${m + 10} ${h * 0.44} V${h * 0.56}`,
      `M${w - m - 10} ${h * 0.44} V${h * 0.56}`,
      // top centre shoulders
      `M${w * 0.3} ${m + 6} H${w * 0.4} L${w * 0.41} ${m + 14}`,
      `M${w * 0.7} ${m + 6} H${w * 0.6} L${w * 0.59} ${m + 14}`,
      // bottom centre plate
      `M${w * 0.34} ${h - m - 4} L${w * 0.36} ${h - m - 14} H${w * 0.64} L${w * 0.66} ${h - m - 4}`,
    ];
    const ticks: string[] = [];
    if (!narrow) {
      for (let i = 0; i < 9; i++) {
        const y = h * 0.2 + i * ((h * 0.6) / 8);
        ticks.push(`M${m + 18} ${y} h${i % 4 === 0 ? 14 : 7}`);
        ticks.push(`M${w - m - 18} ${y} h-${i % 4 === 0 ? 14 : 7}`);
      }
    }
    this.frame.setAttribute('viewBox', `0 0 ${w} ${h}`);
    this.frame.innerHTML =
      paths.map((d, i) => `<path class="${i < 4 ? 'thick' : ''}" d="${d}"/>`).join('') +
      (ticks.length ? `<path class="fine" d="${ticks.join(' ')}"/>` : '');
  };

  private template(): string {
    const tape = Array.from({ length: 61 }, (_, i) => {
      const major = i % 5 === 0;
      const label = major ? `<b>${26 + i / 5}</b>` : '';
      return `<i class="${major ? 'maj' : ''}">${label}</i>`;
    }).join('');
    const alt = Array.from({ length: 21 }, (_, i) => {
      const major = i % 5 === 0;
      return `<i class="${major ? 'maj' : ''}">${major ? `<b>${10 - i / 2.5}</b>` : ''}</i>`;
    }).join('');
    const log = Array.from({ length: 7 }, () => `<span class="hud__log-line">${noiseText(14 + Math.floor(Math.random() * 12))}</span>`).join('');

    return /* html */ `
<div class="hud" aria-hidden="true">
  <svg class="hud__frame" preserveAspectRatio="none"></svg>

  <div class="hud__top">
    <div class="hud__tab" data-flk="0">ACQUISITION PROTOCOL</div>
    <div class="hud__title" data-flk="1"><span class="hud__title-text">STANDBY</span>${skull('hud__title-skull')}</div>
  </div>

  <div class="hud__skulls" data-flk="0">
    <span class="hud__sk">${skull()}</span>
    <span class="hud__sk is-red">${skull()}</span>
    <span class="hud__sk is-red">${skull()}</span>
  </div>

  <div class="hud__panel hud__panel--a" data-flk="1">
    <span>CHD.CNC_/UH..</span><span class="dim">DSCN 12.04</span><span class="dim">${noiseText(10)}</span>
  </div>

  <div class="hud__compass" data-flk="2"><span></span></div>

  <div class="hud__panel hud__panel--b" data-flk="2">
    <span class="dim">PTN.MNL//4 · ARCHV</span>
    <span class="dim">${noiseText(18)}</span>
    <span class="dim">${noiseText(12)}</span>
    <span class="hud__rn">RN 66/89</span>
  </div>

  <div class="hud__alt" data-flk="1"><div class="hud__alt-scale">${alt}</div><span class="hud__alt-mark"></span></div>

  <div class="hud__panel hud__panel--coords" data-flk="3">
    <span class="dim">CHD.NC/POS.LOC</span>
    <span class="hud__coords-val">23.78943 ; 199.54820</span>
    <span class="dim">32.000 · 125 CT</span>
  </div>

  <div class="hud__reticle" data-flk="2">
    <span class="hud__ret-h"></span><span class="hud__ret-v"></span>
    <span class="hud__ret-box"></span>
  </div>
  <span class="hud__plus" style="left:22%;top:30%" data-flk="3"></span>
  <span class="hud__plus" style="left:64%;top:24%" data-flk="3"></span>
  <span class="hud__plus" style="left:30%;top:70%" data-flk="3"></span>
  <span class="hud__plus" style="left:58%;top:42%" data-flk="3"></span>

  <div class="hud__tape" data-flk="2"><div class="hud__tape-track">${tape}</div><span class="hud__tape-caret"></span></div>

  <div class="hud__emblem" data-flk="0">${sigil()}</div>

  <div class="hud__panel hud__panel--log" data-flk="1">
    <span class="hud__panel-head">${noiseText(8)} //ARCHIVE</span>
    ${log}
    <span class="hud__ch">CH 1/40</span>
  </div>

  <div class="hud__rows" data-flk="2">
    <span class="r"><b>OP 1.2[89]</b><em>PTN</em></span>
    <span class="r"><b>HN 2.5[1/2]</b><em>LIC</em></span>
    <span class="r is-hot"><b>RP 4/129</b><em>STL</em></span>
    <span class="r"><b class="dim">${noiseText(8)}</b><em>HS-H</em></span>
    <span class="r"><b class="dim">${noiseText(8)}</b><em>SYS</em></span>
  </div>

  <div class="hud__fuel" data-flk="3">
    <span class="hud__fuel-label">PHOTONIC HYDROGEN</span>
    <span class="hud__fuel-bar"><span class="hud__fuel-fill"></span></span>
  </div>

  <div class="hud__fid" data-flk="3">${skull()}<span><small>FID</small>XIV</span></div>

  <div class="hud__alert" data-flk="2">
    ${skull()}<span class="hud__alert-tag">WARNING:</span><span class="hud__alert-text">UNSANCTIONED PATTERN SIGNATURES DETECTED</span>
  </div>

  <span class="hud__checker hud__checker--1" data-flk="3"></span>
  <span class="hud__checker hud__checker--2" data-flk="3"></span>
  <span class="hud__checker hud__checker--3" data-flk="3"></span>
</div>`;
  }
}
