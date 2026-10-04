# Based in Battle · Pattern Archive

A storefront for licensed STL miniatures ([basedinbattle.com](https://basedinbattle.com)).
The current build is live on GitHub Pages at
[n041m.github.io/BIB](https://n041m.github.io/BIB/).

The page has a hero at the top and a cogitator screen below it, styled after
the single-colour phosphor terminals in grimdark gothic sci-fi. The screen waits in
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
  with the scissor test. The models download only once the screen scrolls
  into view or opens.
- **Inspector** (`#/archive/<slug>`). Opens over the archive on the same
  screen. Orbit, zoom and pan, with **Solid / Wire / X-ray** render modes,
  live azimuth, elevation and zoom readouts, a millimetre scale bar, and
  dimensions, triangle count and file size read from the actual STL.
- **Sections.** Archive, Licences, Printing and FAQ are tabs in the
  terminal. Keys **1** to **4** switch between them.
- **Gallery.** Painted models in full colour below the screen. A photo grows
  out of its tile into a viewer and shrinks back into it on close. Arrow keys
  step through the photos and Esc closes the viewer.
  Put the photos in `public/gallery/` and list them in `src/data/gallery.ts`.
- **Licences.** Personal or Merchant per model, with a requisition drawer
  (stored in `localStorage`) and a simulated checkout. No payment is taken.
- **Routing.** `#/` is the page, `#/archive` the screen, and
  `#/archive/<slug>` a deep link to a model. Back and Forward work as
  expected.
- **Accessibility.** Real buttons and dialogs, focus trapping, Esc to close,
  and `prefers-reduced-motion` support (no flicker, a plain cut to the store).

## The scene behind the hero

The hero sits in front of a candlelit corridor where a servitor swings a
censer. Hand-written WebGL2 shaders draw it in the browser. It uses no image
files and no three.js, and it loads after the rest of the page has appeared.

The camera never moves, so the corridor is rendered once when the page loads
and then refined over the next few frames. Each frame relights that picture
with the candle flicker, draws the censer and its smoke, and adds the light
shafts, dust and flames.

It stops drawing when the hero is scrolled out of view, when the tab is hidden
and while the archive screen is open. With reduced motion it draws one still
frame. If the GPU cannot keep up, it drops to 30 frames per second and then to
a lower resolution. Without WebGL2 the hero keeps its plain dark background.

- `src/backdrop/scene.ts`: the hall's measurements, where the servitor stands,
  every candle, the censer's swing and the camera.
- `src/backdrop/shaders/hall.glsl` and `servitor.glsl`: the shapes and
  materials of the hall and the servitor.
- `src/backdrop/shaders/frame.frag`: the haze, light shafts, smoke and censer.

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
GitHub Pages on every push to `main`, or on demand from the Actions tab.
Before the first deploy, set **Source** to **GitHub Actions** in
**Settings → Pages → Build and deployment**. The site is served at
[https://n041m.github.io/BIB/](https://n041m.github.io/BIB/).

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
- `THEME.phosphor` in `src/config.ts`: `'red'` or `'green'`. It switches the
  page accent, the screen and the 3D models together, along with the glass of
  the votive cups and the servitor's optic in the scene behind the hero.
- `src/styles/base.css`: both palettes, as CSS variables (`--p-*` is the
  phosphor ramp on the screen).
- `src/three/phosphor.ts`: the model shader. It reads its colours from the same CSS variables.

## Layout

```
src/
  app.ts               routing between the page and the screen
  config.ts            brand, currency, licences
  data/catalog.ts      products
  data/gallery.ts      gallery photos
  state/cart.ts        cart store (localStorage)
  lib/                 DOM helpers, cancellable timeline, text scramble
  backdrop/
    index.ts           the scene behind the hero: when it draws and when it slows down
    renderer.ts        WebGL2 passes: bake, frame, flames, bloom and the final grade
    scene.ts           the hall, the servitor, the censer, the candles and the camera
    shaders/           GLSL for each pass
  three/
    models.ts          STL loading, normalising, caching
    phosphor.ts        phosphor / x-ray shader
    stage.ts           one model on a holo-plinth (camera fit, build-up, modes)
    renderer.ts        shared scissor renderer for all cards
  ui/
    page.ts            top bar, hero, the section that holds the screen, footer
    gallery.ts         painted-model grid and photo viewer
    screen.ts          standby, take-over, boot choreography, exit
    boot.ts            power-on, degauss, telemetry readout, power-off
    store.ts, card.ts  the archive as a terminal program
    inspector.ts       3D inspection over the archive
    cart.ts            requisition drawer and simulated checkout
scripts/generate-models.mjs   procedural STL generator
```

The design is only lightly inspired by Warhammer 40,000. Everything here is
original, and none of it is affiliated with or endorsed by Games Workshop.
