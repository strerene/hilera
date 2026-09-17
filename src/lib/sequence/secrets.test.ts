// Tests for the host-side hidden state. SequenceSecrets.restore() makes hands
// and deck deterministic, so the validation/dry-run logic is fully testable:
// every accepted proposal must commit in the pure reducer, every rejected one
// must leave the secrets untouched.
import { describe, expect, test } from "bun:test";
import { reducer } from "./reducer";
import { cardCellIndices } from "./cards";
import { SequenceSecrets } from "./secrets";
import { createInitialState, type Card, type SequenceState } from "./index";

const NINE_H: Card = { rank: "9", suit: "H" };
const ACE_S: Card = { rank: "A", suit: "S" };
const THREE_C: Card = { rank: "3", suit: "C" };
const JACK_D: Card = { rank: "J", suit: "D" }; // two-eyed: wild

const GREEN_HAND: Card[] = [
  NINE_H,
  ACE_S,
  { rank: "K", suit: "D" },
  { rank: "2", suit: "C" },
  { rank: "3", suit: "D" },
  JACK_D, // two-eyed: wild (used by the winning-move case)
  { rank: "5", suit: "C" },
];
const BLUE_HAND: Card[] = [
  { rank: "2", suit: "S" },
  { rank: "3", suit: "S" },
  { rank: "4", suit: "S" },
  { rank: "5", suit: "S" },
  { rank: "6", suit: "S" },
  { rank: "7", suit: "S" },
  { rank: "8", suit: "S" },
];

/** Board with blue chips on both 9H cells (index 35 and 71) → 9H is dead. */
const boardWithDeadNineH = () =>
  createInitialState().board.map((c, i) =>
    i === 35 || i === 71 ? { ...c, chip: { color: "blue" as const, locked: false } } : c,
  );

/** Row 0 (corner 0 + 1..4) already complete with green chips, and row 1 has
 *  green chips at 11..14 — placing at 15 claims the second sequence and wins. */
const boardAboutToWin = () =>
  createInitialState().board.map((c, i) =>
    (i >= 1 && i <= 4) || (i >= 11 && i <= 14)
      ? { ...c, chip: { color: "green" as const, locked: false } }
      : c,
  );

const playing = (over: Partial<SequenceState> = {}): SequenceState => ({
  ...createInitialState(),
  phase: "playing",
  handCounts: { blue: 7, green: 7 },
  deckCount: 90,
  discards: { blue: [], green: [] },
  ...over,
});

const freshSecrets = (over: { deck?: Card[]; green?: Card[] } = {}) => {
  const secrets = new SequenceSecrets();
  secrets.restore({
    deck: over.deck ?? [THREE_C],
    hands: { blue: BLUE_HAND, green: over.green ?? GREEN_HAND },
  });
  return secrets;
};

describe("deal", () => {
  test("deals 7 cards per player from a 104-card double deck", () => {
    const secrets = new SequenceSecrets();
    const deal = secrets.deal(["blue", "green"]);
    expect(deal.handCounts).toEqual({ blue: 7, green: 7 });
    expect(deal.deckCount).toBe(90);
    expect(secrets.handOf("blue")).toHaveLength(7);
    expect(secrets.handOf("green")).toHaveLength(7);
  });
});

describe("MOVE proposals", () => {
  test("accepted: spends the card, draws the replacement, commits in the reducer", () => {
    const secrets = freshSecrets(); // deck: [3C]
    const s = playing({ currentPlayerId: "green", deckCount: 1 });
    const prepared = secrets.prepareProposal(s, "green", "MOVE", {
      card: NINE_H,
      handIndex: 0,
      cell: cardCellIndices(NINE_H)[0],
    });
    expect(prepared).not.toBeNull();
    // The spent card is gone; the drawn card (3C) is appended.
    expect(secrets.handOf("green")).toEqual([...GREEN_HAND.slice(1), THREE_C]);

    const next = reducer(s, {
      type: "MOVE",
      playerId: "green",
      payload: prepared!.payload,
    });
    expect(next).not.toBe(s);
    expect(next.board[cardCellIndices(NINE_H)[0]].chip).toEqual({
      color: "green",
      locked: false,
    });
    expect(next.handCounts.green).toBe(7); // -1 spent +1 drawn
    expect(next.deckCount).toBe(0);
    expect(next.currentPlayerId).toBe("blue");
  });

  test("winning move: no card is drawn (the hand only shrinks by the spent card)", () => {
    const secrets = freshSecrets();
    const s = playing({
      currentPlayerId: "green",
      deckCount: 1,
      board: boardAboutToWin(),
    });
    const prepared = secrets.prepareProposal(s, "green", "MOVE", {
      card: JACK_D,
      handIndex: 5,
      cell: 15,
    });
    expect(prepared).not.toBeNull();
    const hand = secrets.handOf("green");
    expect(hand).toHaveLength(6); // spent, no refill
    expect(hand).not.toContainEqual(JACK_D);
    expect(hand).toContainEqual(NINE_H); // the rest of the hand is intact

    const next = reducer(s, {
      type: "MOVE",
      playerId: "green",
      payload: prepared!.payload,
    });
    expect(next.status).toEqual({ winner: "green" });
    expect(next.handCounts.green).toBe(6);
    expect(next.deckCount).toBe(1); // untouched
  });

  test("rejected: card not held, wrong hand index, wrong turn, or dead card", () => {
    const s = playing({ currentPlayerId: "green" });

    const notHeld = freshSecrets();
    expect(
      notHeld.prepareProposal(s, "green", "MOVE", {
        card: { rank: "Q", suit: "H" },
        handIndex: 0,
        cell: 0,
      }),
    ).toBeNull();

    const wrongIndex = freshSecrets(); // hand[1] is AS, not 9H
    expect(
      wrongIndex.prepareProposal(s, "green", "MOVE", {
        card: NINE_H,
        handIndex: 1,
        cell: cardCellIndices(NINE_H)[0],
      }),
    ).toBeNull();

    const notTheirTurn = freshSecrets();
    expect(
      notTheirTurn.prepareProposal(
        playing({ currentPlayerId: "blue" }),
        "green",
        "MOVE",
        { card: NINE_H, handIndex: 0, cell: cardCellIndices(NINE_H)[0] },
      ),
    ).toBeNull();

    const deadCard = freshSecrets();
    const deadState = playing({
      currentPlayerId: "green",
      board: boardWithDeadNineH(),
    });
    expect(
      deadCard.prepareProposal(deadState, "green", "MOVE", {
        card: NINE_H,
        handIndex: 0,
        cell: 35,
      }),
    ).toBeNull();

    // A rejection must never mutate the hidden state.
    expect(deadCard.handOf("green")).toContainEqual(NINE_H);
  });
});

describe("atomicity: the dry run rejects before any secret is touched", () => {
  test("an invalid chip target does NOT spend the card", () => {
    // The old two-proposal protocol could spend the card (PLAY_CARD) and then
    // fail the chip step, drifting secrets from the public state. With one
    // atomic MOVE, the reducer dry run must catch the bad target first.
    const cell = cardCellIndices(NINE_H)[0];
    const s = playing({
      currentPlayerId: "green",
      deckCount: 1,
      board: createInitialState().board.map((c, i) =>
        i === cell ? { ...c, chip: { color: "blue" as const, locked: false } } : c,
      ),
    });
    const secrets = freshSecrets();
    expect(
      secrets.prepareProposal(s, "green", "MOVE", {
        card: NINE_H,
        handIndex: 0,
        cell,
      }),
    ).toBeNull();
    expect(secrets.handOf("green")).toEqual(GREEN_HAND); // untouched
  });

  test("a FREE corner or mismatched cell is rejected the same way", () => {
    const s = playing({ currentPlayerId: "green", deckCount: 1 });
    const secrets = freshSecrets();
    expect(
      secrets.prepareProposal(s, "green", "MOVE", {
        card: JACK_D,
        handIndex: 1,
        cell: 0, // corner
      }),
    ).toBeNull();
    expect(
      secrets.prepareProposal(s, "green", "MOVE", {
        card: NINE_H,
        handIndex: 0,
        cell: cardCellIndices({ rank: "3", suit: "H" })[0],
      }),
    ).toBeNull();
    expect(secrets.handOf("green")).toEqual(GREEN_HAND);
  });
});

describe("deck exhaustion on the folded draw", () => {
  test("deck and discards empty: accepted with no secret draw (loss of card)", () => {
    const secrets = freshSecrets({ deck: [] });
    const s = playing({
      currentPlayerId: "green",
      deckCount: 0,
      discards: { blue: [], green: [] },
    });
    const prepared = secrets.prepareProposal(s, "green", "MOVE", {
      card: NINE_H,
      handIndex: 0,
      cell: cardCellIndices(NINE_H)[0],
    });
    expect(prepared).not.toBeNull();
    expect(secrets.handOf("green")).toEqual(GREEN_HAND.slice(1)); // spent only

    const next = reducer(s, {
      type: "MOVE",
      playerId: "green",
      payload: prepared!.payload,
    });
    expect(next).not.toBe(s);
    expect(next.currentPlayerId).toBe("blue");
    expect(next.handCounts.green).toBe(6);
  });

  test("deck exhausted with discards: reshuffles the discards, then draws", () => {
    const secrets = freshSecrets({ deck: [] });
    const s = playing({
      currentPlayerId: "green",
      deckCount: 0,
      discards: { blue: [{ rank: "7", suit: "D" }, { rank: "8", suit: "D" }], green: [] },
    });
    const prepared = secrets.prepareProposal(s, "green", "MOVE", {
      card: NINE_H,
      handIndex: 0,
      cell: cardCellIndices(NINE_H)[0],
    });
    expect(prepared).not.toBeNull();
    const hand = secrets.handOf("green");
    expect(hand).toHaveLength(7);
    expect(hand).toContainEqual(ACE_S); // original hand preserved
    // The drawn card is one of the reshuffled discards (neither collides with
    // the dealt hand, unlike the double deck's duplicate ranks).
    expect(
      hand.filter((c) => (c.rank === "7" || c.rank === "8") && c.suit === "D"),
    ).toHaveLength(1);

    const next = reducer(s, {
      type: "MOVE",
      playerId: "green",
      payload: prepared!.payload,
    });
    expect(next.deckCount).toBe(1);
    expect(next.handCounts.green).toBe(7);
    expect(next.discards.blue).toEqual([]);
  });
});

describe("DECLARE_DEAD_CARD proposals", () => {
  test("accepted: discards, draws the replacement, payload reports it", () => {
    const secrets = freshSecrets(); // deck: [3C]
    const s = playing({
      currentPlayerId: "green",
      deckCount: 1,
      board: boardWithDeadNineH(),
    });
    const prepared = secrets.prepareProposal(s, "green", "DECLARE_DEAD_CARD", {
      card: NINE_H,
      handIndex: 0,
    });
    expect(prepared).not.toBeNull();
    expect(prepared!.payload).toEqual({
      card: NINE_H,
      handIndex: 0,
      replacementDrawn: true,
    });
    // The replacement is appended at the end of the remaining hand.
    expect(secrets.handOf("green")).toEqual([...GREEN_HAND.slice(1), THREE_C]);

    const next = reducer(s, {
      type: "DECLARE_DEAD_CARD",
      playerId: "green",
      payload: prepared!.payload,
    });
    expect(next).not.toBe(s);
    expect(next.discards.green).toEqual([NINE_H]);
    expect(next.handCounts.green).toBe(7); // net zero with the replacement
    expect(next.deckCount).toBe(0);
    expect(next.deadCardExchanged).toBe(true);
  });

  test("rejected when the card is not actually dead or already exchanged", () => {
    const secrets = freshSecrets();
    const open = playing({ currentPlayerId: "green" }); // both 9H cells open
    expect(
      secrets.prepareProposal(open, "green", "DECLARE_DEAD_CARD", {
        card: NINE_H,
        handIndex: 0,
      }),
    ).toBeNull();
    expect(secrets.handOf("green")).toContainEqual(NINE_H);

    const exchanged = playing({
      currentPlayerId: "green",
      board: boardWithDeadNineH(),
      deadCardExchanged: true,
    });
    expect(
      secrets.prepareProposal(exchanged, "green", "DECLARE_DEAD_CARD", {
        card: NINE_H,
        handIndex: 0,
      }),
    ).toBeNull();
  });
});

describe("mirror invariant: accepted proposal ⇒ reducer commits", () => {
  test("for every secret-mutating scenario", () => {
    const cases: Array<{
      name: string;
      deck: Card[];
      state: SequenceState;
      playerId: string;
      type: "MOVE" | "DECLARE_DEAD_CARD";
      payload: unknown;
    }> = [
      {
        name: "MOVE (normal draw)",
        deck: [THREE_C],
        state: playing({ currentPlayerId: "green", deckCount: 1 }),
        playerId: "green",
        type: "MOVE",
        payload: { card: NINE_H, handIndex: 0, cell: cardCellIndices(NINE_H)[0] },
      },
      {
        name: "MOVE (reshuffled draw)",
        deck: [],
        state: playing({
          currentPlayerId: "green",
          deckCount: 0,
          discards: { blue: [{ rank: "7", suit: "D" }], green: [] },
        }),
        playerId: "green",
        type: "MOVE",
        payload: { card: NINE_H, handIndex: 0, cell: cardCellIndices(NINE_H)[0] },
      },
      {
        name: "MOVE (loss of card)",
        deck: [],
        state: playing({
          currentPlayerId: "green",
          deckCount: 0,
          discards: { blue: [], green: [] },
        }),
        playerId: "green",
        type: "MOVE",
        payload: { card: NINE_H, handIndex: 0, cell: cardCellIndices(NINE_H)[0] },
      },
      {
        name: "MOVE (winning, no draw)",
        deck: [THREE_C],
        state: playing({
          currentPlayerId: "green",
          deckCount: 1,
          board: boardAboutToWin(),
        }),
        playerId: "green",
        type: "MOVE",
        payload: { card: JACK_D, handIndex: 5, cell: 15 },
      },
      {
        name: "DECLARE_DEAD_CARD",
        deck: [THREE_C],
        state: playing({
          currentPlayerId: "green",
          deckCount: 1,
          board: boardWithDeadNineH(),
        }),
        playerId: "green",
        type: "DECLARE_DEAD_CARD",
        payload: { card: NINE_H, handIndex: 0 },
      },
    ];

    for (const c of cases) {
      // The secrets deck must agree with the state's public deckCount — the
      // mirror is only defined for consistent host states.
      const secrets = freshSecrets({ deck: c.deck });
      const prepared = secrets.prepareProposal(
        c.state,
        c.playerId,
        c.type,
        c.payload,
      );
      expect(prepared).not.toBeNull();
      const next = reducer(c.state, {
        type: c.type,
        playerId: c.playerId,
        payload: prepared!.payload,
      });
      expect(next).not.toBe(c.state);
    }
  });
});

describe("serialize / restore roundtrip", () => {
  test("preserves deck order and hands", () => {
    const secrets = freshSecrets({ deck: [THREE_C, ACE_S, NINE_H] });
    const snapshot = secrets.serialize();
    const restored = new SequenceSecrets();
    restored.restore(snapshot);
    expect(restored.handOf("green")).toEqual(GREEN_HAND);
    expect(restored.handOf("blue")).toEqual(BLUE_HAND);
    // A move continues from the restored deck in order.
    expect(
      restored.prepareProposal(
        playing({ currentPlayerId: "green", deckCount: 3 }),
        "green",
        "MOVE",
        { card: NINE_H, handIndex: 0, cell: cardCellIndices(NINE_H)[0] },
      ),
    ).not.toBeNull();
    expect(restored.handOf("green")).toHaveLength(7); // spent + drawn
  });
});
