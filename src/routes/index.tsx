import { Title } from "@solidjs/meta";
import { useNavigate } from "@solidjs/router";
import { createSignal, For, Show } from "solid-js";
import PlayingCard from "~/components/ui/PlayingCard";
import { MemphisBackdrop } from "~/components/ui/Memphis";
import { appPath } from "~/lib/paths";
import { createRoom } from "~/lib/p2p";
import "./index.css";

const MARQUEE_ITEMS = [
  "Play",
  "Share",
  "Hilera",
  "Five in a row",
  "No sign-up",
  "Two players",
];

const STEPS = [
  {
    tone: "pink",
    title: "Create a room",
    body: "Hit create and your browser becomes the host. No account, no install, no game server.",
  },
  {
    tone: "blue",
    title: "Share the link",
    body: "Send the invite link to a friend. They land straight in your lobby, ready to play.",
  },
  {
    tone: "yellow",
    title: "Race to five",
    body: "Play a card, place a chip, draw a new one. Claim two sequences before your rival does.",
  },
] as const;

const FEATURES = [
  {
    icon: "🔒",
    title: "Private rooms",
    body: "Only people with the invite link can join your table.",
  },
  {
    icon: "⚡",
    title: "Peer-to-peer",
    body: "Moves travel directly between browsers over WebRTC.",
  },
  {
    icon: "🔁",
    title: "Instant rematch",
    body: "One click resets the board for another round.",
  },
  {
    icon: "🛡️",
    title: "Fair play",
    body: "The host validates every move before it reaches the board.",
  },
] as const;

/**
 * Accept either a raw room id or a full invite link. Links carry the id in
 * their `?id=` query param, so pasting the shared URL just works.
 */
function extractRoomId(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed, "http://hilera.local");
    const id = url.searchParams.get("id");
    if (id?.trim()) return id.trim();
  } catch {
    // Not a URL — fall through and treat the input as a raw room id.
  }
  return trimmed;
}

export default function Home() {
  const navigate = useNavigate();
  const [creating, setCreating] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [joinId, setJoinId] = createSignal("");
  let joinDialog: HTMLDialogElement | undefined;

  const openJoinDialog = () => {
    setJoinId("");
    joinDialog?.showModal();
  };

  const closeJoinDialog = () => {
    joinDialog?.close();
  };

  const handleJoinRoom = (event: SubmitEvent) => {
    event.preventDefault();
    const id = extractRoomId(joinId());
    if (!id) return;
    navigate(appPath(`/room?id=${encodeURIComponent(id)}`));
  };

  const handleCreateRoom = async () => {
    setCreating(true);
    setError(null);
    try {
      const room = await createRoom();
      navigate(appPath(`/room?id=${room.roomId}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create room");
      setCreating(false);
    }
  };

  return (
    <main class="landing">
      <Title>Hilera — five in a row, online</Title>
      <MemphisBackdrop />

      <div class="landing-inner">
        <nav class="landing-nav">
          <a class="landing-logo" href={appPath("/")}>
            <span class="landing-logo-mark" aria-hidden="true">
              ✦
            </span>
            Hilera
          </a>
          <div class="landing-nav-links">
            <a href="#how">How to play</a>
            <a href={appPath("/about")}>About</a>
          </div>
        </nav>

        <section class="landing-hero">
          <div>
            <span class="landing-kicker">
              2 players · no sign-up · peer-to-peer
            </span>
            <h1 class="landing-title">
              <span class="landing-title-main">Hilera</span>
              <span class="landing-title-sub">Five in a row wins</span>
            </h1>
            <p class="landing-lede">
              A card-and-board game, rebuilt for the browser. Create a room,
              send the link to a friend, and race to claim two sequences before
              they do.
            </p>
            <div class="landing-actions">
              <button
                class="btn btn-primary btn-lg"
                disabled={creating()}
                onClick={handleCreateRoom}
                type="button"
              >
                {creating() ? "Creating room…" : "Create room"}
              </button>
              <button
                class="btn btn-secondary btn-lg"
                disabled={creating()}
                onClick={openJoinDialog}
                type="button"
              >
                Join room
              </button>
            </div>
            <p class="landing-note">
              No account · no install
            </p>
            <Show when={error()}>
              {(message) => (
                <p class="alert alert-error mt-6" role="alert">
                  {message()}
                </p>
              )}
            </Show>
          </div>

          <div class="landing-art" aria-hidden="true">
            <div class="landing-art-blob" />
            <div class="landing-art-fan">
              <div class="landing-art-card landing-art-card--1">
                <PlayingCard card={{ rank: "A", suit: "S" }} variant="full" />
              </div>
              <div class="landing-art-card landing-art-card--2">
                <PlayingCard card={{ rank: "7", suit: "H" }} variant="full" />
              </div>
              <div class="landing-art-card landing-art-card--3">
                <PlayingCard card={{ rank: "J", suit: "D" }} variant="full" />
              </div>
            </div>
            <span class="landing-art-chip landing-art-chip--blue" />
            <span class="landing-art-chip landing-art-chip--green" />
            <span class="landing-art-sticker">5 in a row</span>
            <svg
              class="landing-art-zigzag"
              viewBox="0 0 100 40"
              fill="none"
              aria-hidden="true"
            >
              <polyline
                points="4,30 20,10 36,30 52,10 68,30 84,10 96,24"
                stroke="currentColor"
                stroke-width="8"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </div>
        </section>
      </div>

      <div class="landing-marquee" aria-hidden="true">
        <div class="landing-marquee-track">
          <For each={[0, 1]}>
            {() => (
              <div class="landing-marquee-group">
                <For each={MARQUEE_ITEMS}>
                  {(item) => (
                    <span class="landing-marquee-item">
                      {item}
                      <span>✦</span>
                    </span>
                  )}
                </For>
              </div>
            )}
          </For>
        </div>
      </div>

      <div class="landing-inner">
        <section id="how" class="landing-section">
          <div class="landing-section-head">
            <h2 class="landing-section-title">
              How it <em>works</em>
            </h2>
            <p class="landing-section-lede">
              Three steps, zero setup. The host tab is the authority — no game
              server in the middle.
            </p>
          </div>
          <div class="landing-steps">
            <For each={STEPS}>
              {(step, index) => (
                <article class={`landing-step landing-step--${step.tone}`}>
                  <span class="landing-step-num">
                    {String(index() + 1).padStart(2, "0")}
                  </span>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </article>
              )}
            </For>
          </div>
        </section>

        <section class="landing-section">
          <div class="landing-section-head">
            <h2 class="landing-section-title">
              What you <em>get</em>
            </h2>
          </div>
          <div class="landing-features">
            <For each={FEATURES}>
              {(feature) => (
                <article class="landing-feature">
                  <span class="landing-feature-icon" aria-hidden="true">
                    {feature.icon}
                  </span>
                  <h3>{feature.title}</h3>
                  <p>{feature.body}</p>
                </article>
              )}
            </For>
          </div>
        </section>
      </div>

      <footer class="landing-footer">
        <div class="landing-footer-inner">
          <span class="font-display text-lg uppercase">Hilera</span>
          <p class="text-sm">
            Built with SolidJS 2 + WebRTC. No game server, no tracking.
          </p>
          <a href={appPath("/about")}>About the game →</a>
        </div>
      </footer>

      <dialog class="modal" ref={joinDialog}>
        <div class="modal-box">
          <h3 class="font-display text-2xl uppercase">Join a room</h3>
          <p class="mt-2 text-sm font-medium text-base-content/70">
            Paste the invite link your friend sent, or type the room ID.
          </p>
          <form class="mt-5" onSubmit={handleJoinRoom}>
            <input
              class="input w-full"
              onInput={(e) => setJoinId(e.currentTarget.value)}
              placeholder="Room ID or invite link"
              type="text"
              value={joinId()}
            />
            <div class="modal-action">
              <button
                class="btn btn-ghost"
                onClick={closeJoinDialog}
                type="button"
              >
                Cancel
              </button>
              <button
                class="btn btn-primary"
                disabled={!extractRoomId(joinId())}
                type="submit"
              >
                Join room
              </button>
            </div>
          </form>
        </div>
        <form class="modal-backdrop" method="dialog">
          <button type="button">close</button>
        </form>
      </dialog>
    </main>
  );
}
