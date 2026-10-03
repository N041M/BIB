# Plinth · Pattern Archive

A storefront for licensed STL miniatures that starts as an ordinary, modern
landing page. Click the monitor in the hero and the page gives way to a
cogitator screen, lightly inspired by grimdark sci-fi terminals:

1. **Wake.** The dark monitor glass expands until it *is* the page, while the
   landing page blurs and fades out underneath it. A power-on line blooms into
   a flash.
2. **Visor HUD.** Noisy, teal and half-legible. Brackets draw in, panels and
   readouts flicker on at random, the objective plate goes from `STANDBY` to
   `SIGNAL LOCKED`, and a dark silhouette of the flagship model turns behind it.
3. **Clear.** The HUD tears and flickers away. Noise, blur and the teal tint
   drain out, leaving a clean phosphor terminal.
4. **Stream.** The header draws itself, the bright `REQUISITION OBJECTIVES`
   band blooms, and product cards stream in one by one. Each 3D model builds
   from the bottom up.

The monitor's frame is never shown. The landing page shows only the glass,
and the terminal fills the whole viewport. Press **Esc** or **Skip** to jump
straight to the store, and click the sigil in the top-left to power the
screen back down.

## Features

- **Interactive 3D on every card.** Drag to turn, hover to brighten; the
  models spin while idle. All cards share **one** WebGL context: a canvas sits
  behind the page and draws each model into its card's rectangle with the
  scissor test.
- **Inspector** (`#/archive/<slug>`). Orbit, zoom and pan, with **Solid /
  Wire / X-ray** render modes, live azimuth, elevation and zoom readouts, a
  millimetre scale bar, and dimensions, triangle count and file size read
  from the actual STL.
- **Licences.** Personal or Merchant per model, with a cart (stored in
  `localStorage`) and a simulated checkout. No payment is taken.
- **Routing.** `#/` is the landing page, `#/archive` the store, and
  `#/archive/<slug>` a deep link to a model. Back and Forward work as
  expected.
- **Accessibility.** Real buttons and dialogs, focus trapping, Esc to close,
  and `prefers-reduced-motion` support (no flicker, a plain cut to the store).

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
npm run preview
```

The build uses a relative `base`, so `dist/` can be served from any sub-path
(GitHub Pages, S3, Netlify, and so on).

## GitHub Pages

`.github/workflows/deploy-pages.yml` builds the site and publishes `dist/` to
GitHub Pages on every push to the deploy branch, or on demand from the
Actions tab. Setup is one-time: in **Settings → Pages → Build and deployment**,
set **Source** to **GitHub Actions**. The site is then served at
`https://<owner>.github.io/<repo>/`.

## The models

`public/models/*.stl` are **procedurally generated placeholders**: original
designs built from three.js primitives by `scripts/generate-models.mjs`
(`npm run models`). They are binary STL, in millimetres, Z-up, centred, and
resting on z = 0, so they open correctly in any slicer.

To sell real models, drop the licensed STL files into `public/models/` and
edit `src/data/catalog.ts`: name, copy, prices per licence, part count and
file name. Dimensions and triangle counts are read from the files at runtime.
If a file is missing, the store shows a placeholder shape instead of
breaking.

## Re-skinning

- `src/config.ts`: brand name, terminal name, currency/locale and licence
  terms.
- `src/styles/base.css`: colour tokens for both the landing page (`--lp-*`)
  and the terminal (`--t-*`).
- `src/three/phosphor.ts`: the phosphor shader and its palette.

## Layout

```
src/
  app.ts               routing between landing and screen
  config.ts            brand, currency, licences
  data/catalog.ts      products
  state/cart.ts        cart store (localStorage)
  lib/                 DOM helpers, cancellable timeline, text scramble, glyphs
  three/
    models.ts          STL loading, normalising, caching
    phosphor.ts        phosphor / x-ray shader
    stage.ts           one model on a holo-plinth (camera fit, build-up, modes)
    renderer.ts        shared scissor renderer for all cards
  ui/
    landing.ts         the ordinary landing page and its monitor
    screen.ts          the takeover + boot choreography
    hud.ts             visor HUD (boot phase)
    store.ts, card.ts  terminal storefront
    inspector.ts       full-screen 3D inspection dialog
    cart.ts            requisition manifest + simulated checkout
scripts/generate-models.mjs   procedural STL generator
```

The design is only lightly inspired by Warhammer 40,000. Everything here is
original, and none of it is affiliated with or endorsed by Games Workshop.
