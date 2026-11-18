import { Show } from "solid-js";
import type { ChipColor } from "~/lib/sequence";

// Team colors are the chip colors, not daisyUI theme colors, so they are
// pinned to the same values as the board chips in HileraGame.css.
const TEAM_BG: Record<ChipColor, string> = {
  blue: "bg-[#2f6bff]",
  green: "bg-[#22a34a]",
};

export default function TeamAvatar(props: {
  color: ChipColor;
  /** Single letter/initial shown inside the avatar (optional). */
  label?: string;
}) {
  return (
    <span
      class={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-[3px] border-ink text-xs font-bold uppercase text-white shadow-[2px_2px_0_#141414] ${TEAM_BG[props.color] ?? "bg-neutral"}`}
      aria-hidden="true"
    >
      <Show when={props.label}>{(label) => label()}</Show>
    </span>
  );
}
