import type { DataConnection, Peer } from "peerjs";
import { useNavigate } from "@solidjs/router";
import {
  createEffect,
  createSignal,
  For,
  onCleanup,
  onSettled,
  Show,
} from "solid-js";
import HileraGame from "~/components/HileraGame";
import GameResultDialog from "~/components/GameResultDialog";
import TeamAvatar from "~/components/ui/TeamAvatar";
import {
  SEQUENCE_SEATS,
  SequenceSecrets,
  createInitialState,
  reducer,
  type ClientMessage,
  type GameAction,
  type HostMessage,
  type SequenceState,
  type SerializedSecrets,
} from "~/lib/sequence";
import { leaveRoom } from "~/lib/p2p";
import { appPath } from "~/lib/paths";

const gameKey = (roomId: string) => `game:${roomId}`;

export default function HostRoom(props: { roomId: string; peer: Peer }) {
  const navigate = useNavigate();
  const [conns, setConns] = createSignal<DataConnection[]>([]);
  const [copiedLink, setCopiedLink] = createSignal(false);
  const [gameState, setGameState] =
    createSignal<SequenceState>(createInitialState());
  // secrets is a mutable host-side class (not a signal), so a version counter
  // tracks hand changes for reactivity.
  const [handVersion, setHandVersion] = createSignal(0);

  // Hidden information (deck order + hands) lives host-side only.
  const secrets = new SequenceSecrets();

  // Survive the host's own reload within the same tab, and wire up peers.
  // `restored` gates the persistence effect below: the snapshot must be read
  // before anything writes it back, or a reload would clobber the saved game
  // with the initial lobby state.
  let restored = false;
  onSettled(() => {
    const saved = sessionStorage.getItem(gameKey(props.roomId));
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as {
          state: SequenceState;
          secrets: SerializedSecrets;
        };
        // States are published only at turn boundaries, so any snapshot is
        // directly resumable — no mid-turn fold needed.
        setGameState(parsed.state);
        secrets.restore(parsed.secrets);
      } catch {
        // stale/corrupt snapshot — start clean
      }
    }
    restored = true;

    props.peer.on("connection", (conn: DataConnection) => {
      conn.on("open", () => {
        // Two-player game: exactly one guest seat. Adopt the newest connection
        // (a reconnecting client replaces its own black-holed channel) and
        // close any older ones, so a second guest can't act as the same seat.
        const previous = conns();
        setConns([conn]);
        for (const old of previous) {
          if (old === conn) continue;
          try {
            old.close();
          } catch {
            // already closed
          }
        }
        // Client reloaded mid-game (or joined late): give it the current
        // game and its own hand so it doesn't sit on "waiting for host…".
        // Sent in the lobby phase too (an initial lobby state) so the
        // client's reconnect handshake ALWAYS completes with a state
        // message — it treats unanswered connects as a dead channel.
        conn.send({ type: "start" } satisfies HostMessage);
        conn.send({
          type: "state",
          state: gameState(),
          hand: secrets.handOf("green"),
        } satisfies HostMessage);
      });
      conn.on("close", () => {
        setConns((prev) => prev.filter((c) => c !== conn));
      });
      conn.on("data", (raw) => handleData(raw));
    });
  });

  onCleanup(() => {
    props.peer.destroy();
    // Drop the module singleton and this tab's room session too: otherwise a
    // later "create room" would reuse this destroyed peer (e.g. after the
    // browser Back button), and the dead room's snapshot would linger.
    sessionStorage.removeItem(gameKey(props.roomId));
    leaveRoom(props.roomId);
  });

  // Persist the public state plus the hidden deck/hands so a reloaded host
  // tab can resume the exact game it was running.
  createEffect(
    () => gameState(),
    (state) => {
      if (!restored) return;
      sessionStorage.setItem(
        gameKey(props.roomId),
        JSON.stringify({ state, secrets: secrets.serialize() }),
      );
    },
  );

  const broadcast = (msg: HostMessage) => {
    // A dying channel drops sends silently (peerjs only logs an error event)
    // and its "close" event may never fire, so prune non-open connections
    // here instead of feeding a black hole.
    const live = conns().filter((conn) => conn.open);
    if (live.length !== conns().length) setConns(live);
    for (const conn of live) {
      try {
        conn.send(msg);
      } catch {
        // Transport-level failure: the client's response watchdog will
        // reconnect, and the reconnect handshake resends this state.
      }
    }
  };

  /** Push the authoritative state + guest hand to every open client. */
  const resyncClients = () => {
    broadcast({
      type: "state",
      state: gameState(),
      hand: secrets.handOf("green"),
    });
  };

  /** Reactive accessor over the mutable secrets for the host's own hand. */
  const myHand = () => {
    handVersion();
    return secrets.handOf("blue");
  };

  /**
   * The host is the authority: it validates proposals against the hidden
   * information (secrets), applies the pure reducer, then publishes the new
   * public state and the affected player's hand. An accepted proposal always
   * commits (prepareProposal dry-runs the reducer), so a no-op result can
   * only mean an unknown/malformed action — resynced below for safety.
   */
  const applyAction = (
    seat: string,
    action: { type: string; payload?: unknown },
  ) => {
    const prepared = secrets.prepareProposal(
      gameState(),
      seat,
      action.type,
      action.payload,
    );
    if (prepared === null) {
      // Rejected. Answer anyway: the client treats every proposal as needing
      // an authoritative response, and it may be acting on a stale view —
      // the resync gets it back to the true state instead of a dead turn.
      resyncClients();
      return;
    }
    const next = reducer(gameState(), {
      type: action.type as GameAction["type"],
      playerId: seat,
      payload: prepared.payload,
    });
    if (next === gameState()) {
      resyncClients();
      return;
    }
    publish(next);
  };

  /** Adopt a new state, bump hand reactivity, and sync all clients. */
  const publish = (next: SequenceState, announce = false) => {
    // Solid 2 stages both writes and commits them in one microtask batch, so
    // state + hand version still apply in a single render pass.
    setGameState(next);
    setHandVersion((v) => v + 1); // a committed action may have changed hands
    if (announce) broadcast({ type: "start" });
    broadcast({
      type: "state",
      state: next,
      hand: secrets.handOf("green"),
    });
  };

  const handleData = (raw: unknown) => {
    const msg = raw as ClientMessage;
    if (msg?.type !== "action" || !msg.action?.type) return;
    try {
      applyAction("green", msg.action);
    } catch {
      // Malformed payload (peerjs delivers whatever the peer sent, e.g. a
      // destructuring TypeError): resync instead of dropping the message.
      resyncClients();
    }
  };

  const startGame = () => {
    // Setup is host-only code: shuffle + deal live in the secrets, and the
    // public deal facts are folded straight into a fresh playing state.
    const deal = secrets.deal([...SEQUENCE_SEATS]);
    publish(
      {
        ...createInitialState(),
        phase: "playing",
        handCounts: deal.handCounts,
        deckCount: deal.deckCount,
        discards: Object.fromEntries(SEQUENCE_SEATS.map((seat) => [seat, []])),
      },
      true,
    );
  };


  // Leave wipes this tab's room session (role, ids, game snapshot) before
  // navigating home; onCleanup destroys the peer as the component unmounts.
  const leave = () => {
    sessionStorage.removeItem(gameKey(props.roomId));
    leaveRoom(props.roomId);
    navigate(appPath("/"));
  };

  // Build the invite link from the deployment base rather than the current
  // pathname: the host may be sitting on `/hilera/room/` after a redirect, and
  // the link should be the same tidy URL every time.
  const copyRoomLink = async () => {
    const link = `${window.location.origin}${appPath("/room")}?id=${encodeURIComponent(props.roomId)}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Clipboard access can be denied (insecure origin, permissions). The
      // link is still visible in the lobby, so failing quietly is fine.
    }
  };

  return (
    <Show
      when={gameState().phase === "lobby"}
      fallback={
        // Definite height so the game shell can fill it: the board sizes
        // itself from the space that is actually left, not from viewport
        // magic numbers.
        <div class="flex h-[calc(100dvh-2rem)] w-full flex-col gap-4">
          <HileraGame
            roomId={props.roomId}
            state={gameState()}
            seat="blue"
            players={[
              {
                seat: "blue",
                name: gameState().players.blue?.name ?? "Host",
                color: "blue",
                connected: true,
                you: true,
              },
              {
                seat: "green",
                name: gameState().players.green?.name ?? "Guest",
                color: "green",
                connected: conns().length > 0,
                you: false,
              },
            ]}
            hand={myHand()}
            onPropose={(type, payload) =>
              applyAction("blue", { type, payload })
            }
            onLeave={leave}
          />
          <GameResultDialog
            state={gameState()}
            isHost
            onRematch={startGame}
            onLeave={leave}
          />
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
            Share the invite link — your friend joins straight into this lobby.
          </p>
          <h3 class="card-title mt-6 font-display uppercase">
            Players ({conns().length + 1})
          </h3>
          <ul class="mt-2 space-y-2 text-sm font-medium">
            <li class="flex items-center gap-2">
              <TeamAvatar color="blue" label="B" /> You (host)
            </li>
            <For each={conns()}>
              {(conn) => (
                <li class="flex items-center gap-2">
                  <TeamAvatar color="green" label="G" /> Guest
                </li>
              )}
            </For>
          </ul>
          <div class="card-actions mt-6 justify-end">
            <button class="btn" onClick={copyRoomLink} type="button">
              {copiedLink() ? "Copied!" : "Copy link"}
            </button>
            <button
              class="btn btn-primary"
              disabled={conns().length === 0}
              onClick={startGame}
              type="button"
            >
              {conns().length === 0 ? "Waiting for players…" : "Start game"}
            </button>
          </div>
        </div>
      </section>
    </Show>
  );
}
