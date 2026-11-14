import { Match, Switch } from "solid-js";
import type { Card } from "~/lib/sequence";

/**
 * Chunky, geometric suit marks for the card faces. Inline SVG so they stay
 * crisp from a ~20px board cell up to a full hand card, and inherit the suit
 * color (ink or card red) through currentColor.
 */

const SPADE =
  "M50 5 C 58 20 86 36 86 58 C 86 72 76 81 65 81 C 58 81 53 77 50 71 C 47 77 42 81 35 81 C 24 81 14 72 14 58 C 14 36 42 20 50 5 Z M50 69 C 50 80 45 88 35 94 L 65 94 C 55 88 50 80 50 69 Z";

const HEART =
  "M50 90 C 18 68 6 50 6 33 C 6 17 18 7 33 7 C 41 7 47 11 50 18 C 53 11 59 7 67 7 C 82 7 94 17 94 33 C 94 50 82 68 50 90 Z";

const DIAMOND =
  "M50 5 Q 55 5 59 9 L 91 41 Q 95 50 91 59 L 59 91 Q 50 95 41 91 L 9 59 Q 5 50 9 41 L 41 9 Q 45 5 50 5 Z";

export default function SuitIcon(props: { suit: Card["suit"]; class?: string }) {
  return (
    <svg
      class={props.class}
      viewBox="0 0 100 100"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <Switch>
        <Match when={props.suit === "S"}>
          <path d={SPADE} />
        </Match>
        <Match when={props.suit === "H"}>
          <path d={HEART} />
        </Match>
        <Match when={props.suit === "D"}>
          <path d={DIAMOND} />
        </Match>
        <Match when={props.suit === "C"}>
          <g>
            <circle cx="50" cy="26" r="20" />
            <circle cx="31" cy="56" r="20" />
            <circle cx="69" cy="56" r="20" />
            <path d="M44 54 H56 L63 90 H37 Z" />
          </g>
        </Match>
      </Switch>
    </svg>
  );
}
