# Based in Battle · Pattern Archive

A storefront for licensed STL miniatures ([basedinbattle.com](https://basedinbattle.com)).
The page has a hero at the top and a cogitator screen below it, styled after
the green phosphor terminals in grimdark gothic sci-fi. The screen waits in
standby with a flashing "READY FOR USE" message. Activating it starts the
archive in five steps:

1. **Take over.** The glass grows from where it sits on the page (or from the
   button that was pressed) until it fills the tab. The page underneath fades
   out and stops scrolling.
2. **Power on.** A point of light in the centre draws out into a line, and the
   line opens into an overexposed raster that settles to black.
3. **Degauss.** The first readout bends in horizontal waves and blooms for a
   moment, then settles flat.
4. **Telemetry.** A start-up log scrolls past at several lines per frame, next
   to memory, carrier, pattern index and stack panels. The pattern index and
   the `RECV` lines report the real model downloads, and the log waits on a
   slow one for up to five seconds.
5. **Archive.** The screen redraws from the top behind a bright scan line, and
   each 3D model builds from the bottom up.

**Esc** or **Skip** jumps straight to the archive. **EXIT** in the title bar,
or the browser's Back button, powers the screen off: the picture folds into a
line, the line pulls in to a point, the point fades, and the glass shrinks
back onto the page.

Only the screen is drawn, never a monitor around it. The glass has scanlines,
grain, a slow hum bar, a dark falloff at the edges, a faint reflection and
fine scratches.

## Features

- **Interactive 3D on every card.** Drag to turn, hover to brighten. The
  models spin while idle. All cards share one WebGL context: a canvas sits
  behind the store markup and draws each model into its card's rectangle
  with the scissor test.
- **Inspector** (`#/archive/<slug>`). Opens over the archive on the same
  screen. Orbit, zoom and pan, with **Solid / Wire / X-ray** render modes,
  live azimuth, elevation and zoom readouts, a millimetre scale bar, and
  dimensions, triangle count and file size read from the actual STL.
- **Sections.** Archive, Licences, Printing and FAQ are tabs in the
  terminal. Keys **1** to **4** switch between them.
- **Licences.** Personal or Merchant per model, with a requisition drawer
  (stored in `localStorage`) and a simulated checkout. No payment is taken.
- **Routing.** `#/` is the page, `#/archive` the screen, and
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

## GitHub Pages and the custom domain

`.github/workflows/deploy-pages.yml` builds the site and publishes `dist/` to
GitHub Pages on every push to `main`, or on demand from the Actions tab. Setup is one-time: in **Settings → Pages → Build and deployment**,
set **Source** to **GitHub Actions**. The site is then served at
`https://<owner>.github.io/<repo>/`.

To serve it from `basedinbattle.com`:

1. At the domain registrar, add four `A` records for the apex (`@`) pointing
   to `185.199.108.153`, `185.199.109.153`, `185.199.110.153` and
   `185.199.111.153`. Optionally add the matching `AAAA` records
   (`2606:50c0:8000::153` to `2606:50c0:8003::153`) and a `CNAME` record for
   `www` pointing to `<owner>.github.io`.
2. In **Settings → Pages → Custom domain**, enter `basedinbattle.com`, save,
   and tick **Enforce HTTPS** once the certificate is issued.

The build uses relative paths and hash routing, so the same output works at
the domain root and under `/<repo>/`. Deployments made by the Actions
workflow ignore `CNAME` files, so the domain lives in repository settings.

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

- `src/config.ts`: brand name, domain, terminal name, currency/locale and
  licence terms.
- `src/styles/base.css`: the page palette and the phosphor ramp (`--p-*`)
  used on the screen.
- `src/three/phosphor.ts`: the model shader and its green palette.

## Layout

```
src/
  app.ts               routing between the page and the screen
  config.ts            brand, currency, licences
  data/catalog.ts      products
  state/cart.ts        cart store (localStorage)
  lib/                 DOM helpers, cancellable timeline, text scramble
  three/
    models.ts          STL loading, normalising, caching
    phosphor.ts        phosphor / x-ray shader
    stage.ts           one model on a holo-plinth (camera fit, build-up, modes)
    renderer.ts        shared scissor renderer for all cards
  ui/
    page.ts            top bar, hero, the section that holds the screen, footer
    screen.ts          standby, take-over, boot choreography, exit
    boot.ts            power-on, degauss, telemetry readout, power-off
    store.ts, card.ts  the archive as a terminal program
    inspector.ts       3D inspection over the archive
    cart.ts            requisition drawer and simulated checkout
scripts/generate-models.mjs   procedural STL generator
```

The design is only lightly inspired by Warhammer 40,000. Everything here is
original, and none of it is affiliated with or endorsed by Games Workshop.
