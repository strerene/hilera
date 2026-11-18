import { HydrationScript } from "@solidjs/web";
import type { ParentProps } from "solid-js";

/**
 * Document shell. It is rendered twice: on the server, once per page during the
 * build-time crawl (the emitted HTML is the deployment), and again on the client
 * when `hydrate()` claims the whole document. Every tag here must therefore be
 * identical on both sides — `import.meta.env.BASE_URL` is a build constant, so
 * the asset links below are.
 *
 * `HydrationScript` is what lets the client claim the server's nodes.
 *
 * No `<title>` here: each route's `<Title>` renders into the head on the server
 * too, so the emitted pages carry real per-route titles. Authoring one as well
 * would emit a second `<title>` that the head registry never adopts.
 *
 * There is no FOUC guard: the render-blocking stylesheet the plugin injects into
 * this head means the prerendered markup cannot paint unstyled, and hiding the
 * document until JS runs would throw away the point of prerendering it.
 */
export default function Document(props: ParentProps) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* Route-agnostic metadata for crawlers and link previews. The head
            registry does not manage these, so they are authored once here. */}
        <meta
          name="description"
          content="Hilera is a two-player card-and-board game played peer to peer in the browser. Create a room, share the link, and race to claim two sequences of five — no sign-up, no game server."
        />
        <meta name="theme-color" content="#ff5c8a" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Hilera" />
        <meta property="og:title" content="Hilera — five in a row, online" />
        <meta
          property="og:description"
          content="A two-player card-and-board game played peer to peer in the browser. Create a room, share the link, and race to claim two sequences of five."
        />
        <meta name="twitter:card" content="summary" />
        {/* SVG first (crisp at any size); the .ico is the raster fallback
            for browsers without SVG favicon support (Safari). */}
        <link
          rel="icon"
          href={`${import.meta.env.BASE_URL}favicon.svg`}
          type="image/svg+xml"
        />
        <link
          rel="alternate icon"
          href={`${import.meta.env.BASE_URL}favicon.ico`}
          sizes="16x16 32x32 48x48 64x64"
        />
        {/* Display + body faces are self-hosted via @font-face in app.css, so
            the page makes no third-party font request (no visitor IP leaves
            for Google). Fallbacks in app.css cover a failed font load. */}
        <HydrationScript />
      </head>
      <body>
        {props.children}
        {/* The prerendered pages are readable without JS; the room is not, since
            rooms only exist in a browser session. */}
        <noscript>
          <p style="max-width: 40rem; margin: 3rem auto; font-family: system-ui, sans-serif; line-height: 1.5">
            Hilera needs JavaScript to create or join a room: games are played
            entirely in the browser, with no server to fall back on. Enable
            JavaScript and reload to play.
          </p>
        </noscript>
      </body>
    </html>
  );
}
