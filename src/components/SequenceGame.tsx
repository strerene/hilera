import { For, Show, createEffect, createMemo, createSignal, on, onCleanup } from "solid-js";
import type { BoardCell, Card, ChipColor, SequenceState } from "~/lib/sequence";
import {
  cardToString,
  cardCellIndices,
  isDeadCard,
  isOneEyedJack,
  isTwoEyedJack,
} from "~/lib/sequence";
import TeamAvatar from "~/components/ui/TeamAvatar";
import PlayingCard, { FreeSpace } from "~/components/ui/PlayingCard";
import RoomInfo from "~/components/ui/RoomInfo";
import "./SequenceGame.css";

function cardTitle(card: Card): string {
  if (isTwoEyedJack(card)) return "Two-eyed jack — place a chip on ANY open space";
  if (isOneEyedJack(card)) return "One-eyed jack — remove an opponent chip (locked chips are safe)";
  return cardToString(card);
}

// --- Board cell ----------------------------------------------------------------

function CellView(props: {
  cell: BoardCell;
  index: number;
  legal: boolean;
  sequenceFlash: boolean;
  lastMoveFlash: boolean;
  interactive: boolean;
  onCellClick: (index: number) => void;
}) {
  const click = () => props.interactive && props.onCellClick(props.index);
  const ariaLabel = () => {
    const cell = props.cell;
    const place = cell.card === "FREE" ? "Free corner space" : `Card ${cardToString(cell.card)}`;
    if (!cell.chip) return `${place}, empty${props.legal ? ", legal move" : ""}`;
    return `${place}, ${cell.chip.color} chip${cell.chip.locked ? " (locked)" : ""}`;
  };
  return (
    <div
      class="seq-cell"
      classList={{
        free: props.cell.card === "FREE",
        legal: props.legal,
        "sequence-flash": props.sequenceFlash,
        "last-move": props.lastMoveFlash,
        interactive: props.interactive,
      }}
      role={props.interactive ? "button" : undefined}
      tabIndex={props.interactive ? 0 : -1}
      aria-label={ariaLabel()}
      aria-disabled={props.interactive ? undefined : "true"}
      onClick={click}
      onKeyDown={(e) => {
        if (props.interactive && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          click();
        }
      }}
    >
      <Show
        when={props.cell.card !== "FREE" ? props.cell.card : null}
        keyed
        fallback={<FreeSpace />}
      >
        {(card) => <PlayingCard card={card} variant="square-small" />}
      </Show>
      <Show when={props.cell.chip} keyed>
        {(chip) => <span class={`seq-chip ${chip.color}`} classList={{ locked: chip.locked }} />}
      </Show>
    </div>
  );
}

// --- Hand card -------------------------------------------------------------------

function HandCardView(props: {
  card: Card;
  index: number;
  selected: boolean;
  dead: boolean;
  clickable: boolean;
  canExchange: boolean;
  onSelect: (index: number) => void;
}) {
  return (
    <button
      type="button"
      class="seq-hand-card"
      classList={{ selected: props.selected, dead: props.dead, playable: props.clickable }}
      disabled={!props.clickable}
      title={
        props.dead
          ? props.canExchange
            ? "Dead card (no legal use) — select it, then confirm to discard & draw a replacement"
            : "Dead card (no legal use right now)"
          : props.selected
            ? "Selected — click a highlighted board space (or pick another card)"
            : cardTitle(props.card)
      }
      onClick={() => props.onSelect(props.index)}
    >
      <PlayingCard card={props.card} variant="full" />
      <Show when={props.dead}>
        <span class="seq-dead-tag">dead</span>
      </Show>
    </button>
  );
}

// --- Game -------------------------------------------------------------------------

export interface PlayerStatus {
  seat: string;
  name: string;
  color: ChipColor;
  connected: boolean;
  you: boolean;
}

export default function SequenceGame(props: {
  roomId: string;
  state: SequenceState;
  /** Local seat id: 'blue' (host) or 'green' (client). */
  seat: string;
  players: PlayerStatus[];
  hand: Card[];
  /** Propose a game action (sent to the host, which validates and applies it). */
  onPropose: (type: string, payload?: unknown) => void;
  /** Leave the room (wired to the header's exit control). */
  onLeave?: () => void;
}) {
  const s = () => props.state;
  const [selected, setSelected] = createSignal<number | null>(null);
  let exitDialog: HTMLDialogElement | undefined;
  const [sequenceFlash, setSequenceFlash] = createSignal<ReadonlySet<number>>(new Set());
  const [lastMoveFlash, setLastMoveFlash] = createSignal<number | null>(null);
  let flashTimer: ReturnType<typeof setTimeout> | undefined;
  let lastMoveTimer: ReturnType<typeof setTimeout> | undefined;

  const myColor = createMemo<ChipColor>(
    () => s().players[props.seat]?.color ?? (props.seat === "blue" ? "blue" : "green"),
  );
  const myTurn = () =>
    s().phase === "playing" && !s().status && s().currentPlayerId === props.seat;
  const canExchangeDead = () => myTurn() && !s().deadCardExchanged;

  const name = (seat: string) => s().players[seat]?.name ?? seat;
  const currentPlayer = () => s().players[s().currentPlayerId];
  const turnColor = () =>
    currentPlayer()?.color ?? (s().currentPlayerId === "blue" ? "blue" : "green");
  const winnerName = () => {
    const w = s().status?.winner;
    return w ? name(w) : undefined;
  };

  // Clear the card selection at every turn boundary (turnNumber changes once
  // per turn) — including our own committed move, since the redrawn hand
  // makes stale selection indices meaningless.
  createEffect(
    on(
      () => s().turnNumber,
      () => setSelected(null),
      { defer: true },
    ),
  );

  // Flash the chips of newly claimed sequences for a moment. The previous
  // count is tracked locally and seeded at setup: on()'s prev input is
  // undefined on the first run after mount, which would silently swallow a
  // sequence claimed in the first state update after a (re)connect.
  let prevSequenceCount = s().sequences.length;
  createEffect(
    on(
      () => s().sequences.length,
      (count) => {
        const prev = prevSequenceCount;
        prevSequenceCount = count;
        if (count <= prev) return;
        const cells = new Set<number>();
        for (let i = prev; i < count; i++) {
          for (const c of s().sequences[i].cells) cells.add(c);
        }
        setSequenceFlash(cells);
        clearTimeout(flashTimer);
        flashTimer = setTimeout(() => setSequenceFlash(new Set<number>()), 2500);
      },
    ),
  );
  onCleanup(() => {
    clearTimeout(flashTimer);
    clearTimeout(lastMoveTimer);
  });

  // Briefly highlight the cell of the most recent chip placement/removal so
  // the opponent gets a visual hint of where the last move happened. Inferred
  // by diffing the board (same UI-side pattern as the sequence flash): each
  // chip action changes exactly one cell, so a single-cell diff IS the last
  // move. Anything else (rematch reset, restored state, multi-cell change)
  // is ignored rather than guessed at.
  // Chips are compared by VALUE, not reference: on clients each received
  // state is freshly deserialized, so unchanged cells get new chip objects
  // and a reference diff would see the whole board as changed.
  const chipChanged = (a: BoardCell["chip"], b: BoardCell["chip"]) =>
    !!a !== !!b || (a !== null && b !== null && a!.color !== b!.color);
  // Same local-prev seeding as the sequence flash: diff against the board
  // captured at setup so the first update after a (re)connect is comparable.
  let prevBoard = s().board;
  createEffect(
    on(
      () => s().board,
      (board) => {
        const prev = prevBoard;
        prevBoard = board;
        if (prev === board) return;
        let changed = -1;
        for (let i = 0; i < board.length; i++) {
          if (chipChanged(board[i].chip, prev[i].chip)) {
            if (changed >= 0) return; // more than one cell changed: not a move
            changed = i;
          }
        }
        if (changed < 0) return;
        setLastMoveFlash(changed);
        clearTimeout(lastMoveTimer);
        lastMoveTimer = setTimeout(() => setLastMoveFlash(null), 900);
      },
    ),
  );

  // The mandatory end-of-turn draw is folded into the host's MOVE commit, so
  // no client-side auto-draw is needed here.

  // Local, frontend-only selection: the chosen card stays switchable until
  // the player commits to a board space, and the highlights below are
  // computed from it (never from public state — the opponent sees nothing
  // until the chip is actually placed).
  const selectedCard = createMemo(() => {
    const idx = selected();
    return idx === null ? undefined : props.hand[idx];
  });

  // Legal target cells for the selected hand card.
  const highlightCells = createMemo(() => {
    const targets = new Set<number>();
    if (!myTurn()) return targets;
    const card = selectedCard();
    if (!card || isDeadCard(s().board, card, myColor())) return targets;
    if (isTwoEyedJack(card)) {
      s().board.forEach((cell, i) => {
        if (cell.card !== "FREE" && !cell.chip) targets.add(i);
      });
    } else if (isOneEyedJack(card)) {
      s().board.forEach((cell, i) => {
        if (
          cell.card !== "FREE" &&
          cell.chip &&
          !cell.chip.locked &&
          cell.chip.color !== myColor()
        ) {
          targets.add(i);
        }
      });
    } else {
      for (const i of cardCellIndices(card)) {
        if (!s().board[i].chip) targets.add(i);
      }
    }
    return targets;
  });

  const prompt = () => {
    const st = s();
    if (st.status) return "";
    if (st.currentPlayerId === props.seat) {
      return selectedCard()
        ? "Click a highlighted space (or pick another card)"
        : "Your turn — play a card";
    }
    return `Waiting for ${name(st.currentPlayerId)} to play…`;
  };

  function selectCard(index: number) {
    if (!myTurn()) return;
    const card = props.hand[index];
    if (!card) return;
    // Frontend-only selection: click again to deselect, click another card to
    // switch. Nothing is proposed until the player commits (board space click
    // for normal cards, the discard button for dead cards).
    setSelected(selected() === index ? null : index);
  }

  const selectedIsDead = () => {
    const card = selectedCard();
    return !!card && isDeadCard(s().board, card, myColor());
  };

  // Leaving mid-game is destructive for the other player (the host's exit
  // closes the room for both), so the header control asks first.
  const confirmLeave = () => {
    exitDialog?.close();
    props.onLeave?.();
  };

  /** Discard the selected dead card for a replacement (once per turn). */
  function exchangeSelectedDead() {
    const index = selected();
    if (index === null || !canExchangeDead()) return;
    const card = props.hand[index];
    if (!card || !isDeadCard(s().board, card, myColor())) return;
    props.onPropose("DECLARE_DEAD_CARD", { card, handIndex: index });
    setSelected(null);
  }

  function cellClick(index: number) {
    if (!myTurn() || !highlightCells().has(index)) return;
    const card = selectedCard();
    if (!card) return;
    // ONE proposal per turn: the host validates and commits card + chip
    // atomically (auto-draw folded in), so no half-made turn can ever exist
    // on the wire — a lost or rejected proposal leaves a clean state behind.
    props.onPropose("MOVE", { card, handIndex: selected(), cell: index });
    setSelected(null);
  }

  return (
    <div class="seq">
      {/* --- Header: players left, info + leave right (like the lobby) --- */}
      <header class="seq-header">
        <div class="seq-players">
          <For each={props.players}>
            {(player) => (
              <span class="seq-player" classList={{ offline: !player.connected }}>
                <TeamAvatar color={player.color} label={player.name.charAt(0)} />
                <span class="seq-player-name">{player.name}</span>
                <Show when={player.you}>
                  <span class="seq-player-tag">you</span>
                </Show>
                {/* Connected is the default, so only the exception is spelled
                    out — keeps the header on one line on narrow screens. */}
                <Show when={!player.connected}>
                  <span class="seq-player-tag offline" title="Disconnected">
                    offline
                  </span>
                </Show>
              </span>
            )}
          </For>
        </div>
        {/* Same quiet controls, same top-right spot as the lobby's. */}
        <RoomInfo roomId={props.roomId} />
        <Show when={props.onLeave}>
          <button
            type="button"
            class="btn btn-quiet btn-sm"
            title="Leave this game"
            onClick={() => exitDialog?.showModal()}
          >
            Leave
          </button>
        </Show>
      </header>

      {/* --- Board --- */}
      {/* The area is a size container: the square board below is sized from
          BOTH of its dimensions, so it always fits the space that is left
          after the header and the hand. */}
      <div class="seq-board-area">
        <div class="seq-board" role="grid" aria-label="Sequence board">
          <For each={s().board}>
            {(cell, i) => (
              <CellView
                cell={cell}
                index={i()}
                legal={highlightCells().has(i())}
                sequenceFlash={sequenceFlash().has(i())}
                lastMoveFlash={lastMoveFlash() === i()}
                interactive={myTurn() && highlightCells().has(i())}
                onCellClick={cellClick}
              />
            )}
          </For>
        </div>
      </div>

      {/* --- Hand + turn info (secondary area) --- */}
      <div class="seq-hand-area">
        <div class="seq-status">
          <Show
            when={s().status}
            fallback={
              <div class="seq-turn">
                <span class="seq-turn-label">Current turn:</span>
                <TeamAvatar color={turnColor()} label={name(s().currentPlayerId).charAt(0)} />
                <span class="seq-turn-name">{name(s().currentPlayerId)}</span>
                <span class="seq-turn-hint">{prompt()}</span>
              </div>
            }
          >
            <Show when={!s().status?.draw} fallback="Board full — draw!">
              {winnerName() === props.seat ? "You win!" : `${winnerName()} wins!`}
            </Show>
          </Show>
        </div>
        <div class="seq-hand">
          <For each={props.hand}>
            {(card, i) => (
              <HandCardView
                card={card}
                index={i()}
                selected={selected() === i()}
                dead={isDeadCard(s().board, card, myColor())}
                clickable={myTurn()}
                canExchange={canExchangeDead()}
                onSelect={selectCard}
              />
            )}
          </For>
        </div>
        <Show when={selectedIsDead()}>
          <button
            type="button"
            class="seq-button"
            disabled={!canExchangeDead()}
            title={
              canExchangeDead()
                ? "Discard the selected dead card and draw a replacement"
                : "You already exchanged a dead card this turn"
            }
            onClick={exchangeSelectedDead}
          >
            Discard dead card &amp; draw replacement
          </button>
        </Show>
      </div>

      {/* Exit confirmation. A native <dialog> keeps it out of the layout (and
          out of the board's height budget) until it is opened. */}
      <dialog ref={exitDialog} class="modal">
        <div class="modal-box">
          <h3 class="font-display text-xl uppercase">Leave the game?</h3>
          <p class="mt-2 text-sm opacity-70">
            {props.seat === "blue"
              ? "You're the host — leaving closes the room for both players."
              : "You can rejoin later with the invite link."}
          </p>
          <div class="modal-action">
            <form method="dialog">
              <button class="btn btn-ghost" type="submit">
                Cancel
              </button>
            </form>
            <button class="btn btn-error" type="button" onClick={confirmLeave}>
              Leave
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
