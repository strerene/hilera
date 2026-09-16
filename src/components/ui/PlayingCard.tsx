import { Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import type { Card } from "~/lib/sequence";
import { specialCardFace } from "./SpecialCard";
import "./PlayingCard.css";

// Type-only import from the engine: the ui layer stays presentation-only at
// runtime, but shares the vocabulary so hands can render <PlayingCard card={c} />.
const SUIT_GLYPHS: Record<Card["suit"], string> = {
  S: "♠",
  H: "♥",
  D: "♦",
  C: "♣",
};

export default function PlayingCard(props: {
  card: Card;
  /** square-small: board cell (1:1, no corners). full: complete face (7:10). */
  variant: "square-small" | "full";
}) {
  const glyph = () => SUIT_GLYPHS[props.card.suit];
  const isRed = () => props.card.suit === "H" || props.card.suit === "D";
  const special = () => specialCardFace(props.card);

  return (
    <div
      class="game-card"
      classList={{
        "card-red": isRed(),
        "card-square-small": props.variant === "square-small",
        "card-full": props.variant === "full",
      }}
    >
      <div class="card-inner">
        <Show when={props.variant === "full"}>
          <div class="card-corner">
            <span>{props.card.rank}</span>
            <span>{glyph()}</span>
          </div>
        </Show>

        <div class="card-center" classList={{ "card-center-special": !!special() }}>
          <Show
            when={special()}
            fallback={
              <>
                {glyph()}
                <span class="card-rank">{props.card.rank}</span>
              </>
            }
          >
            {(face) => (
              <>
                <Dynamic component={face()} />
              </>
            )}
          </Show>
        </div>

        <Show when={props.variant === "full"}>
          <div class="card-corner rotate-180">
            <span>{props.card.rank}</span>
            <span>{glyph()}</span>
          </div>
        </Show>
      </div>
    </div>
  );
}
