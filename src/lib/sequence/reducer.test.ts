// Tests for the pure rules machine. The reducer sees only public facts, so
// every scenario here is fully deterministic — no secrets, no randomness.
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

/** Board with blue chips on both 9H cells (index 35 and 71) → 9H is dead. */
const boardWithDeadNineH = () =>
  createInitialState().board.map((c, i) =>
    i === 35 || i === 71 ? { ...c, chip: chip("blue") } : c,
  );

describe("turn machine: play → place → draw", () => {
  test("PLAY_CARD spends a hand card and sets the pending card", () => {
    const s = playing({ currentPlayerId: "green" });
    const r = reducer(s, {
      type: "PLAY_CARD",
      playerId: "green",
      payload: { card: NINE_H },
    });
    expect(r).not.toBe(s);
    expect(r.turnStep).toBe("place");
    expect(r.pendingCard).toEqual(NINE_H);
    expect(r.handCounts.green).toBe(6);
    expect(r.board).toEqual(s.board);
  });

  test("PLACE_CHIP places the chip and moves to the draw step", () => {
    const s = playing({
      currentPlayerId: "green",
      turnStep: "place",
      pendingCard: NINE_H,
    });
    const cell = cardCellIndices(NINE_H)[0];
    const r = reducer(s, {
      type: "PLACE_CHIP",
      playerId: "green",
      payload: { cell },
    });
    expect(r.board[cell].chip).toEqual({ color: "green", locked: false });
    expect(r.turnStep).toBe("draw");
    expect(r.pendingCard).toBeNull();
  });

  test("DRAW_CARD refills the hand and advances the turn", () => {
    const s = playing({ currentPlayerId: "green", turnStep: "draw" });
    const r = reducer(s, {
      type: "DRAW_CARD",
      playerId: "green",
      payload: {},
    });
    expect(r.handCounts.green).toBe(8);
    expect(r.deckCount).toBe(89);
    expect(r.currentPlayerId).toBe("blue");
    expect(r.turnStep).toBe("play");
    expect(r.turnNumber).toBe(s.turnNumber + 1);
  });
});

describe("reducer preconditions reject invalid proposals", () => {
  test("not the acting player", () => {
    const s = playing({ currentPlayerId: "green" });
    expect(
      reducer(s, { type: "PLAY_CARD", playerId: "blue", payload: { card: NINE_H } }),
    ).toBe(s);
  });

  test("PLACE_CHIP at the wrong turn step", () => {
    const s = playing({ currentPlayerId: "green", turnStep: "play" });
    expect(
      reducer(s, { type: "PLACE_CHIP", playerId: "green", payload: { cell: 35 } }),
    ).toBe(s);
  });

  test("PLACE_CHIP on an occupied cell", () => {
    const cell = cardCellIndices(NINE_H)[0];
    const board = createInitialState().board.map((c, i) =>
      i === cell ? { ...c, chip: chip("blue") } : c,
    );
    const s = playing({
      currentPlayerId: "green",
      turnStep: "place",
      pendingCard: NINE_H,
      board,
    });
    expect(
      reducer(s, { type: "PLACE_CHIP", playerId: "green", payload: { cell } }),
    ).toBe(s);
  });

  test("PLACE_CHIP on a FREE corner", () => {
    const s = playing({
      currentPlayerId: "green",
      turnStep: "place",
      pendingCard: JACK_D,
    });
    expect(
      reducer(s, { type: "PLACE_CHIP", playerId: "green", payload: { cell: 0 } }),
    ).toBe(s);
  });

  test("PLACE_CHIP with a card that does not match the cell", () => {
    const s = playing({
      currentPlayerId: "green",
      turnStep: "place",
      pendingCard: NINE_H,
    });
    const otherCell = cardCellIndices({ rank: "3", suit: "H" })[0];
    expect(
      reducer(s, { type: "PLACE_CHIP", playerId: "green", payload: { cell: otherCell } }),
    ).toBe(s);
  });

  test("PLACE_CHIP with a one-eyed jack pending (must be REMOVE_CHIP)", () => {
    const s = playing({
      currentPlayerId: "green",
      turnStep: "place",
      pendingCard: JACK_S,
    });
    expect(
      reducer(s, { type: "PLACE_CHIP", playerId: "green", payload: { cell: 35 } }),
    ).toBe(s);
  });

  test("REMOVE_CHIP cannot remove own chips or locked chips", () => {
    const cell = 35;
    const own = playing({
      currentPlayerId: "green",
      turnStep: "remove",
      pendingCard: JACK_S,
      board: createInitialState().board.map((c, i) =>
        i === cell ? { ...c, chip: chip("green") } : c,
      ),
    });
    expect(
      reducer(own, { type: "REMOVE_CHIP", playerId: "green", payload: { cell } }),
    ).toBe(own);

    const locked = playing({
      currentPlayerId: "green",
      turnStep: "remove",
      pendingCard: JACK_S,
      board: createInitialState().board.map((c, i) =>
        i === cell ? { ...c, chip: chip("blue", true) } : c,
      ),
    });
    expect(
      reducer(locked, { type: "REMOVE_CHIP", playerId: "green", payload: { cell } }),
    ).toBe(locked);
  });

  test("REMOVE_CHIP removes an unlocked opponent chip", () => {
    const cell = 35;
    const s = playing({
      currentPlayerId: "green",
      turnStep: "remove",
      pendingCard: JACK_S,
      board: createInitialState().board.map((c, i) =>
        i === cell ? { ...c, chip: chip("blue") } : c,
      ),
    });
    const r = reducer(s, {
      type: "REMOVE_CHIP",
      playerId: "green",
      payload: { cell },
    });
    expect(r.board[cell].chip).toBeNull();
    expect(r.turnStep).toBe("draw");
  });
});

describe("dead card exchange", () => {
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
    expect(r.turnStep).toBe("play");
    expect(r.currentPlayerId).toBe("green");
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

describe("deck exhaustion", () => {
  test("deck and discards empty: the turn advances with a loss of card", () => {
    const s = playing({
      currentPlayerId: "green",
      turnStep: "draw",
      deckCount: 0,
      discards: { blue: [], green: [] },
    });
    const r = reducer(s, { type: "DRAW_CARD", playerId: "green", payload: {} });
    expect(r).not.toBe(s);
    expect(r.currentPlayerId).toBe("blue");
    expect(r.turnStep).toBe("play");
    expect(r.handCounts.green).toBe(7);
    expect(r.deckCount).toBe(0);
  });

  test("deck empty with discards: rebuild the deck from the discard piles", () => {
    const s = playing({
      currentPlayerId: "green",
      turnStep: "draw",
      deckCount: 0,
      discards: { blue: [{ rank: "2", suit: "C" }, { rank: "3", suit: "C" }], green: [] },
    });
    const r = reducer(s, { type: "DRAW_CARD", playerId: "green", payload: {} });
    expect(r.deckCount).toBe(1); // 2 discards - 1 drawn
    expect(r.handCounts.green).toBe(8);
    expect(r.discards.blue).toEqual([]);
    expect(r.currentPlayerId).toBe("blue");
  });
});

describe("sequences, locking and winning", () => {
  // Row 1 of the board: 5D 3H 2H 2S 3S 4S 5S 6S 7S AC → indices 10..19.
  const place = (state: SequenceState, cell: number): SequenceState =>
    reducer(
      { ...state, turnStep: "place", pendingCard: JACK_D },
      { type: "PLACE_CHIP", playerId: "green", payload: { cell } },
    );

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
      r = reducer(s, {
        type: "PLAY_CARD",
        playerId: "green",
        payload: { card: NINE_H },
      });
    }).not.toThrow();
    expect(r).toBeDefined();
    expect(r).not.toBe(s);
  });
});
