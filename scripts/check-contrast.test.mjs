import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { check, parseColor, ratio, themes } from './check-contrast.mjs';

test('ratio matches WCAG reference values', () => {
  assert.equal(ratio([0, 0, 0], [255, 255, 255]).toFixed(1), '21.0');
  assert.equal(ratio([118, 118, 118], [255, 255, 255]).toFixed(2), '4.54');
});

test('parses hex and translucent rgb tokens', () => {
  assert.deepEqual(parseColor('#0a63d6'), [10, 99, 214, 1]);
  assert.deepEqual(parseColor('rgb(20 24 31 / 50%)'), [20, 24, 31, 0.5]);
  assert.throws(() => parseColor('hsl(0 0% 0%)'), /unsupported/);
});

test('a too-faint token fails the check', () => {
  const css = `:root { --text: #15171a; --surface: #ffffff; --canvas: #f4f5f7; --chrome: #f9fafb;
    --surface-sunken: #eef0f3; --text-secondary: #5a616c; --text-tertiary: #aaaaaa; --accent: #0a63d6;
    --accent-soft: rgb(10 99 214 / 9%); --on-accent: #ffffff; --positive: #126a3f;
    --positive-soft: rgb(23 120 74 / 10%); --caution: #8a5a00; --critical: #bf2a1f;
    --critical-soft: rgb(191 42 31 / 9%); --notice-bg: #fff5d9; --notice-text: #5c4300;
    --input-border: rgb(20 24 31 / 18%); }
    @media (prefers-color-scheme: dark) { :root { --surface: #ffffff; } }`;
  const failed = check(css)
    .filter((r) => !r.ok && r.theme === 'light')
    .map((r) => r.label);
  assert.deepEqual(failed, [
    'Captions on surface',
    'Input edge on surface',
    'Input edge on canvas',
  ]);
});

test('the shipped tokens pass in light and dark themes', () => {
  const css = readFileSync(new URL('../apps/web/src/styles.css', import.meta.url), 'utf8');
  assert.ok(themes(css).dark.surface !== themes(css).light.surface);
  const failed = check(css).filter((r) => !r.ok);
  assert.deepEqual(failed, []);
});
