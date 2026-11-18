// --- Host-side secrets (deck order + hands) ------------------------------------
// IMPURE BY DESIGN: this module holds the hidden game information. It runs
// ONLY on the host, is never part of the public state, and never appears in a
// broadcast payload. The reducer (pure) and the clients (via the `hand` field
// of the host's `state` message) only ever see public facts or a player's own
// hand.
import type { Card, SequenceState } from "./types";
import { HAND_SIZE } from "./types";
import { createDeck, isDeadCard, shuffle } from "./cards";
import { reducer } from "./reducer";

export interface SerializedSecrets {
  deck: Card[];
  hands: Record<string, Card[]>;
}

export class SequenceSecrets {
  private deck: Card[] = [];
  private hands: Record<string, Card[]> = {};

  /** Shuffle the double deck and deal the initial hands. Returns public facts. */
  deal(
    playerIds: string[],
    perPlayer = HAND_SIZE,
  ): { handCounts: Record<string, number>; deckCount: number } {
    this.deck = shuffle(createDeck());
    this.hands = {};
    for (const id of playerIds) {
      this.hands[id] = this.deck.splice(0, perPlayer);
    }
    return {
      handCounts: Object.fromEntries(
        playerIds.map((id) => [id, this.hands[id].length]),
      ),
      deckCount: this.deck.length,
    };
  }

  handOf(playerId: string): Card[] {
    return this.hands[playerId] ?? [];
  }

  /** True when the card is genuinely in the player's hand (host validation). */
  holdsCard(playerId: string, card: Card, handIndex?: number): boolean {
    const hand = this.hands[playerId];
    if (!hand) return false;
    return hand.some(
      (c, i) =>
        c.rank === card.rank &&
        c.suit === card.suit &&
        (handIndex === undefined || i === handIndex),
    );
  }

  /** Pop the top deck card into the player's hand. Null when the deck is empty. */
  drawInto(playerId: string): Card | null {
    if (this.deck.length === 0) return null;
    const card = this.deck.pop()!;
    this.hands[playerId] = [...(this.hands[playerId] ?? []), card];
    return card;
  }

  /** Remove the played card from the player's hand (already validated). */
  removeCard(playerId: string, card: Card, handIndex?: number): void {
    const hand = this.hands[playerId];
    if (!hand) return;
    const idx =
      handIndex !== undefined &&
      hand[handIndex] &&
      hand[handIndex].rank === card.rank &&
      hand[handIndex].suit === card.suit
        ? handIndex
        : hand.findIndex((c) => c.rank === card.rank && c.suit === card.suit);
    if (idx !== -1) {
      const copy = [...hand];
      copy.splice(idx, 1);
      this.hands[playerId] = copy;
    }
  }

  /**
   * Dead-card exchange: discard + replacement off the deck, or from the
   * reshuffled discard piles when the deck is empty. The discarded card is
   * part of that pool, so a replacement is always available.
   */
  exchangeDeadCard(
    playerId: string,
    deadCard: Card,
    handIndex: number | undefined,
    discards: Record<string, Card[]>,
  ): void {
    this.removeCard(playerId, deadCard, handIndex);
    if (this.deck.length === 0) {
      this.reshuffle({
        ...discards,
        [playerId]: [...(discards[playerId] ?? []), deadCard],
      });
    }
    this.drawInto(playerId);
  }

  /** Rebuild the deck from all public discard piles. Returns the new size. */
  reshuffle(discards: Record<string, Card[]>): number {
    const all: Card[] = [];
    for (const pile of Object.values(discards)) all.push(...pile);
    this.deck = shuffle(all);
    return this.deck.length;
  }

  /**
   * Host validation of a proposal. Returns the payload to commit, or null to
   * reject. Hidden results (drawn card, replacement) are applied to the
   * secrets, NOT to the payload.
   *
   * An accepted proposal is guaranteed to commit: the chip target and the
   * follow-up draw are PUBLIC facts, so the whole move is dry-run through the
   * pure reducer BEFORE any secret is mutated. Only the hidden side effects
   * (remove card, reshuffle, draw) are applied by hand afterwards, mirroring
   * what the dry run's public counts imply.
   */
  prepareProposal(
    state: SequenceState,
    playerId: string,
    type: string,
    payload: unknown,
  ): { payload: unknown } | null {
    switch (type) {
      case "MOVE":
        return this.prepareMove(state, playerId, payload);
      case "DECLARE_DEAD_CARD":
        return this.prepareDeadCard(state, playerId, payload);
      default:
        return null;
    }
  }

  private prepareMove(
    state: SequenceState,
    playerId: string,
    payload: unknown,
  ): { payload: unknown } | null {
    const { card, handIndex, cell } = (payload ?? {}) as {
      card?: Card;
      handIndex?: number;
      cell?: number;
    };
    // Hidden-info preconditions first (the reducer cannot check these):
    // acting player mirrors the reducer's isActingPlayer, and the card must
    // genuinely sit in the player's hand at the claimed index.
    const acting =
      state.phase === "playing" &&
      !state.status &&
      playerId === state.currentPlayerId;
    if (!acting) return null;
    if (!card) return null;
    if (!this.holdsCard(playerId, card, handIndex)) return null;
    const color = state.players[playerId]?.color;
    if (color && isDeadCard(state.board, card, color)) return null;

    // Dry-run the WHOLE move with the pure reducer. If it does not commit,
    // reject without touching any secret — a proposal can never strand a
    // half-applied move the way separate PLAY_CARD / PLACE_CHIP proposals
    // could (card spent, chip target invalid).
    const probe = reducer(state, {
      type: "MOVE",
      playerId,
      payload: { card, cell },
    });
    if (probe === state) return null;

    this.removeCard(playerId, card, handIndex);
    // The hand count is the only public trace of the draw: net 0 means the
    // spent card was refilled (-1 played +1 drawn), net -1 means no card was
    // drawn (win / full board).
    const drawn =
      (probe.handCounts[playerId] ?? -1) === state.handCounts[playerId];
    if (drawn) {
      if (state.deckCount <= 0) {
        // The dry run rebuilt the deck from the public discard piles; mirror
        // it so the drawn card comes from the same pool. The played card is
        // discarded before the draw, so it is part of that pool too.
        this.reshuffle({
          ...state.discards,
          [playerId]: [...(state.discards[playerId] ?? []), card],
        });
      }
      this.drawInto(playerId);
    }
    return { payload: { card, handIndex, cell } };
  }

  private prepareDeadCard(
    state: SequenceState,
    playerId: string,
    payload: unknown,
  ): { payload: unknown } | null {
    const { card, handIndex } = (payload ?? {}) as {
      card?: Card;
      handIndex?: number;
    };
    // Hidden-info preconditions first (the reducer cannot check these):
    // acting player mirrors the reducer's isActingPlayer, and the card must
    // genuinely sit in the player's hand at the claimed index.
    const acting =
      state.phase === "playing" &&
      !state.status &&
      playerId === state.currentPlayerId;
    if (!acting) return null;
    if (!card) return null;
    if (!this.holdsCard(playerId, card, handIndex)) return null;

    // Dry-run the exchange with the pure reducer, exactly like prepareMove: an
    // accepted proposal is guaranteed to commit, and any drift in the
    // reducer's public preconditions (dead card, one exchange per turn) is
    // caught here instead of being mirrored by hand. A replacement is always
    // available (the dead card itself is discarded before the draw), so the
    // payload always reports replacementDrawn: true.
    const probe = reducer(state, {
      type: "DECLARE_DEAD_CARD",
      playerId,
      payload: { card, replacementDrawn: true },
    });
    if (probe === state) return null;

    this.exchangeDeadCard(playerId, card, handIndex, state.discards);
    return { payload: { card, handIndex, replacementDrawn: true } };
  }

  /** Snapshot of the hidden information (for host-side persistence). */
  serialize(): SerializedSecrets {
    const hands: Record<string, Card[]> = {};
    for (const [id, hand] of Object.entries(this.hands)) hands[id] = [...hand];
    return { deck: [...this.deck], hands };
  }

  /** Restore hidden information from a persisted snapshot. */
  restore(data: SerializedSecrets): void {
    this.deck = [...data.deck];
    this.hands = {};
    for (const [id, hand] of Object.entries(data.hands)) {
      this.hands[id] = [...hand];
    }
  }
}
