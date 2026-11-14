import "./Memphis.css";

/**
 * Decorative Memphis-style shapes. Purely presentational: the layer is
 * aria-hidden and pointer-events-none, and every shape is positioned by CSS
 * (see Memphis.css) so pages only need to render <MemphisBackdrop /> inside a
 * position: relative container.
 */
export function MemphisBackdrop() {
  return (
    <div class="memphis-backdrop" aria-hidden="true">
      <span class="memphis-shape memphis-shape--circle">
        <svg viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="46" fill="currentColor" />
        </svg>
      </span>

      <span class="memphis-shape memphis-shape--squiggle">
        <svg viewBox="0 0 100 100">
          <path
            d="M4 50 Q 16 18 28 50 T 52 50 T 76 50 T 96 50"
            fill="none"
            stroke="currentColor"
            stroke-width="10"
            stroke-linecap="round"
          />
        </svg>
      </span>

      <span class="memphis-shape memphis-shape--zigzag">
        <svg viewBox="0 0 100 100">
          <polyline
            points="4,72 22,28 40,72 58,28 76,72 96,36"
            fill="none"
            stroke="currentColor"
            stroke-width="10"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </span>

      <span class="memphis-shape memphis-shape--ring">
        <svg viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke="currentColor"
            stroke-width="10"
          />
        </svg>
      </span>

      <span class="memphis-shape memphis-shape--triangle">
        <svg viewBox="0 0 100 100">
          <polygon points="50,8 94,88 6,88" fill="currentColor" />
        </svg>
      </span>

      <span class="memphis-shape memphis-shape--plus">
        <svg viewBox="0 0 100 100">
          <path d="M40 4h20v36h36v20H60v36H40V60H4V40h36z" fill="currentColor" />
        </svg>
      </span>

      <span class="memphis-shape memphis-shape--dots">
        <svg viewBox="0 0 100 100">
          <g fill="currentColor">
            <circle cx="14" cy="14" r="7" />
            <circle cx="50" cy="14" r="7" />
            <circle cx="86" cy="14" r="7" />
            <circle cx="14" cy="50" r="7" />
            <circle cx="50" cy="50" r="7" />
            <circle cx="86" cy="50" r="7" />
            <circle cx="14" cy="86" r="7" />
            <circle cx="50" cy="86" r="7" />
            <circle cx="86" cy="86" r="7" />
          </g>
        </svg>
      </span>

      <span class="memphis-shape memphis-shape--star">
        <svg viewBox="0 0 100 100">
          <path
            d="M50 2 L60 40 L98 50 L60 60 L50 98 L40 60 L2 50 L40 40 Z"
            fill="currentColor"
          />
        </svg>
      </span>

      <span class="memphis-shape memphis-shape--half">
        <svg viewBox="0 0 100 100">
          <path d="M4 50 A46 46 0 0 1 96 50 Z" fill="currentColor" />
        </svg>
      </span>
    </div>
  );
}
