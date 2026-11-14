import { Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import type { Card } from "~/lib/sequence";
import { specialCardFace } from "./SpecialCard";
import SuitIcon from "./SuitIcon";
import "./PlayingCard.css";

// Type-only import from the engine: the ui layer stays presentation-only at
// runtime, but shares the vocabulary so hands can render <PlayingCard card={c} />.

export default function PlayingCard(props: {
  card: Card;
  /** square-small: board cell (1:1, no corners). full: complete face (7:10). */
  variant: "square-small" | "full";
}) {
  const isRed = () => props.card.suit === "H" || props.card.suit === "D";
  const special = () => specialCardFace(props.card);

  return (
    <div
      class="game-card"
      aria-hidden="true"
      classList={{
        "card-red": isRed(),
        "suit-heart": props.card.suit === "H",
        "card-square-small": props.variant === "square-small",
        "card-full": props.variant === "full",
      }}
    >
      <div class="card-inner">
        <Show when={props.variant === "full"}>
          <div class="card-corner">
            <span class="card-corner-rank">{props.card.rank}</span>
            <SuitIcon suit={props.card.suit} class="card-corner-suit" />
          </div>
        </Show>

        <div
          class="card-center"
          classList={{ "card-center-special": !!special() }}
        >
          <Show
            when={special()}
            fallback={
              <>
                <SuitIcon suit={props.card.suit} class="card-center-suit" />
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
            <span class="card-corner-rank">{props.card.rank}</span>
            <SuitIcon suit={props.card.suit} class="card-corner-suit" />
          </div>
        </Show>
      </div>
    </div>
  );
}
