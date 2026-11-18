# AGENTS.md

Guidance for AI coding agents working in this repository.

## Project

Two-player online board game **Hilera**: play a card, place a chip, and race
to claim two sequences of five. SolidJS 2 + Solid Router, prerendered at build
time by `prerender-crawler` through `@solidjs/vite-plugin` start mode and
hydrated in the browser — static output, no server runtime — with peer-to-peer
multiplayer via PeerJS WebRTC data channels. No game server: the hosting
browser tab is the authority.

## Commands

```bash
bun install          # install dependencies (bun.lock is the lockfile; Node ≥ 24)
bun run dev          # dev server (vite dev; renders pages on request)
bun run build        # production build → dist/client/ (prerendered pages)
bun run start        # vite preview of the built output
bun run preview      # vite preview

bun run test         # engine tests (bun test, src/lib/sequence/*.test.ts)
bun run cards:generate    # regenerate card/tile SVGs (dev/build do this automatically)
bun run gh-pages:deploy   # build with BASE_PATH=/sequence/ and publish to GitHub Pages
```

There is no linter configured. Verify changes with `bun run test` (covers the
pure engine: reducer rules and the host's secret-validation mirror),
`bun run build`, and by playing a two-tab game (`bun run dev` in one tab, open
the room link in a second tab/window).

## Critical invariants — do not violate

1. **`src/lib/sequence/reducer.ts` must stay pure.** No `Math.random()`, no
   `Date.now()`, no network, no hidden information. It may only read public
   facts from `SequenceState`.
2. **Hidden information never leaks.** Deck order and hand contents live only
   in `SequenceSecrets` (`src/lib/sequence/secrets.ts`), host-side only. Never
   add hands or deck contents to `SequenceState`, and never include them in a
   `HostMessage` broadcast. Each client receives only *its own* hand via the
   `state` message's `hand` field.
3. **`SequenceSecrets.prepareProposal` must guarantee that an accepted
   proposal commits.** It does so by dry-running the pure reducer on the
   public state BEFORE mutating secrets, then applying only the hidden side
   effects (remove card, reshuffle, draw) that the dry run's public counts
   imply. If you change reducer preconditions or the draw/reshuffle rules,
   keep that secret-application step in sync.
4. **Seats are colors:** host seat is `"blue"`, client seat is `"green"`;
   `turnOrder[0]` is the host. Two-player only — don't generalize to N players
   without a deliberate redesign.

## Code map

- `src/lib/sequence/` — game engine, framework-agnostic (no DOM, no Solid).
  - `types.ts` — state shape, the two actions (`MOVE`, `DECLARE_DEAD_CARD`),
    constants.
  - `cards.ts` — deck, board layout, card predicates, `SEQUENCE_WINDOWS`.
  - `reducer.ts` — the rules machine (pure): a turn is ONE atomic `MOVE`
    (card + chip + mandatory draw folded in); `DECLARE_DEAD_CARD` swaps a
    dead card without ending the turn.
  - `secrets.ts` — host-only hidden state + proposal validation (dry-runs
    the reducer before mutating secrets).
  - `index.ts` — exports + the P2P message protocol types.
- `src/App.tsx` — application root: the router's render prop and the shared
  `<Title>`. Runs on the server during the build crawl and hydrates.
- `src/Document.tsx` — `<html>` shell (description/OG tags, fonts,
  `<HydrationScript />`, `<noscript>` fallback). It hydrates as part of the app,
  so it must render identically on the server and the client. It carries no
  `<title>`: each route's `<Title>` is server-rendered, and authoring one too
  would emit a second title the head registry never adopts.
- `src/router.ts` — `createRouter({ routes: fileRoutes(pageRoutes), base })`.
  There is no `<Router root>` component in Solid Router 2.
- `src/lib/p2p.ts` — PeerJS lifecycle (`createRoom`/`joinRoom`), role
  persistence in `sessionStorage`, module-level peer singleton.
- `src/components/HostRoom.tsx` — authority loop: validate proposal → reducer →
  broadcast `state` + recipient's hand; `sessionStorage` persistence; states
  are always published at turn boundaries.
- `src/components/ClientRoom.tsx` — sends `action` proposals, renders host state.
- `src/components/HileraGame.tsx` — shared board/hand UI.
- `src/components/ui/PlayingCard.tsx` — renders the generated card/tile SVGs.
- `src/components/ui/assets/cards/` + `assets/tiles/` — **generated** artwork;
  edit `scripts/generate-cards.js` and run `bun run cards:generate` instead of touching
  these files by hand. Filenames follow the engine's cards (`7-h`, `a-s`);
  jacks are `jack-{one,two}-eyed-*`. FREE board corners are not generated —
  `FreeSpace` uses `assets/logo-star.svg` on the brand-pink cell.
- `src/routes/` — file-system routes (`filesystem-routing` scans this dir into
  `virtual:file-routes`): `index`, `about`, `room/`, and the `[...404]`
  catch-all. Plain `<a href>` elements are claimed by the router (client-side
  navigation, `aria-current`/`data-active` applied automatically); there is no
  `A` component in Solid Router 2.

## Conventions

- TypeScript, ESM, SolidJS signals (no external state library).
- **Solid 2 idioms.** Effects split into a tracking compute phase and an
  untracked effect phase: `createEffect(() => dep, (value) => { … })`, with
  cleanup returned from the effect function. `onMount` is `onSettled`, `batch`
  is gone (see Pitfalls), `classList` is the object/array form of `class`, and
  DOM attribute props are lowercase (`tabindex`, not `tabIndex`) while event
  props stay camelCase (`onClick`).
- **Styling: Tailwind CSS v4 + daisyUI 5.** Tailwind v4 is configured in CSS
  (`src/app.css`: `@import "tailwindcss";` + `@plugin "daisyui";`), not via a
  `tailwind.config.js`. Use Tailwind utilities and daisyUI classes (`btn`,
  `card`, `modal`, …) for UI; prefer daisyUI components over hand-rolled CSS.
  Reusable generic primitives go in `src/components/ui/` (presentation only —
  no game logic, no p2p imports); game-specific components stay in
  `src/components/`. Don't migrate working per-component CSS files
  (`HileraGame.css`, `Memphis.css`, `routes/index.css`) unless a component is
  being reworked.
- Comments in this codebase explain *why* around the hidden-information
  architecture — keep that style; these invariants are easy to break silently.
- Engine code (`src/lib/sequence/`) must remain independent of Solid/DOM so it
  stays testable and deterministic.
- **Prerendering constraints.** `App`, `Document` and every route also run on the
  server during the build-time crawl, so no component body may touch a browser
  API. `routes/room` defers its session read into `onSettled` and renders an
  unresolved branch that is identical on both sides — keep that branch free of
  `?id` so one prerendered `/room` file hydrates for every room.
- **Base-aware paths.** GitHub Pages serves this app under `/sequence/`, and
  Solid Router never adds the base for a leading `/` — not for `href`s (it only
  claims an anchor that resolves inside the base) and not for `navigate()`: a
  bare `navigate("/")` leaves the deployment base. Every in-app path, link and
  navigation target alike, goes through `appPath()` from `src/lib/paths.ts`.
- Env vars for the PeerJS signaling server: `VITE_PEER_HOST`, `VITE_PEER_PORT`,
  `VITE_PEER_SECURE`, `VITE_PEER_PATH` (see `src/lib/p2p.ts`).

## Pitfalls

- Editing only the reducer when a rule changes — the dry run in
  `prepareProposal` catches public-precondition drift automatically, but the
  hidden side effects (card removal, reshuffle, draw) are still hand-written
  to mirror what the dry run's public counts imply. Keep them aligned, or
  hands/deck will drift from the public state.
- Putting anything beyond public facts into broadcast payloads (leaks hands).
- Reading a signal immediately after setting it: Solid 2 stages writes and
  commits them on the next microtask, so `setGameState(next); gameState()`
  still returns the previous state. Broadcast/serialize the value you already
  hold (as `publish()` does) instead of reading it back.
- Storing game state anywhere other than `sessionStorage` per-tab (multiple
  tabs host/join different rooms independently by design).
- Reading `sessionStorage`/`window` in a component body: the build-time render
  runs that code in Node and fails with `ReferenceError`. Move it into
  `onSettled` or an effect, or add a resolved-gate like `routes/room`.
- Breaking the "host answers every action" contract: the host must respond to
  every client proposal with an authoritative `state` message (broadcast on
  accept, resync on reject), and always send `start` + `state` to a newly
  opened connection. The client's response watchdog reconnects when a
  proposal or handshake goes unanswered — if the host stops replying (e.g. to
  rejected proposals), clients go into a reconnect loop instead of recovering.
