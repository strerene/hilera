import { Title } from "@solidjs/meta";
import { MemphisBackdrop } from "~/components/ui/Memphis";
import { appPath } from "~/lib/paths";

/**
 * Privacy notice. Kept as a route (not a modal) so it is prerendered to its own
 * HTML file and can be linked from the footer and the about page.
 *
 * Everything below must stay true to the code: the storage keys are the ones in
 * `src/lib/p2p.ts` and `src/components/HostRoom.tsx`, and the only third parties
 * are the PeerJS signaling server, the peer's browser, and the static host.
 */
export default function Privacy() {
  return (
    <main class="page">
      <Title>Privacy — Hilera</Title>
      <MemphisBackdrop />
      <div class="page-inner">
        {/* Base-aware: a bare `href="/"` is outside `/hilera` on GitHub Pages. */}
        <a class="page-back" href={appPath("/")}>
          ← Back to the game
        </a>
        <h1 class="page-title">Privacy</h1>
        <p class="mt-6 max-w-2xl text-lg font-medium leading-relaxed">
          Hilera has no accounts, no analytics, and no game server. This page
          explains the little data the game does touch, and where it goes.
        </p>

        <section class="page-card">
          <h2>What stays in your browser</h2>
          <p>
            Hilera stores a few values in <code>sessionStorage</code> — per-tab
            storage that disappears when you close the tab:
          </p>
          <ul>
            <li>
              <code>peerRole</code> and <code>peerRoomId</code> — whether this
              tab is hosting or joining, and which room.
            </li>
            <li>
              <code>hostPeerId:&lt;roomId&gt;</code> — the host's signaling id,
              so a reload can reclaim the same room.
            </li>
            <li>
              <code>game:&lt;roomId&gt;</code> — the host tab's snapshot of the
              game (board, deck order, and both hands), so a reload can resume
              the exact game.
            </li>
          </ul>
          <p>
            Nothing is written to cookies or <code>localStorage</code>, and
            nothing is sent to us. Leaving the room or closing the tab clears
            it.
          </p>
        </section>

        <section class="page-card">
          <h2>Who else is involved</h2>
          <p>
            Three parties help deliver the game. None of them is us, and none
            receives your data from us:
          </p>
          <ul>
            <li>
              <strong>The static host.</strong> This site is served by GitHub
              Pages, which may log requests (including IP addresses) as
              described in GitHub's privacy statement.
            </li>
            <li>
              <strong>The PeerJS signaling server.</strong> To introduce two
              browsers, the game uses the public PeerJS broker
              (<code>0.peerjs.com</code> by default). It sees your IP address,
              connection metadata, and the room id while a connection is being
              set up.
            </li>
            <li>
              <strong>The other player.</strong> Once connected, moves travel
              directly between browsers over WebRTC. WebRTC can reveal your
              public IP address to the peer you are playing with, and the room
              id is in the invite link — anyone who has the link can join.
            </li>
          </ul>
          <p>
            There are no ads, no analytics, no tracking pixels, and no
            third-party fonts or scripts: the fonts are served from this site.
          </p>
        </section>

        <section class="page-card">
          <h2>Your rights</h2>
          <p>
            We do not run a server and do not store personal data, so there is
            nothing for us to export or delete. If you are in the EU or UK, the
            signaling server's processing is covered by PeerJS's own policy, and
            the direct peer connection is between you and the other player.
          </p>
          <p>
            Questions or a takedown request? Open an issue on the{" "}
            <a href="https://github.com/strerene/hilera/issues">
              project repository
            </a>
            .
          </p>
        </section>

        <section class="page-card">
          <h2>Children</h2>
          <p>
            Hilera is not directed at children under 13 and collects no personal
            information from anyone.
          </p>
        </section>

        <section class="page-card">
          <h2>License and credits</h2>
          <p>
            Hilera's source code is available under the{" "}
            <a href={appPath("/LICENSE.txt")}>
              Functional Source License 1.1 (FSL-1.1-MIT)
            </a>
            , and its card and tile artwork under{" "}
            <a href={appPath("/LICENSE-ASSETS.txt")}>CC BY-NC-ND 4.0</a>. The
            bundled libraries are listed with their copyright notices and
            license texts in the{" "}
            <a href={appPath("/THIRD-PARTY.txt")}>third-party notices</a>. The
            Archivo Black and Space Grotesk fonts are used under the SIL Open
            Font License 1.1; their license texts ship as{" "}
            <a href={appPath("/fonts/OFL-ArchivoBlack.txt")}>
              OFL-ArchivoBlack.txt
            </a>{" "}
            and{" "}
            <a href={appPath("/fonts/OFL-SpaceGrotesk.txt")}>
              OFL-SpaceGrotesk.txt
            </a>
            .
          </p>
        </section>

        <p class="mt-8 text-sm font-medium text-base-content/70">
          Last updated: 18 November 2026.
        </p>
      </div>
    </main>
  );
}
