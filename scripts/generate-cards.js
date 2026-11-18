// Generates the card faces and board tiles used by the game UI.
// Run `bun run cards:generate` (also part of `dev`/`build`) and commit the
// resulting SVGs in src/components/ui/assets. PlayingCard.tsx imports them by
// filename, so keep the suit codes and rank spelling in sync with the engine.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const INK = '#000';
// Must match --color-paper in src/app.css.
const PAPER = '#fffdf5';
const GOLD = '#FFD23F';

const suits = {
  spade: {
    code: 's',
    color: '#7C5CFF', dark: '#4B30C9',
    parts: '<path d="M100 8 L26 92 C6 118 14 152 46 156 C68 158 84 148 90 134 L82 190 L118 190 L110 134 C116 148 132 158 154 156 C186 152 194 118 174 92 Z"/>',
    face: [100, 100, 28], bottom: 190, arm: [26, 112], rank: [100, 90],
  },
  heart: {
    code: 'h',
    color: '#FF4D6D', dark: '#C41E45',
    parts: '<path d="M100 182 L28 108 C8 84 12 44 46 32 C74 24 94 40 100 58 C106 40 126 24 154 32 C188 44 192 84 172 108 Z"/>',
    face: [100, 96, 27], bottom: 182, arm: [28, 86], rank: [100, 92],
  },
  diamond: {
    code: 'd',
    color: '#FFB400', dark: '#D07F00',
    parts: '<path d="M100 2 L184 100 L100 198 L16 100 Z"/>',
    face: [100, 98, 28], bottom: 198, arm: [30, 100], rank: [100, 100],
  },
  club: {
    code: 'c',
    color: '#2EE59D', dark: '#0FA573',
    parts: '<circle cx="100" cy="60.5" r="41.4"/><circle cx="56.8" cy="120.7" r="39.5"/><circle cx="143.2" cy="120.7" r="39.5"/><path d="M90.6 100 L73.7 184.6 L126.3 184.6 L109.4 100 Z"/><path d="M71.8 96.2 L128.2 96.2 L100 137.6 Z"/>',
    face: [100, 115, 28], bottom: 185, arm: [30, 121], rank: [100, 106],
  },
};

// blocky vector numerals on a 40x64 grid
const glyphs = {
  A: { d: 'M4 60 V22 L20 4 L36 22 V60 M4 40 H36', w: 40 },
  '1': { d: 'M4 18 L18 4 V60 M4 60 H32', w: 40 },
  K: { d: 'M6 4 V60 M36 4 L14 32 L36 60', w: 40 },
  Q: { d: 'M4 4 H36 V60 H4 Z M22 42 L40 62', w: 40 },
  '2': { d: 'M4 4 H36 V32 H4 V60 H38', w: 40 },
  '3': { d: 'M4 4 H36 V60 H4 M12 32 H36', w: 40 },
  '4': { d: 'M6 4 V36 H38 M30 4 V60', w: 40 },
  '5': { d: 'M36 4 H4 V32 H36 V60 H4', w: 40 },
  '6': { d: 'M36 4 H4 V60 H36 V32 H4', w: 40 },
  '7': { d: 'M4 4 H36 L18 60', w: 40 },
  '8': { d: 'M4 4 H36 V60 H4 Z M4 32 H36', w: 40 },
  '9': { d: 'M36 32 H4 V4 H36 V60 H4', w: 40 },
  '0': { d: 'M4 4 H36 V60 H4 Z', w: 40 },
};

// horizontal ink extent of a glyph path (absolute M/L/H/V/Z only)
function glyphExtent(d) {
  const xs = [];
  let x = 0;
  for (const m of d.matchAll(/([MLHV])\s*(-?[\d.]+)(?:\s+(-?[\d.]+))?/g)) {
    if (m[1] === 'V') continue;
    x = parseFloat(m[2]);
    xs.push(x);
  }
  return [Math.min(...xs), Math.max(...xs)];
}

function rankGlyphs(rank, cx, cy, s, mode) {
  const chars = String(rank).split('');
  const gap = 20;
  const ext = chars.map((c) => glyphExtent(glyphs[c].d));
  let off = 0;
  const places = ext.map(([a, b]) => {
    const tx = off - a;
    off += b - a + gap;
    return tx;
  });
  const total = off - gap;
  const x0 = cx - (total * s) / 2;
  // glyph ink spans y 4..60, so its centre is y 32
  const y0 = cy - 32 * s;
  const paths = chars.map((c, i) => `<path d="${glyphs[c].d}" transform="translate(${places[i]} 0)"/>`).join('');
  const common = 'fill="none" stroke-linecap="square" stroke-linejoin="miter" stroke-miterlimit="4"';
  const inner = mode === 'big'
    ? `<g ${common} stroke="${INK}" stroke-width="17">${paths}</g><g ${common} stroke="#fff" stroke-width="8">${paths}</g>`
    : mode === 'tile'
      ? `<g ${common} stroke="${INK}" stroke-width="16">${paths}</g><g ${common} stroke="#fff" stroke-width="8.5">${paths}</g>`
      : `<g ${common} stroke="${INK}" stroke-width="12">${paths}</g>`;
  return `<g transform="translate(${x0.toFixed(1)} ${y0.toFixed(1)}) scale(${s})">${inner}</g>`;
}

const miniSuit = (x, y, s, fill = '#fff', stroke = true) => `
    <g transform="translate(${x} ${y}) scale(${s})" stroke-linejoin="miter" stroke-miterlimit="3">
      ${stroke ? `<use href="#suit" fill="${INK}" stroke="${INK}" stroke-width="32"/>` : ''}
      <use href="#suit" fill="${fill}" stroke="none"/>
    </g>`;

const jIndex = (x, y) => `
    <g transform="translate(${x} ${y})" fill="none" stroke="${INK}" stroke-width="10">
      <path d="M26 0 V30 Q26 42 16 42 Q6 42 6 30"/>
      <path d="M12 0 H40" stroke-width="9"/>
    </g>`;

const eye = (cx, cy, r) => `
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" stroke="${INK}" stroke-width="5"/>
    <circle cx="${cx + 2}" cy="${cy + 1}" r="${Math.round(r * 0.52)}" fill="${INK}"/>
    <circle cx="${cx - 1}" cy="${cy - 2}" r="2.2" fill="#fff"/>`;

const sparkle = (x, y, r, fill = '#fff') => `
    <path d="M${x} ${y - r} L${x + r * 0.28} ${y - r * 0.28} L${x + r} ${y} L${x + r * 0.28} ${y + r * 0.28} L${x} ${y + r} L${x - r * 0.28} ${y + r * 0.28} L${x - r} ${y} L${x - r * 0.28} ${y - r * 0.28} Z" fill="${fill}" stroke="${INK}" stroke-width="3" stroke-linejoin="miter"/>`;

function suitCharacter(type, s) {
  const [fx, fy, dx] = s.face;
  const [ax, ay] = s.arm;
  const arm = (dir) => {
    const x = dir < 0 ? ax : 200 - ax;
    const d = type === 'two'
      ? `M${x} ${ay} Q${x + dir * 30} ${ay + 2} ${x + dir * 34} ${ay - 34}`
      : `M${x} ${ay} Q${x + dir * 34} ${ay + 8} ${x + dir * 22} ${ay + 42}`;
    const end = type === 'two' ? [x + dir * 34, ay - 34] : [x + dir * 22, ay + 42];
    return `<path d="${d}" fill="none" stroke="${INK}" stroke-width="10" stroke-linecap="round"/>
      <circle cx="${end[0]}" cy="${end[1]}" r="10" fill="#fff" stroke="${INK}" stroke-width="5"/>`;
  };
  const leg = (x) => `
      <line x1="${x}" y1="${s.bottom - 30}" x2="${x}" y2="${s.bottom + 16}" stroke="${INK}" stroke-width="10"/>
      <rect x="${x - 14}" y="${s.bottom + 12}" width="28" height="14" rx="7" fill="#fff" stroke="${INK}" stroke-width="5"/>`;
  const face = type === 'two'
    ? `${eye(fx - dx, fy, 16)}${eye(fx + dx, fy, 16)}
      <path d="M${fx - dx - 14} ${fy - 24} Q${fx - dx} ${fy - 35} ${fx - dx + 14} ${fy - 26} M${fx + dx - 14} ${fy - 26} Q${fx + dx} ${fy - 35} ${fx + dx + 14} ${fy - 24}" fill="none" stroke="${INK}" stroke-width="6"/>
      <path d="M${fx - 16} ${fy + 26} H${fx + 16} Q${fx + 14} ${fy + 46} ${fx} ${fy + 46} Q${fx - 14} ${fy + 46} ${fx - 16} ${fy + 26} Z" fill="#fff" stroke="${INK}" stroke-width="5"/>`
    : `<circle cx="${fx - dx}" cy="${fy}" r="21" fill="${INK}"/>
      ${miniSuit(fx - dx - 11.2, fy - 11.2, 0.112, '#fff', false)}
      ${eye(fx + dx, fy, 16)}
      <path d="M${fx + dx - 14} ${fy - 24} L${fx + dx + 14} ${fy - 34}" fill="none" stroke="${INK}" stroke-width="6"/>
      <g clip-path="url(#sc)"><line x1="${fx - 100}" y1="${fy - 20}" x2="${fx + 100}" y2="${fy - 30}" stroke="${INK}" stroke-width="9"/><line x1="${fx - 100}" y1="${fy - 20}" x2="${fx + 100}" y2="${fy - 30}" stroke="${GOLD}" stroke-width="3"/></g>
      <path d="M${fx - 16} ${fy + 38} H${fx + 12} L${fx + 18} ${fy + 30}" fill="none" stroke="${INK}" stroke-width="6"/>`;
  return `
    <g transform="translate(48 96)">
      ${arm(-1)}${arm(1)}
      ${leg(88)}${leg(112)}
      <use href="#suit" fill="${INK}" stroke="${INK}" stroke-width="22"/>
      <use href="#suit" fill="${s.dark}" stroke="none"/>
      <g clip-path="url(#sc)"><use href="#suit" fill="${s.color}" transform="translate(-10 -10)"/></g>
      ${face}
    </g>`;
}

function numberBody(rank, s) {
  const big = 1.85;
  const k = 1.14;
  const [rx, ry] = s.rank;
  const tx = 148 - 100 * k, ty = 208 - 100 * k;
  const cx = tx + rx * k, cy = ty + ry * k;
  return `
    <g transform="translate(${tx} ${ty}) scale(${k})">
      <use href="#suit" fill="${INK}" stroke="${INK}" stroke-width="22"/>
      <use href="#suit" fill="${s.dark}" stroke="none"/>
      <g clip-path="url(#sc)"><use href="#suit" fill="${s.color}" transform="translate(-11 -11)"/></g>
    </g>
    <g filter="url(#hs2)">${rankGlyphs(rank, cx, cy, big, 'big')}</g>`;
}

function frame(suitName, bodyFn, indexFn, label, fancy) {
  const s = suits[suitName];
  const rays = Array.from({ length: 12 }, (_, i) => {
    const a1 = (i * 30) * Math.PI / 180, a2 = (i * 30 + 15) * Math.PI / 180, r = 560;
    return `<polygon points="148,208 ${(148 + r * Math.cos(a1)).toFixed(1)},${(208 + r * Math.sin(a1)).toFixed(1)} ${(148 + r * Math.cos(a2)).toFixed(1)},${(208 + r * Math.sin(a2)).toFixed(1)}"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 304 424" width="304" height="424" role="img" aria-label="${label}">
  <defs>
    <g id="suit">${s.parts}</g>
    <clipPath id="sc">${s.parts}</clipPath>
    <clipPath id="panel"><rect x="24" y="24" width="248" height="368"/></clipPath>
    <pattern id="dots" width="10" height="10" patternUnits="userSpaceOnUse">
      <circle cx="5" cy="5" r="1.6" fill="${INK}" opacity="0.16"/>
    </pattern>
    <filter id="hs" x="-20%" y="-20%" width="150%" height="150%">
      <feOffset in="SourceAlpha" dx="7" dy="7" result="o"/>
      <feFlood flood-color="#000"/>
      <feComposite in2="o" operator="in" result="sh"/>
      <feMerge><feMergeNode in="sh"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="hs2" x="-20%" y="-20%" width="150%" height="150%">
      <feOffset in="SourceAlpha" dx="5" dy="5" result="o"/>
      <feFlood flood-color="#000"/>
      <feComposite in2="o" operator="in" result="sh"/>
      <feMerge><feMergeNode in="sh"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect x="20" y="20" width="280" height="400" fill="${INK}"/>
  <rect x="8" y="8" width="280" height="400" fill="${PAPER}" stroke="${INK}" stroke-width="8"/>
  <rect x="24" y="24" width="248" height="368" fill="${PAPER}"/>
  ${fancy ? `<g clip-path="url(#panel)">
    <g fill="${s.color}" opacity="0.22">${rays}</g>
    <rect x="24" y="24" width="248" height="368" fill="url(#dots)"/>
  </g>` : ''}
  ${indexFn(s)}
  <g transform="rotate(180 148 208)">${indexFn(s)}</g>
  ${fancy ? `${sparkle(236, 70, 13, s.color)}${sparkle(214, 46, 7, '#fff')}${sparkle(60, 352, 10, s.color)}${sparkle(84, 372, 6, '#fff')}` : ''}
  <g filter="url(#hs)">${bodyFn(s)}</g>
  <rect x="24" y="24" width="248" height="368" fill="none" stroke="${INK}" stroke-width="6"/>
</svg>
`;
}

const outCards = path.join(root, 'src/components/ui/assets/cards');
const outTiles = path.join(root, 'src/components/ui/assets/tiles');

// square board tile: big suit with the rank overlaid, built to stay legible at ~40px
function tile(rank, suitName) {
  const s = suits[suitName];
  // Leave breathing room inside the tile frame instead of filling it edge to
  // edge; the rank shrinks with the suit so the composition stays balanced.
  const scale = 1.35;
  const k = 0.78, o = 100 - 100 * 0.78;
  const cx = o + s.rank[0] * k, cy = o + s.rank[1] * k + 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200" role="img" aria-label="${rank} of ${suitName}s">
  <defs>
    <g id="suit">${s.parts}</g>
    <clipPath id="sc">${s.parts}</clipPath>
  </defs>
  <rect width="200" height="200" fill="${PAPER}"/>
  <g transform="translate(${o} ${o}) scale(${k})">
    <use href="#suit" fill="${INK}" stroke="${INK}" stroke-width="24"/>
    <use href="#suit" fill="${s.dark}" stroke="none"/>
    <g clip-path="url(#sc)"><use href="#suit" fill="${s.color}" transform="translate(-12 -12)"/></g>
  </g>
  ${rankGlyphs(rank, cx, cy, scale, 'tile')}
</svg>
`;
}


for (const dir of [outCards, outTiles]) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

for (const sn of Object.keys(suits)) {
  const s = suits[sn];
  for (const t of ['two', 'one']) {
    const label = `${t === 'two' ? 'Two' : 'One'}-eyed Jack of ${sn}s`;
    const svg = frame(sn, (st) => suitCharacter(t, st), (st) => `${jIndex(38, 38)}${miniSuit(36, 96, 0.2, st.color)}`, label, true);
    fs.writeFileSync(path.join(outCards, `jack-${t}-eyed-${s.code}.svg`), svg);
  }
  for (const rank of ['A', 2, 3, 4, 5, 6, 7, 8, 9, 10, 'Q', 'K']) {
    const str = String(rank);
    const sc = 0.4;
    const idx = (st) => `${rankGlyphs(rank, 56, 52, sc, 'small')}${miniSuit(36, 80, 0.2, st.color)}`;
    const svg = frame(sn, (st) => numberBody(rank, st), idx, `${rank} of ${sn}s`, false);
    const key = `${str.toLowerCase()}-${s.code}`;
    fs.writeFileSync(path.join(outCards, `${key}.svg`), svg);
    fs.writeFileSync(path.join(outTiles, `${key}.svg`), tile(rank, sn));
  }
}
console.log(
  `Generated ${fs.readdirSync(outCards).length} card faces and ${fs.readdirSync(outTiles).length} board tiles in src/components/ui/assets.`,
);
