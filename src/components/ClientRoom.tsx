import type { DataConnection, Peer } from "peerjs";
import { useNavigate } from "@solidjs/router";
import { createSignal, onCleanup, onSettled, Show } from "solid-js";
import SequenceGame from "~/components/SequenceGame";
import GameResultDialog from "~/components/GameResultDialog";
import TeamAvatar from "~/components/ui/TeamAvatar";
import {
  createInitialState,
  type Card,
  type ClientMessage,
  type HostMessage,
  type SequenceState,
} from "~/lib/sequence";
import { joinRoom, leaveRoom } from "~/lib/p2p";
import { appPath } from "~/lib/paths";

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 2000;
// How long a proposal (or the post-reconnect handshake) may go unanswered
// before the data channel is considered dead. The host answers EVERY action
// with a "state" message, so silence means the channel is black-holed —
// something WebRTC can do without ever firing "close", which is what used to
// leave the board stuck until a manual refresh.
const RESPONSE_TIMEOUT_MS = 8000;

export default function ClientRoom(props: { roomId: string }) {
  const navigate = useNavigate();
  const [status, setStatus] = createSignal<
    "connecting" | "connected" | "disconnected"
  >("connecting");
  const [error, setError] = createSignal<string | null>(null);
  const [gameState, setGameState] = createSignal<SequenceState>(createInitialState());
  const [hand, setHand] = createSignal<Card[]>([]);

  let connection: DataConnection | undefined;
  let peer: Peer | undefined;
  let retries = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let responseTimer: ReturnType<typeof setTimeout> | undefined;

  const clearResponseTimer = () => {
    if (responseTimer) {
      clearTimeout(responseTimer);
      responseTimer = undefined;
    }
  };

  /** Expect a "state" message soon, or treat the channel as dead. */
  const armResponseTimer = () => {
    clearResponseTimer();
    responseTimer = setTimeout(() => {
      responseTimer = undefined;
      handleDisconnect();
    }, RESPONSE_TIMEOUT_MS);
  };

  const handleDisconnect = () => {
    // Callers identity-check the connection first, so a late "close" from one
    // we already replaced (or closed ourselves below) is a no-op.
    clearResponseTimer();
    const conn = connection;
    connection = undefined;
    if (conn) {
      try {
        conn.close();
      } catch {
        // already closed
      }
    }
    setStatus("disconnected");
    scheduleRetry();
  };

  const connect = async () => {
    try {
      // joinRoom always creates a fresh client peer; destroy the half-dead one
      // from a previous attempt so it doesn't leak its signaling socket.
      if (peer) {
        const stale = peer;
        peer = undefined;
        connection = undefined;
        try {
          stale.destroy();
        } catch {
          // already dead
        }
      }
      const room = await joinRoom(props.roomId);
      peer = room.peer;
      const conn = room.connection;
      connection = conn;
      retries = 0;
      setStatus("connected");

      conn.on("close", () => {
        if (connection !== conn) return;
        handleDisconnect();
      });
      conn.on("error", () => {
        if (connection !== conn) return;
        // peerjs only logs send failures ("Connection is not open yet", …) —
        // treat any connection error as a disconnect and reconnect.
        handleDisconnect();
      });
      conn.on("data", (raw) => {
        const msg = raw as HostMessage;
        if (msg.type === "start") {
          setGameState(createInitialState());
          setHand([]);
        } else if (msg.type === "state") {
          // Any authoritative state proves the channel is alive.
          clearResponseTimer();
          // State + own hand arrive together, so a turn applies in one batch:
          // the hand never renders in its intermediate (one card short) form.
          // Solid 2 stages writes and commits them on the next microtask, so
          // these two writes share one render pass without an explicit batch.
          setGameState(msg.state);
          setHand(msg.hand);
        }
      });
      // The host answers every connection with an initial "state" (lobby or
      // game); expect it like a proposal response so a lost handshake
      // reconnects instead of parking the lobby forever.
      armResponseTimer();
    } catch (err) {
      if (retries < MAX_RETRIES) {
        scheduleRetry();
      } else {
        setError(err instanceof Error ? err.message : "Failed to join room");
      }
    }
  };

  const scheduleRetry = () => {
    if (retryTimer) return;
    if (retries >= MAX_RETRIES) {
      setStatus("disconnected");
      return;
    }
    retries += 1;
    setStatus("connecting");
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      void connect();
    }, RETRY_DELAY_MS);
  };

  onSettled(() => {
    void connect();
  });

  onCleanup(() => {
    if (retryTimer) clearTimeout(retryTimer);
    clearResponseTimer();
    // joinRoom's peer is a fresh client peer, not the shared host singleton;
    // destroying it also closes the data connection.
    try {
      peer?.destroy();
    } catch {
      // already dead
    }
  });

  // Proposals are validated by the host against the hidden information —
  // the client only ever sees the public state plus its own hand.
  const propose = (type: string, payload?: unknown) => {
    const conn = connection;
    if (!conn || !conn.open) {
      // peerjs drops sends on a closed connection with a logged error only;
      // treat it as a disconnect instead of silently eating the move.
      if (conn) handleDisconnect();
      return;
    }
    conn.send({ type: "action", action: { type, payload } } satisfies ClientMessage);
    // The host answers every action with an authoritative "state" (broadcast
    // on accept, resync on reject). Silence beyond the timeout means the
    // channel is black-holed: reconnect, which is what a manual refresh used
    // to be needed for.
    armResponseTimer();
  };

  // Leave wipes this tab's room session before navigating home; onCleanup
  // closes the data connection as the component unmounts.
  const leave = () => {
    leaveRoom(props.roomId);
    navigate(appPath("/"));
  };

  // Two-phase layout mirrors HostRoom: a lobby card while waiting for the
  // host to start, then the game card. Connection status surfaces inside the
  // lobby card since the client has nothing else to show before the game.
  return (
    <Show
      when={gameState().phase === "lobby"}
      fallback={
        // Definite height so the game shell can fill it: the board sizes
        // itself from the space that is actually left, not from viewport
        // magic numbers.
        <div class="flex h-[calc(100dvh-2rem)] w-full flex-col gap-4">
          {/* Floating status toast: fixed so a dropped connection never
              reflows the height-constrained board. It overlays the header
              (which has no controls) instead of pushing the game down. */}
          <Show when={status() !== "connected" || error()}>
            <div
              class="alert alert-warning pointer-events-none fixed left-1/2 top-4 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2"
              role="alert"
            >
              <Show
                when={status() === "connecting" && !error()}
                fallback={<span>Connection lost — reload the page to retry.</span>}
              >
                <span class="loading loading-spinner" />
                <span>Reconnecting to host…</span>
              </Show>
            </div>
          </Show>
          <SequenceGame
            roomId={props.roomId}
            state={gameState()}
            seat="green"
            players={[
              {
                seat: "blue",
                name: gameState().players.blue?.name ?? "Host",
                color: "blue",
                connected: status() === "connected",
                you: false,
              },
              {
                seat: "green",
                name: gameState().players.green?.name ?? "Guest",
                color: "green",
                connected: status() === "connected",
                you: true,
              },
            ]}
            hand={hand()}
            onPropose={propose}
            onLeave={leave}
          />
          <GameResultDialog state={gameState()} isHost={false} onLeave={leave} />
        </div>
      }
    >
      <section class="card w-full max-w-2xl bg-base-100">
        <div class="card-body">
          {/* One line, always: the controls are compact and the title never
              wraps, so nothing can push the header onto a second row. */}
          <div class="flex flex-nowrap items-center justify-between gap-3">
            <h2 class="shrink-0 whitespace-nowrap font-display text-3xl uppercase tracking-tight">
              Game Lobby
            </h2>
            {/* Leave sits top-right, matching the in-game header. */}
            <button
              class="btn btn-quiet btn-sm shrink-0"
              onClick={leave}
              type="button"
            >
              Leave
            </button>
          </div>
          {/* The lobby is where the id is actually useful (manual join,
              debugging), so it lives here rather than in the header. */}
          <div class="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span class="text-xs font-bold uppercase tracking-wider opacity-60">
              Room ID
            </span>
            <span class="select-all break-all font-mono text-xs font-semibold">
              {props.roomId}
            </span>
          </div>
          <p class="mt-2 text-sm font-medium text-base-content/70">
            You're connected to the host. The game starts when they're ready.
          </p>
          {/* Two-player only: the client tab is itself a player, so the
              count is 2 once connected to the host. */}
          <h3 class="card-title mt-6 font-display uppercase">
            Players ({status() === "connected" ? 2 : 1})
          </h3>
          <ul class="mt-2 space-y-2 text-sm font-medium">
            <li class="flex items-center gap-2">
              <TeamAvatar color="blue" label="B" /> Host
            </li>
            <li class="flex items-center gap-2">
              <TeamAvatar color="green" label="G" /> You (guest)
            </li>
          </ul>
          <div class="flex justify-end mt-6">
            <Show
              when={!error()}
              fallback={
                <div class="alert alert-error w-fit">
                  <span>{error()}</span>
                </div>
              }
            >
              <Show
                when={status() === "connected"}
                fallback={
                  <Show
                    when={status() === "connecting"}
                    fallback={
                      <div class="alert alert-error w-fit">
                        <span>Disconnected from host.</span>
                      </div>
                    }
                  >
                    <div class="flex items-center gap-2">
                      <span class="loading loading-spinner" /> Connecting to host…
                    </div>
                  </Show>
                }
              >
                <div class="flex items-center gap-2">
                  <span class="loading loading-spinner" /> Waiting for host to start…
                </div>
              </Show>
            </Show>
          </div>
        </div>
      </section>
    </Show>
  );
}
