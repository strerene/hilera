import { Title } from "@solidjs/meta";
import { MemphisBackdrop } from "~/components/ui/Memphis";
import { appPath } from "~/lib/paths";

export default function About() {
  return (
    <main class="page">
      <Title>About — Hilera</Title>
      <MemphisBackdrop />
      <div class="page-inner">
        {/* Base-aware: a bare `href="/"` is outside `/sequence` on GitHub Pages. */}
        <a class="page-back" href={appPath("/")}>
          ← Back to the game
        </a>
        <h1 class="page-title">About</h1>
        <p class="mt-6 max-w-2xl text-lg font-medium leading-relaxed">
          Hilera is a two-player card-and-board game. Play a card, place a
          chip on a matching space, and draw a replacement. Five chips in a row
          make a sequence — claim two sequences and the game is yours.
        </p>

        <section class="page-card">
          <h2>How a turn works</h2>
          <p>
            A turn is one atomic move: the card you play, the chip you place
            (or remove with a one-eyed jack), and the mandatory draw all commit
            together. If a card has no legal use, you may discard it once per
            turn and draw a replacement without ending your turn.
          </p>
        </section>

        <section class="page-card">
          <h2>Built for the browser</h2>
          <p>
            There is no game server. The hosting browser tab is the authority:
            it validates every move, keeps the deck and hands secret, and
            broadcasts only the public board state. Players connect directly
            over WebRTC, so a room is just a link.
          </p>
          <ul>
            <li>SolidJS 2 + Solid Router for the UI</li>
            <li>PeerJS / WebRTC for peer-to-peer play</li>
            <li>Tailwind CSS + daisyUI, restyled neobrutalist</li>
          </ul>
        </section>

        <a class="btn btn-primary mt-8" href={appPath("/")}>
          Create a room
        </a>
      </div>
    </main>
  );
}
