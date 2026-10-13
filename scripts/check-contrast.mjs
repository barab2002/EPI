#!/usr/bin/env node
// WCAG 2.2 contrast check of the design tokens in apps/web/src/styles.css (UX-01, DESIGN.md §3).
//   node scripts/check-contrast.mjs [--markdown]
// Reads the light `:root` tokens and the dark `prefers-color-scheme` overrides, composites
// translucent tokens over their background, and fails when a pair is below its minimum.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** [label, foreground token, background token, minimum ratio]. Text 4.5:1, control edges 3:1. */
export const PAIRS = [
  ['Body text on surface', 'text', 'surface', 4.5],
  ['Body text on canvas', 'text', 'canvas', 4.5],
  ['Secondary text on surface', 'text-secondary', 'surface', 4.5],
  ['Secondary text on canvas', 'text-secondary', 'canvas', 4.5],
  ['Secondary text on sidebar', 'text-secondary', 'chrome', 4.5],
  ['Secondary text on sunken', 'text-secondary', 'surface-sunken', 4.5],
  ['Captions on surface', 'text-tertiary', 'surface', 4.5],
  ['Links on surface', 'accent', 'surface', 4.5],
  ['Navigation on sidebar', 'accent', 'chrome', 4.5],
  ['Selected navigation', 'accent', 'accent-soft', 4.5],
  ['Primary button label', 'on-accent', 'accent', 4.5],
  ['Positive on surface', 'positive', 'surface', 4.5],
  ['Success message', 'positive', 'positive-soft', 4.5],
  ['Caution on surface', 'caution', 'surface', 4.5],
  ['Critical on surface', 'critical', 'surface', 4.5],
  ['Error message / danger hover', 'critical', 'critical-soft', 4.5],
  ['Notice text', 'notice-text', 'notice-bg', 4.5],
  ['Input edge on surface', 'input-border', 'surface', 3],
  ['Input edge on canvas', 'input-border', 'canvas', 3],
];

/** Parses `--name: value;` declarations of one CSS block body. */
function tokens(block) {
  const out = {};
  for (const m of block.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

/** Light tokens from the first `:root`, dark ones from the `prefers-color-scheme: dark` block. */
export function themes(css) {
  const light = tokens(css.match(/:root\s*{([^}]*)}/)[1]);
  const darkBlock = css.match(/@media \(prefers-color-scheme: dark\)\s*{\s*:root\s*{([^}]*)}/);
  if (!darkBlock) throw new Error('dark theme block not found');
  return { light, dark: { ...light, ...tokens(darkBlock[1]) } };
}

/** `#rrggbb` or `rgb(r g b / a%)` → [r, g, b, alpha]. */
export function parseColor(v) {
  const hex = v.match(/^#([0-9a-f]{6})$/i);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)).concat(1);
  const rgb = v.match(/^rgb\((\d+)\s+(\d+)\s+(\d+)(?:\s*\/\s*([\d.]+)%)?\)$/);
  if (rgb) return [+rgb[1], +rgb[2], +rgb[3], rgb[4] === undefined ? 1 : +rgb[4] / 100];
  throw new Error(`unsupported color: ${v}`);
}

const over = ([r, g, b, a], [br, bg, bb]) => [
  r * a + br * (1 - a),
  g * a + bg * (1 - a),
  b * a + bb * (1 - a),
];
const channel = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

export function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Every pair in every theme, translucent colors composited over the surface or background. */
export function check(css) {
  const rows = [];
  for (const [theme, t] of Object.entries(themes(css))) {
    const surface = parseColor(t.surface);
    for (const [label, fg, bg, min] of PAIRS) {
      const back = over(parseColor(t[bg]), surface);
      const value = ratio(over(parseColor(t[fg]), back), back);
      rows.push({ label, theme, value, min, ok: value >= min });
    }
  }
  return rows;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const css = readFileSync(new URL('../apps/web/src/styles.css', import.meta.url), 'utf8');
  const rows = check(css);
  for (const r of rows) {
    const line = `| ${r.label} | ${r.theme} | ${r.value.toFixed(2)}:1 | ${r.min}:1 | ${r.ok ? 'pass' : 'FAIL'} |`;
    console.log(process.argv.includes('--markdown') ? line : line.replace(/^\| | \|$/g, ''));
  }
  const failed = rows.filter((r) => !r.ok);
  if (failed.length) {
    console.error(`contrast: ${failed.length} pair(s) below the minimum`);
    process.exit(1);
  }
  console.log(`contrast: all ${rows.length} pairs pass`);
}
