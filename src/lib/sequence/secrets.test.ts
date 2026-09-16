// Tests for the host-side hidden state. SequenceSecrets.restore() makes hands
// and deck deterministic, so the validation/mirror logic is fully testable:
// every accepted proposal must commit in the pure reducer, every rejected one
// must leave the secrets untouched.
import { describe, expect, test } from "bun:test";
import { reducer } from "./reducer";
import { SequenceSecrets } from "./secrets";
import { createInitialState, type Card, type SequenceState } from "./index";

const NINE_H: Card = { rank: "9", suit: "H" };
const ACE_S: Card = { rank: "A", suit: "S" };
const THREE_C: Card = { rank: "3", suit: "C" };

const GREEN_HAND: Card[] = [
  NINE_H,
  ACE_S,
  { rank: "K", suit: "D" },
  { rank: "2", suit: "C" },
  { rank: "3", suit: "D" },
  { rank: "4", suit: "H" },
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

describe("PLAY_CARD proposals", () => {
  test("accepted: removes the card from the hand and commits in the reducer", () => {
    const secrets = freshSecrets();
    const s = playing({ currentPlayerId: "green" });
    const prepared = secrets.prepareProposal(s, "green", "PLAY_CARD", {
      card: NINE_H,
      handIndex: 0,
    });
    expect(prepared).not.toBeNull();
    expect(secrets.handOf("green")).not.toContainEqual(NINE_H);
    expect(secrets.handOf("green")).toHaveLength(6);

    const next = reducer(s, {
      type: "PLAY_CARD",
      playerId: "green",
      payload: prepared!.payload,
    });
    expect(next).not.toBe(s);
    expect(next.turnStep).toBe("place");
    expect(next.handCounts.green).toBe(6);
  });

  test("rejected: card not held, wrong hand index, wrong turn, or dead card", () => {
    const s = playing({ currentPlayerId: "green" });

    const notHeld = freshSecrets();
    expect(
      notHeld.prepareProposal(s, "green", "PLAY_CARD", {
        card: { rank: "Q", suit: "H" },
        handIndex: 0,
      }),
    ).toBeNull();

    const wrongIndex = freshSecrets(); // hand[1] is AS, not 9H
    expect(
      wrongIndex.prepareProposal(s, "green", "PLAY_CARD", {
        card: NINE_H,
        handIndex: 1,
      }),
    ).toBeNull();

    const notTheirTurn = freshSecrets();
    expect(
      notTheirTurn.prepareProposal(
        playing({ currentPlayerId: "blue" }),
        "green",
        "PLAY_CARD",
        { card: NINE_H, handIndex: 0 },
      ),
    ).toBeNull();

    const wrongStep = freshSecrets();
    expect(
      wrongStep.prepareProposal(
        playing({ currentPlayerId: "green", turnStep: "place" }),
        "green",
        "PLAY_CARD",
        { card: NINE_H, handIndex: 0 },
      ),
    ).toBeNull();

    const deadCard = freshSecrets();
    const deadState = playing({
      currentPlayerId: "green",
      board: boardWithDeadNineH(),
    });
    expect(
      deadCard.prepareProposal(deadState, "green", "PLAY_CARD", {
        card: NINE_H,
        handIndex: 0,
      }),
    ).toBeNull();

    // A rejection must never mutate the hidden state.
    expect(deadCard.handOf("green")).toContainEqual(NINE_H);
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

  test("rejected when the card is not actually dead", () => {
    const secrets = freshSecrets();
    const s = playing({ currentPlayerId: "green" }); // both 9H cells open
    expect(
      secrets.prepareProposal(s, "green", "DECLARE_DEAD_CARD", {
        card: NINE_H,
        handIndex: 0,
      }),
    ).toBeNull();
    expect(secrets.handOf("green")).toContainEqual(NINE_H);
  });
});

describe("DRAW_CARD proposals", () => {
  test("accepted: pops the deck into the player's hand", () => {
    const secrets = freshSecrets({ deck: [THREE_C, ACE_S] });
    const s = playing({ currentPlayerId: "green", turnStep: "draw", deckCount: 2 });
    const prepared = secrets.prepareProposal(s, "green", "DRAW_CARD", {});
    expect(prepared).not.toBeNull();
    expect(secrets.handOf("green")).toHaveLength(8);

    const next = reducer(s, {
      type: "DRAW_CARD",
      playerId: "green",
      payload: prepared!.payload,
    });
    expect(next.handCounts.green).toBe(8);
    expect(next.deckCount).toBe(1);
    expect(next.currentPlayerId).toBe("blue");
  });

  test("deck and discards empty: accepted with no secret changes (loss of card)", () => {
    const secrets = freshSecrets({ deck: [] });
    const s = playing({
      currentPlayerId: "green",
      turnStep: "draw",
      deckCount: 0,
      discards: { blue: [], green: [] },
    });
    const prepared = secrets.prepareProposal(s, "green", "DRAW_CARD", {});
    expect(prepared).not.toBeNull();
    expect(secrets.handOf("green")).toEqual(GREEN_HAND); // nothing drawn

    const next = reducer(s, {
      type: "DRAW_CARD",
      playerId: "green",
      payload: prepared!.payload,
    });
    expect(next).not.toBe(s);
    expect(next.currentPlayerId).toBe("blue");
    expect(next.handCounts.green).toBe(7);
  });

  test("deck exhausted with discards: reshuffles the discards, then draws", () => {
    const secrets = freshSecrets({ deck: [] });
    const s = playing({
      currentPlayerId: "green",
      turnStep: "draw",
      deckCount: 0,
      discards: { blue: [{ rank: "7", suit: "D" }, { rank: "8", suit: "D" }], green: [] },
    });
    const prepared = secrets.prepareProposal(s, "green", "DRAW_CARD", {});
    expect(prepared).not.toBeNull();
    const hand = secrets.handOf("green");
    expect(hand).toHaveLength(8);
    expect(hand).toContainEqual(ACE_S); // original hand preserved
    // The drawn card is one of the reshuffled discards (neither collides with
    // the dealt hand, unlike the double deck's duplicate ranks).
    expect(
      hand.filter((c) => (c.rank === "7" || c.rank === "8") && c.suit === "D"),
    ).toHaveLength(1);

    const next = reducer(s, {
      type: "DRAW_CARD",
      playerId: "green",
      payload: prepared!.payload,
    });
    expect(next.deckCount).toBe(1);
    expect(next.handCounts.green).toBe(8);
    expect(next.discards.blue).toEqual([]);
  });

  test("rejected at the wrong turn step", () => {
    const secrets = freshSecrets();
    const s = playing({ currentPlayerId: "green", turnStep: "play" });
    expect(secrets.prepareProposal(s, "green", "DRAW_CARD", {})).toBeNull();
  });
});

describe("mirror invariant: accepted proposal ⇒ reducer commits", () => {
  test("for every secret-mutating action type", () => {
    const cases: Array<{
      name: string;
      deck: Card[];
      state: SequenceState;
      playerId: string;
      type: string;
      payload: unknown;
    }> = [
      {
        name: "PLAY_CARD",
        deck: [THREE_C],
        state: playing({ currentPlayerId: "green" }),
        playerId: "green",
        type: "PLAY_CARD",
        payload: { card: NINE_H, handIndex: 0 },
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
      {
        name: "DRAW_CARD",
        deck: [THREE_C],
        state: playing({ currentPlayerId: "green", turnStep: "draw", deckCount: 1 }),
        playerId: "green",
        type: "DRAW_CARD",
        payload: {},
      },
      {
        name: "DRAW_CARD (loss of card)",
        deck: [],
        state: playing({
          currentPlayerId: "green",
          turnStep: "draw",
          deckCount: 0,
          discards: { blue: [], green: [] },
        }),
        playerId: "green",
        type: "DRAW_CARD",
        payload: {},
      },
    ];

    for (const c of cases) {
      // The secrets deck must agree with the state's public deckCount — the
      // mirror is only defined for consistent host states.
      const secrets = freshSecrets({ deck: c.deck });
      const prepared = secrets.prepareProposal(c.state, c.playerId, c.type, c.payload);
      expect(prepared).not.toBeNull();
      const next = reducer(c.state, {
        type: c.type as never,
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
    // A draw continues from the restored deck in order.
    expect(restored.prepareProposal(
      playing({ currentPlayerId: "green", turnStep: "draw", deckCount: 3 }),
      "green",
      "DRAW_CARD",
      {},
    )).not.toBeNull();
    expect(restored.handOf("green")).toHaveLength(8);
  });
});
