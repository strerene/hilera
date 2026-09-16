import type { JSX } from "solid-js";
import type { Card } from "~/lib/sequence";
import oneEyedJackArt from "~/components/ui/assets/jack-one-eyed.svg?raw";
import twoEyedJackArt from "~/components/ui/assets/jack-two-eyed.svg?raw";

/**
 * Special-card face library: components for cards whose center is not the
 * regular suit + rank overlay. Each face is a real .svg asset, imported ?raw
 * and inlined — not <img> — so currentColor keeps inheriting the suit color
 * (black, or card red) from the surrounding PlayingCard.
 */

/** A special-card face component: no props, renders its inline art. */
export type SpecialCardFace = () => JSX.Element;

/** Generic renderer for one face's raw SVG markup. */
export function FaceArt(props: { svg: string }): JSX.Element {
  return <div class="special-face" innerHTML={props.svg} />;
}

/** One-eyed jack (J♠ / J♥): removes an opponent chip. */
export function OneEyedJack(): JSX.Element {
  return <FaceArt svg={oneEyedJackArt} />;
}

/** Two-eyed jack (J♦ / J♣): wild — place a chip on any open space. */
export function TwoEyedJack(): JSX.Element {
  return <FaceArt svg={twoEyedJackArt} />;
}

// Mirrors the engine's isOneEyedJack/isTwoEyedJack (cards.ts), kept local so
// ui/ imports no engine code at runtime.
function isOneEyed(card: Card): boolean {
  return card.rank === "J" && (card.suit === "S" || card.suit === "H");
}

function isTwoEyed(card: Card): boolean {
  return card.rank === "J" && (card.suit === "D" || card.suit === "C");
}

/** Translate a card to its special face component, or undefined for a regular card. */
export function specialCardFace(card: Card): SpecialCardFace | undefined {
  if (isOneEyed(card)) return OneEyedJack;
  if (isTwoEyed(card)) return TwoEyedJack;
  return undefined;
}
