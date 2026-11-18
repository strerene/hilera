// Tests for the pure rules machine. The reducer sees only public facts, so
// every scenario here is fully deterministic — no secrets, no randomness.
// A turn is ONE atomic MOVE: card + chip + draw in a single transition.
import { describe, expect, test } from "bun:test";
import { reducer } from "./reducer";
import { cardCellIndices } from "./cards";
import { createInitialState, type Card, type SequenceState } from "./index";

const NINE_H: Card = { rank: "9", suit: "H" };
const JACK_S: Card = { rank: "J", suit: "S" }; // one-eyed: removes
const JACK_D: Card = { rank: "J", suit: "D" }; // two-eyed: wild

/** A mid-game playing state with deterministic public counts. */
const playing = (over: Partial<SequenceState> = {}): SequenceState => ({
  ...createInitialState(),
  phase: "playing",
  handCounts: { blue: 7, green: 7 },
  deckCount: 90,
  discards: { blue: [], green: [] },
  ...over,
});

const chip = (color: "blue" | "green", locked = false) => ({ color, locked });

const move = (
  state: SequenceState,
  card: Card,
  cell: number,
  playerId = "green",
): SequenceState =>
  reducer(state, { type: "MOVE", playerId, payload: { card, handIndex: 0, cell } });

/** Total cards in play: deck + hands + discard piles. Must stay constant. */
const totalCards = (s: SequenceState): number =>
  s.deckCount +
  Object.values(s.handCounts).reduce((n, c) => n + c, 0) +
  Object.values(s.discards).reduce((n, pile) => n + pile.length, 0);

/** Board with blue chips on both 9H cells (index 35 and 71) → 9H is dead. */
const boardWithDeadNineH = () =>
  createInitialState().board.map((c, i) =>
    i === 35 || i === 71 ? { ...c, chip: chip("blue") } : c,
  );

describe("atomic moves: card + chip + draw in one transition", () => {
  test("a normal placement commits everything at once", () => {
    const s = playing({ currentPlayerId: "green" });
    const cell = cardCellIndices(NINE_H)[0];
    const r = move(s, NINE_H, cell);
    expect(r).not.toBe(s);
    expect(r.board[cell].chip).toEqual({ color: "green", locked: false });
    // spent card (-1) refilled by the draw (+1): net zero
    expect(r.handCounts.green).toBe(7);
    expect(r.deckCount).toBe(89);
    // The played card is recycled into the discard pile, so no card is lost.
    expect(r.discards.green).toEqual([NINE_H]);
    expect(totalCards(r)).toBe(totalCards(s));
    expect(r.currentPlayerId).toBe("blue");
    expect(r.turnNumber).toBe(s.turnNumber + 1);
  });

  test("a two-eyed jack places a chip on any open space", () => {
    const s = playing({ currentPlayerId: "green" });
    const r = move(s, JACK_D, 12); // 3H — does not match a jack "card"
    expect(r.board[12].chip).toEqual({ color: "green", locked: false });
  });

  test("a one-eyed jack removes an unlocked opponent chip", () => {
    const cell = 35;
    const s = playing({
      currentPlayerId: "green",
      board: createInitialState().board.map((c, i) =>
        i === cell ? { ...c, chip: chip("blue") } : c,
      ),
    });
    const r = move(s, JACK_S, cell);
    expect(r.board[cell].chip).toBeNull();
    expect(r.currentPlayerId).toBe("blue");
  });

  test("a winning move ends the game without a draw or turn advance", () => {
    // Row 0 (corner 0 + 1..4) is already complete with green chips; row 1
    // gets its fifth chip now — two sequences win the game.
    const board = createInitialState().board.map((c, i) =>
      (i >= 1 && i <= 4) || (i >= 11 && i <= 14)
        ? { ...c, chip: chip("green") }
        : c,
    );
    const s = playing({ currentPlayerId: "green", board });
    const r = move(s, JACK_D, 15);
    expect(r.status).toEqual({ winner: "green" });
    expect(r.currentPlayerId).toBe("green"); // turn does NOT advance
    expect(r.handCounts.green).toBe(6); // card spent, no refill
    expect(r.deckCount).toBe(90); // no draw
  });
});

describe("rejections leave the state untouched (nothing commits halfway)", () => {
  test("not the acting player", () => {
    const s = playing({ currentPlayerId: "green" });
    expect(move(s, NINE_H, cardCellIndices(NINE_H)[0], "blue")).toBe(s);
  });

  test("missing card or cell", () => {
    const s = playing({ currentPlayerId: "green" });
    expect(
      reducer(s, { type: "MOVE", playerId: "green", payload: { handIndex: 0 } }),
    ).toBe(s);
    expect(
      reducer(s, {
        type: "MOVE",
        playerId: "green",
        payload: { card: NINE_H, handIndex: 0 },
      }),
    ).toBe(s);
  });

  test("a dead card cannot be played as a MOVE", () => {
    const s = playing({
      currentPlayerId: "green",
      board: boardWithDeadNineH(),
    });
    expect(move(s, NINE_H, 35)).toBe(s);
  });

  test("occupied cell, FREE corner, or mismatched card", () => {
    const cell = cardCellIndices(NINE_H)[0];
    const occupied = playing({
      currentPlayerId: "green",
      board: createInitialState().board.map((c, i) =>
        i === cell ? { ...c, chip: chip("blue") } : c,
      ),
    });
    expect(move(occupied, NINE_H, cell)).toBe(occupied);

    const fresh = playing({ currentPlayerId: "green" });
    expect(move(fresh, JACK_D, 0)).toBe(fresh); // corner
    expect(move(fresh, NINE_H, cardCellIndices({ rank: "3", suit: "H" })[0])).toBe(fresh);
  });

  test("a one-eyed jack cannot place, and cannot remove own or locked chips", () => {
    const fresh = playing({ currentPlayerId: "green" });
    expect(move(fresh, JACK_S, 35)).toBe(fresh); // no chip to remove

    const own = playing({
      currentPlayerId: "green",
      board: createInitialState().board.map((c, i) =>
        i === 35 ? { ...c, chip: chip("green") } : c,
      ),
    });
    expect(move(own, JACK_S, 35)).toBe(own);

    const locked = playing({
      currentPlayerId: "green",
      board: createInitialState().board.map((c, i) =>
        i === 35 ? { ...c, chip: chip("blue", true) } : c,
      ),
    });
    expect(move(locked, JACK_S, 35)).toBe(locked);
  });
});

describe("dead card exchange (does not end the turn)", () => {
  test("discards the card, draws a replacement, stays on the same turn", () => {
    const s = playing({
      currentPlayerId: "green",
      deckCount: 5,
      board: boardWithDeadNineH(),
    });
    const r = reducer(s, {
      type: "DECLARE_DEAD_CARD",
      playerId: "green",
      payload: { card: NINE_H, replacementDrawn: true },
    });
    expect(r.discards.green).toEqual([NINE_H]);
    // discard (-1) + replacement (+1) nets zero
    expect(r.handCounts.green).toBe(7);
    expect(r.deckCount).toBe(4);
    expect(r.deadCardExchanged).toBe(true);
    expect(r.currentPlayerId).toBe("green");
    expect(r.turnNumber).toBe(s.turnNumber);
  });

  test("without a replacement the hand shrinks by one", () => {
    const s = playing({
      currentPlayerId: "green",
      deckCount: 0,
      board: boardWithDeadNineH(),
    });
    const r = reducer(s, {
      type: "DECLARE_DEAD_CARD",
      playerId: "green",
      payload: { card: NINE_H, replacementDrawn: false },
    });
    expect(r.handCounts.green).toBe(6);
    expect(r.deckCount).toBe(0);
  });

  test("the flag clears on the next turn", () => {
    const s = playing({
      currentPlayerId: "green",
      deadCardExchanged: true,
    });
    const r = move(s, NINE_H, cardCellIndices(NINE_H)[0]);
    expect(r.deadCardExchanged).toBe(false);
    expect(r.currentPlayerId).toBe("blue");
  });

  test("only one exchange per turn", () => {
    const s = playing({
      currentPlayerId: "green",
      board: boardWithDeadNineH(),
      deadCardExchanged: true,
    });
    expect(
      reducer(s, {
        type: "DECLARE_DEAD_CARD",
        playerId: "green",
        payload: { card: NINE_H, replacementDrawn: true },
      }),
    ).toBe(s);
  });

  test("a card that is not actually dead cannot be declared dead", () => {
    const s = playing({ currentPlayerId: "green" }); // both 9H cells open
    expect(
      reducer(s, {
        type: "DECLARE_DEAD_CARD",
        playerId: "green",
        payload: { card: NINE_H, replacementDrawn: true },
      }),
    ).toBe(s);
  });
});

describe("deck exhaustion on the folded draw", () => {
  test("deck and discards empty: the played card is recycled and drawn back", () => {
    const s = playing({
      currentPlayerId: "green",
      deckCount: 0,
      discards: { blue: [], green: [] },
    });
    const r = move(s, NINE_H, cardCellIndices(NINE_H)[0]);
    expect(r).not.toBe(s);
    expect(r.currentPlayerId).toBe("blue");
    // The played card joins the discard pile, which is reshuffled and drawn
    // back: the hand is refilled and the pile is cleared.
    expect(r.handCounts.green).toBe(7);
    expect(r.deckCount).toBe(0);
    expect(r.discards.green).toEqual([]);
    expect(totalCards(r)).toBe(totalCards(s));
  });

  test("deck empty with discards: rebuild the deck from the discard piles", () => {
    const s = playing({
      currentPlayerId: "green",
      deckCount: 0,
      discards: { blue: [{ rank: "2", suit: "C" }, { rank: "3", suit: "C" }], green: [] },
    });
    const r = move(s, NINE_H, cardCellIndices(NINE_H)[0]);
    // 2 discards + the played card, minus the one drawn.
    expect(r.deckCount).toBe(2);
    expect(r.handCounts.green).toBe(7); // spent + drawn
    expect(r.discards.blue).toEqual([]);
    expect(r.discards.green).toEqual([]);
    expect(r.currentPlayerId).toBe("blue");
    expect(totalCards(r)).toBe(totalCards(s));
  });
});

describe("sequences, locking and winning", () => {
  // Row 1 of the board: 5D 3H 2H 2S 3S 4S 5S 6S 7S AC → indices 10..19.
  // Each placement is a full turn; the helper keeps green as the mover so a
  // single player can claim the whole row deterministically.
  const place = (state: SequenceState, cell: number): SequenceState =>
    move({ ...state, currentPlayerId: "green" }, JACK_D, cell);

  test("five in a row claims a sequence and locks its chips", () => {
    let s = playing({ currentPlayerId: "green" });
    for (const cell of [11, 12, 13, 14, 15]) s = place(s, cell);
    expect(s.sequences).toHaveLength(1);
    expect(s.sequences[0].color).toBe("green");
    expect(s.status).toBeUndefined();
    for (const cell of [11, 12, 13, 14, 15]) {
      expect(s.board[cell].chip?.locked).toBe(true);
    }
  });

  test("a 9-in-a-row is two sequences (overlap rule) and wins the game", () => {
    let s = playing({ currentPlayerId: "green" });
    for (const cell of [11, 12, 13, 14, 15]) s = place(s, cell);
    expect(s.sequences).toHaveLength(1);
    for (const cell of [16, 17, 18, 19]) s = place(s, cell);
    // Window 15-19 shares only cell 15 with the claimed 11-15 → claimable.
    expect(s.sequences).toHaveLength(2);
    expect(s.status).toEqual({ winner: "green" });
  });
});

describe("purity", () => {
  const deepFreeze = <T,>(x: T): T => {
    if (x && typeof x === "object" && !Object.isFrozen(x)) {
      Object.freeze(x);
      for (const v of Object.values(x as object)) deepFreeze(v);
    }
    return x;
  };

  test("the reducer never mutates its input state", () => {
    const s = deepFreeze(playing({ currentPlayerId: "green" }));
    let r: SequenceState | undefined;
    expect(() => {
      r = move(s, NINE_H, cardCellIndices(NINE_H)[0]);
    }).not.toThrow();
    expect(r).toBeDefined();
    expect(r).not.toBe(s);
  });
});
