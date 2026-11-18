# Hilera

Two-player online card-and-board game: race to claim two sequences of five.
Built with [SolidJS 2](https://www.solidjs.com), prerendered to static HTML at
build time and hydrated in the browser, and played peer-to-peer over WebRTC
(PeerJS). No game server.

## Styling

Styling is done with **Tailwind CSS v4** (via `@tailwindcss/vite`) and
**daisyUI 5** component classes:

- `src/app.css` imports Tailwind and loads daisyUI with `@plugin "daisyui";`
  (Tailwind v4 is configured entirely in CSS — there is no `tailwind.config.js`).
- The Vite plugin is registered in `vite.config.ts` (`tailwindcss()`).

Prefer Tailwind utilities + daisyUI classes (`btn`, `card`, `modal`, …) for new
UI; keep the existing per-component CSS files (`HileraGame.css`, `Memphis.css`,
`routes/index.css`) as they are until a component is rewritten.

## Card artwork

Card faces and board tiles are generated SVGs: edit `scripts/generate-cards.js` and run
`bun run cards:generate` (also run automatically by `dev`/`build`). The output
lands in `src/components/ui/assets/cards/` and `.../tiles/` and is rendered by
`src/components/ui/PlayingCard.tsx`. Don't edit the generated SVGs by hand.

## Developing

Once you've cloned this project, install dependencies and start a development server:

```bash
bun install
bun run dev
```

## Building

`bun run build` emits a static site in `dist/client`. Each page is rendered once
through the built server handler and written to its own file —
`index.html`, `about/index.html`, `room/index.html`, and `404.html` — with the
hashed JS/CSS bundles linked from it. The browser hydrates that markup, so the
content is in the HTML for crawlers and there is no blank first paint. There is
no server runtime to deploy.

To publish to GitHub Pages under `/sequence/`, use `bun run gh-pages:deploy`: it
builds with `BASE_PATH=/sequence` and pushes `dist/client`.

## Rendering model

Routes are file-based: `filesystem-routing` scans `src/routes` into
`virtual:file-routes`, and `src/router.ts` turns that manifest into Solid Router
routes with `fileRoutes()`. Routes ship eagerly (`codeSplitting: false`) — one
bundle, no per-route request. The prerender seeds live in `vite.config.ts`;
links and navigations inside the app go through `appPath()` so they stay inside
the deployment base.

## This project was created with the [Solid CLI](https://github.com/solidjs-community/solid-cli)
