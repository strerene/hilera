# Architecture

**Hilera** is a two-player online card-and-board game: play a card, place a
chip on the matching space, and race to claim two sequences of five. It is
built with [SolidJS 2](https://www.solidjs.com) and
[Solid Router](https://docs.solidjs.com/solid-router) and played peer-to-peer
in the browser via [PeerJS](https://peerjs.com/) (WebRTC data channels). There
is no game server: one browser tab **hosts** the game and acts as the authority;
the other tab **joins** as a client.

## Stack

| Layer      | Choice                                             |
| ---------- | -------------------------------------------------- |
| UI         | SolidJS 2.0 (`solid-js`, `@solidjs/web`, `@solidjs/router`, `@solidjs/meta` 2) |
| Framework  | `@solidjs/vite-plugin` start mode + `prerender-crawler`: pages rendered at build time, hydrated in the browser; static output, no server runtime |
| Routing    | `filesystem-routing` → `fileRoutes()` from `@solidjs/router/fs` |
| Styling    | Tailwind CSS 4 (`@tailwindcss/vite`) + daisyUI 5 (loaded as `@plugin` in `src/app.css`) |
| Bundler    | Vite 8 (single static client bundle in `dist/client`) |
| Networking | `peerjs` — WebRTC data channels with a public signaling server (configurable via `VITE_PEER_*` env vars) |
| Runtime    | Node ≥ 24, Bun for scripts/deploy                  |

## Directory layout

```
src/
├── App.tsx                  # Application root: router render prop + Title
├── Document.tsx             # <html> shell (head, fonts, HydrationScript); rendered per page
├── router.ts                # createRouter(fileRoutes(pageRoutes)), base path
├── app.css                  # Tailwind + daisyUI entry (@import / @plugin)
├── routes/
│   ├── index.tsx            # Home: create room (host) or join (client)
│   ├── about.tsx            # About page
│   └── [...404].tsx         # Catch-all 404
├── components/
│   ├── HostRoom.tsx         # Host role: authority, secrets, broadcasting
│   ├── ClientRoom.tsx       # Client role: sends proposals, renders state
│   ├── SequenceGame.tsx     # Board + hands UI (shared by both roles)
│   ├── SequenceGame.css
│   └── ui/
│       ├── PlayingCard.tsx  # Renders generated card faces / board tiles
│       └── assets/
│           ├── cards/       # GENERATED full faces + jacks
│           └── tiles/       # GENERATED board tiles
└── lib/
    ├── p2p.ts               # PeerJS lifecycle: createRoom / joinRoom, role persistence
    └── sequence/            # The game engine (framework-agnostic, no DOM)
        ├── types.ts         # State, actions, constants (HAND_SIZE, SEQUENCES_TO_WIN)
        ├── cards.ts         # Deck creation, board layout, card predicates, SEQUENCE_WINDOWS
        ├── reducer.ts       # PURE public-state reducer (the rules machine)
        ├── secrets.ts       # IMPURE host-only hidden info (deck order + hands)
        └── index.ts         # Public exports + P2P message protocol types
```

## Core design: authority + hidden information

The central constraint is that **hands are hidden information**, while every
replica of the game must render identical public state. The design splits the
engine into two halves:

```
                    HOST (authoritative tab)
  ┌────────────────────────────────────────────────────────┐
  │  ClientRoom/HostRoom UI                                │
  │      │  action proposal                                │
  │      ▼                                                 │
  │  SequenceSecrets.prepareProposal()   ← hidden info     │
  │      │  validated payload (or reject)                  │
  │      ▼                                                 │
  │  reducer(state, action)              ← pure, public    │
  │      │  new public state                               │
  │      ▼                                                 │
  │  broadcast { state, hand }  ──►  each client gets the  │
  │                                 PUBLIC state + its OWN │
  │                                 hand only              │
  └────────────────────────────────────────────────────────┘
```

- **`reducer.ts` is pure** — no `Math.random()`, no `Date.now()`, no network.
  It sees only public facts. Every client can run it and get the same result.
- **`secrets.ts` (`SequenceSecrets`) is impure by design** — it holds the
  shuffled deck and all hands, runs only on the host, and is *never* serialized
  into a broadcast. Before applying an action, the host validates the proposal
  against the hidden state (`prepareProposal`), e.g. "does that player really
  hold that card?". `prepareProposal` deliberately mirrors every public
  precondition the reducer will check, so an accepted proposal is guaranteed to
  commit and secrets can never drift from the public state.
- Hands travel out-of-band: `HostMessage = { type: "state"; state; hand }` —
  the `hand` field contains only the *recipient's* hand. **Never put hand
  contents into the public `SequenceState`**; it would leak through broadcasts.

### Turn machine

A turn is a strict four-step machine enforced by the reducer:

```
play ──► place ──► draw ──► next player
  │                 ▲
  │  (one-eyed jack)│
  └──► remove ──────┘
```

Only five actions exist: `PLAY_CARD`, `DECLARE_DEAD_CARD`, `PLACE_CHIP`,
`REMOVE_CHIP`, `DRAW_CARD`. Game setup (seats, deal) is host-only code — there
are no START/SHUFFLE actions. `DRAW_CARD` only changes public counts; the
drawn card itself reaches the player via a `hand` message.

Other rules encoded in the reducer:

- Two-eyed jack = wild placement; one-eyed jack = remove an opponent's
  unlocked chip; dead cards must be declared (one exchange per turn).
- Corners (`FREE` cells) count for both players.
- Sequence claiming allows a new sequence to share **at most one chip** with
  already-claimed sequences (so a 9-in-a-row is two sequences). Claimed chips
  are `locked` and cannot be removed.
- Deck exhaustion: rebuilt from the *public* discard piles (deterministic for
  all replicas; only the shuffled order is host-side).

## Card artwork

All card and board art is generated by `scripts/generate-cards.js` (run it with
`bun run cards:generate`; `dev` and `build` run it automatically). It writes
standalone SVGs into `src/components/ui/assets/cards/` and `.../tiles/`, named
after the engine's card codes (`7-h`, `a-s`; jacks as
`jack-{one,two}-eyed-*`). `PlayingCard.tsx` imports them as URLs, so each SVG
keeps its own internal `<defs>` ids instead of colliding with other inlined
faces. Change the artwork by editing the generator, never the generated files.

## Networking model

`src/lib/p2p.ts` wraps PeerJS:

- The **host** creates a peer whose ID *is* the room ID (short id in the URL).
- The **client** connects to that peer ID with a single data connection.
- The host peer and role/room ids are kept in a **module-level singleton** and
  `sessionStorage`, so a reload in the same tab reclaims its role and peer id
  (multiple tabs can host different rooms independently).
- Message protocol (defined in `src/lib/sequence/index.ts`):
  - host → client: `start`, `state { state, hand }`
  - client → host: `action { type, payload }` (loosely typed on the wire;
    the host validates everything)

The host folds pending mandatory draws into one state update before
publishing (`settleDraws`), so a turn arrives as a single paint.

## Rendering / persistence

- The app is **prerendered at build time**: `vite build` renders `/`, `/about`,
  `/room` and a `/404` page through the built server handler and writes the HTML
  into `dist/client` (`prerender-crawler`, seeded in `vite.config.ts`). The
  deployed artifact is files only; the browser hydrates the rendered markup.
  `BASE_PATH` support exists for GitHub Pages (`gh-pages:build` /
  `gh-pages:deploy`), which is also why prerender seeds are submitted with the
  base prefix while output filenames stay base-free.
- Because every page is also rendered on the server once, component bodies must
  stay free of browser APIs: `routes/room` reads its session in `onSettled` and
  renders an unresolved branch that matches between server and client.
- The host persists `{ state, secrets }` to `sessionStorage` on every change,
  so a host tab reload resumes the exact game (and the client reload gets a
  fresh `state` + its hand re-sent on reconnect).

## Key invariants (do not break)

1. `reducer()` must stay pure and see only public facts.
2. Hidden info (deck order, hand contents) must never appear in a broadcast
   payload or in `SequenceState`.
3. `SequenceSecrets.prepareProposal` must mirror every public precondition the
   reducer checks, in the same order, before mutating secrets.
4. Seat ids double as chip colors (`"blue"` = host, `"green"` = client); the
   host seat is `turnOrder[0]`.
