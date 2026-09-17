// --- Sequence Reducer ----------------------------------------------------------
// PURE, deterministic: NO Date.now(), NO Math.random(), NO network calls.
// The reducer sees ONLY public facts. Hand contents, the deck order, and all
// shuffling live host-side (see secrets.ts); each peer's own hand arrives via a
// "hand" message and never enters the public state.
//
// A turn is ONE atomic action: MOVE commits the played card, the chip
// (placement or one-eyed-jack removal) and the mandatory follow-up draw in a
// single state transition. Intermediate turn states never exist in the public
// state, so a replica can never observe — or get stuck in — a half-made turn.
// The dead-card exchange is its own action because it does NOT end the turn.
import type { BoardCell, Card, ChipColor, GameAction, SequenceLine, SequenceState } from "./types";
import { SEQUENCES_TO_WIN } from "./types";
import {
  SEQUENCE_WINDOWS,
  cardsEqual,
  isDeadCard,
  isOneEyedJack,
  isTwoEyedJack,
} from "./cards";

export function reducer(
  state: SequenceState,
  action: GameAction,
): SequenceState {
  switch (action.type) {
    case "MOVE":
      return move(state, action);
    case "DECLARE_DEAD_CARD":
      return declareDeadCard(state, action);
    default:
      return state;
  }
}

// --- Turn actions ---------------------------------------------------------------

function isActingPlayer(state: SequenceState, action: GameAction): boolean {
  return (
    state.phase === "playing" &&
    !state.status &&
    action.playerId === state.currentPlayerId
  );
}

function playerColor(state: SequenceState, playerId: string): ChipColor {
  return state.players[playerId]?.color ?? "blue";
}

function bumpHandCount(
  state: SequenceState,
  playerId: string,
  delta: number,
): SequenceState["handCounts"] {
  return {
    ...state.handCounts,
    [playerId]: (state.handCounts[playerId] ?? 0) + delta,
  };
}

/**
 * The whole turn as one transition: spend the card, commit the chip, then
 * draw and pass. Any invalid part rejects the WHOLE move — the board and the
 * hand counts can never diverge across an intermediate state. The hand-index
 * ("is that card really in their hand?") is the host's job: it sees the hands.
 */
function move(state: SequenceState, action: GameAction): SequenceState {
  if (!isActingPlayer(state, action)) return state;
  const { card, cell } = (action.payload ?? {}) as { card?: Card; cell?: number };
  if (!card || !Number.isInteger(cell)) return state;
  const idx = cell as number;
  if (idx < 0 || idx >= state.board.length) return state;
  const target = state.board[idx];
  if (!target) return state;
  // A dead card has no legal use — it must be declared dead instead.
  if (isDeadCard(state.board, card, playerColor(state, action.playerId))) {
    return state;
  }

  // The spent card leaves the hand; the follow-up draw is added below — or
  // not, when the move ends the game or no card exists anywhere to draw.
  const spent = {
    ...state,
    handCounts: bumpHandCount(state, action.playerId, -1),
  };

  if (isOneEyedJack(card)) {
    // One-eyed jack: remove an opponent chip (locked chips are safe).
    if (target.card === "FREE" || !target.chip) return state;
    const color = playerColor(state, action.playerId);
    if (target.chip.color === color || target.chip.locked) return state;
    const board = [...spent.board];
    board[idx] = { ...target, chip: null };
    // Removing a chip can never complete a sequence, and never fills the board.
    return drawAndAdvance({ ...spent, board });
  }

  // Normal card or two-eyed jack: place a chip.
  if (target.card === "FREE" || target.chip !== null) return state;
  if (!isTwoEyedJack(card) && !cardsEqual(target.card, card)) return state;

  const color = playerColor(state, action.playerId);
  const board = [...spent.board];
  board[idx] = { ...target, chip: { color, locked: false } };

  // Claim any newly completed sequences (overlap rule: a new sequence may
  // share at most one chip with the already-claimed ones).
  const sequences = claimNewSequences(board, color, state.sequences);
  if (sequences.length > state.sequences.length) {
    lockSequenceChips(board, sequences, state.sequences.length);
  }

  const placed: SequenceState = {
    ...spent,
    board,
    sequences,
    status: resolveStatus(state, board, sequences, action.playerId),
  };
  // A finished game (win or full board) ends the turn without a draw.
  if (placed.status) return placed;
  return drawAndAdvance(placed);
}

function declareDeadCard(
  state: SequenceState,
  action: GameAction,
): SequenceState {
  if (!isActingPlayer(state, action)) return state;
  if (state.deadCardExchanged) return state; // one exchange per turn
  const { card, replacementDrawn } = (action.payload ?? {}) as {
    card?: Card;
    replacementDrawn?: boolean;
  };
  if (!card) return state;
  if (!isDeadCard(state.board, card, playerColor(state, action.playerId))) {
    return state; // not actually dead
  }
  const discards = { ...state.discards };
  discards[action.playerId] = [...discards[action.playerId], card];
  return {
    ...state,
    discards,
    // discard (-1) + replacement (+1 when drawn) -> net 0 or -1
    handCounts: bumpHandCount(state, action.playerId, replacementDrawn ? 0 : -1),
    deckCount: replacementDrawn ? state.deckCount - 1 : state.deckCount,
    deadCardExchanged: true,
  };
}

// --- Follow-up draw & turn transition ---------------------------------------------

/**
 * The mandatory end-of-turn draw, folded into the same transition as the move:
 * the drawn card itself stays hidden (only public counts change here, and the
 * drawing player's hand is updated via a "hand" message).
 */
function drawAndAdvance(state: SequenceState): SequenceState {
  const playerId = state.currentPlayerId;
  if (state.deckCount <= 0) {
    // Deck exhausted: rebuild it from the PUBLIC discard piles (deterministic
    // for every replica — only the shuffled ORDER is host-side, in secrets).
    const discardTotal = Object.values(state.discards).reduce(
      (n, p) => n + p.length,
      0,
    );
    if (discardTotal === 0) {
      // No card exists anywhere (deck and discards empty): the turn still
      // advances — a "loss of card" — because freezing on the draw step
      // would deadlock the game. No hand or deck counts change.
      return advanceTurn(state);
    }
    const discards: SequenceState["discards"] = {};
    for (const seat of state.turnOrder) discards[seat] = [];
    return advanceTurn({
      ...state,
      handCounts: bumpHandCount(state, playerId, 1),
      deckCount: discardTotal - 1,
      discards,
    });
  }
  return advanceTurn({
    ...state,
    handCounts: bumpHandCount(state, playerId, 1),
    deckCount: state.deckCount - 1,
  });
}

function advanceTurn(state: SequenceState): SequenceState {
  const idx = state.turnOrder.indexOf(state.currentPlayerId);
  const nextId = state.turnOrder[(idx + 1) % state.turnOrder.length];
  return {
    ...state,
    currentPlayerId: nextId,
    deadCardExchanged: false,
    turnNumber: state.turnNumber + 1,
  };
}

// --- Sequence claiming & win detection --------------------------------------------

/**
 * Find every 5-window that is fully occupied by `color` chips / corners and is
 * not already claimed. A new sequence may share at most ONE chip with the
 * union of already-claimed chips (the overlap rule; a 9-in-a-row line is
 * therefore two sequences). Returns the updated sequence list.
 */
function claimNewSequences(
  board: BoardCell[],
  color: ChipColor,
  existing: SequenceLine[],
): SequenceLine[] {
  const claimed = new Set<number>();
  for (const seq of existing) {
    if (seq.color === color) {
      for (const c of seq.cells) claimed.add(c);
    }
  }

  const result = [...existing];
  for (const window of SEQUENCE_WINDOWS) {
    let complete = true;
    let shared = 0;
    for (const idx of window) {
      const cell = board[idx];
      if (cell.card === "FREE") continue; // corner: counts for everyone
      if (!cell.chip || cell.chip.color !== color) {
        complete = false;
        break;
      }
      if (claimed.has(idx)) shared++;
    }
    if (!complete || shared > 1) continue;
    result.push({ color, cells: [...window] });
    for (const idx of window) {
      if (board[idx].card !== "FREE") claimed.add(idx);
    }
  }
  return result;
}

/** Mark the chips of all newly claimed sequences as locked (remove-proof). */
function lockSequenceChips(
  board: BoardCell[],
  sequences: SequenceLine[],
  firstNewIndex: number,
): void {
  for (let i = firstNewIndex; i < sequences.length; i++) {
    for (const idx of sequences[i].cells) {
      const cell = board[idx];
      if (cell.chip) {
        board[idx] = { ...cell, chip: { ...cell.chip, locked: true } };
      }
    }
  }
}

function resolveStatus(
  state: SequenceState,
  board: BoardCell[],
  sequences: SequenceLine[],
  playerId: string,
): SequenceState["status"] {
  const myCount = sequences.filter(
    (s) => s.color === playerColor(state, playerId),
  ).length;
  if (myCount >= SEQUENCES_TO_WIN) {
    return { winner: playerId };
  }
  if (board.every((cell) => cell.card === "FREE" || cell.chip !== null)) {
    return { draw: true };
  }
  return undefined;
}
