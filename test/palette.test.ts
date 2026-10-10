import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// Every difficulty level redefines the palette, so contrast is checked at each one
// rather than trusting that a redder purple reads as well as the original.
const css = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `missing ${selector}`);
  const body = css.slice(start, css.indexOf('}', start));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((match) => [match[1], match[2]]));
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((index) => {
    const channel = parseInt(hex.slice(index, index + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

const base = block(':root');
const levels = [1, 2, 3, 4, 5].map((level) => ({
  level,
  palette: level === 1 ? base : { ...base, ...block(`:root[data-difficulty='${level}']`) },
}));

for (const { level, palette } of levels) {
  test(`difficulty ${level} keeps text and controls readable`, () => {
    const pairs: [string, string, number][] = [
      ['paper', 'ink-850', 4.5],
      ['haze', 'ink-850', 4.5],
      ['haze', 'ink-800', 4.5],
      ['ink-900', 'violet', 4.5],
      ['violet', 'ink-850', 4.5],
      ['signal', 'ink-850', 4.5],
      ['line-strong', 'ink-850', 3],
    ];
    for (const [fore, back, floor] of pairs) {
      const ratio = contrast(palette[fore] as string, palette[back] as string);
      assert.ok(ratio >= floor, `level ${level}: --${fore} on --${back} is ${ratio.toFixed(2)}, needs ${floor}`);
    }
  });
}

test('each level is redder than the last', () => {
  let previous = -Infinity;
  for (const { level, palette } of levels) {
    const accent = palette.violet as string;
    const red = parseInt(accent.slice(1, 3), 16) - parseInt(accent.slice(5, 7), 16);
    assert.ok(red > previous, `level ${level} accent ${accent} should lean redder`);
    previous = red;
  }
});
