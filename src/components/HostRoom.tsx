import type { DataConnection, Peer } from "peerjs";
import { useNavigate } from "@solidjs/router";
import {
  batch,
  createEffect,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import SequenceGame from "~/components/SequenceGame";
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

const gameKey = (roomId: string) => `game:${roomId}`;

export default function HostRoom(props: { roomId: string; peer: Peer }) {
  const navigate = useNavigate();
  const [conns, setConns] = createSignal<DataConnection[]>([]);
  const [copied, setCopied] = createSignal(false);
  const [copiedLink, setCopiedLink] = createSignal(false);
  const [gameState, setGameState] =
    createSignal<SequenceState>(createInitialState());
  // secrets is a mutable host-side class (not a signal), so a version counter
  // tracks hand changes for reactivity.
  const [handVersion, setHandVersion] = createSignal(0);

  // Hidden information (deck order + hands) lives host-side only.
  const secrets = new SequenceSecrets();

  // Survive the host's own reload within the same tab, and wire up peers.
  onMount(() => {
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

    props.peer.on("connection", (conn: DataConnection) => {
      conn.on("open", () => {
        setConns((prev) => [...prev, conn]);
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
  });

  // Persist the public state plus the hidden deck/hands so a reloaded host
  // tab can resume the exact game it was running.
  createEffect(() => {
    sessionStorage.setItem(
      gameKey(props.roomId),
      JSON.stringify({ state: gameState(), secrets: secrets.serialize() }),
    );
  });

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
    // One batch: state + hand version apply in a single render pass.
    batch(() => {
      setGameState(next);
      setHandVersion((v) => v + 1); // a committed action may have changed hands
    });
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

  const copyRoomId = async () => {
    await navigator.clipboard.writeText(props.roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Leave wipes this tab's room session (role, ids, game snapshot) before
  // navigating home; onCleanup destroys the peer as the component unmounts.
  const leave = () => {
    sessionStorage.removeItem(gameKey(props.roomId));
    leaveRoom(props.roomId);
    navigate("/");
  };

  // Build the invite link from the current URL so a BASE_PATH deployment
  // (e.g. GitHub Pages) is handled automatically.
  const copyRoomLink = async () => {
    const link = `${window.location.origin}${window.location.pathname}?id=${encodeURIComponent(props.roomId)}`;
    await navigator.clipboard.writeText(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <Show
      when={gameState().phase === "lobby"}
      fallback={
        <div class="flex min-h-[calc(100dvh-2rem)] w-full flex-col items-center gap-4">
          <SequenceGame
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
      <section class="card bg-base-100 shadow-xl w-full max-w-2xl">
        <div class="card-body">
          <div class="flex justify-between items-center">
            <h2 class="text-3xl font-bold">Game Lobby</h2>
            <span class="badge badge-xs badge-warning">{props.roomId}</span>
          </div>
          <h3 class="card-title mt-6">Players ({conns().length + 1})</h3>
          <ul class="space-y-2 text-sm mt-1.5">
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
          <div class="card-actions justify-end">
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
