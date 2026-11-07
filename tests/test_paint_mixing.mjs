import test from 'node:test';
import assert from 'node:assert/strict';
import { bestWashMatch, findPaintMatch, mixColors } from '../web/src/paint-mixing.ts';

const palette = [
  { paintId: 'red', color: [210, 45, 50] },
  { paintId: 'yellow', color: [240, 210, 35] },
  { paintId: 'blue', color: [40, 85, 215] },
];

test('matches a three-paint mixture without rounding intermediate mixtures', () => {
  const target = mixColors(palette.map((paint) => paint.color), [0.2, 0.3, 0.5]);
  const match = findPaintMatch(target, palette);
  assert.equal(match.components.length, 3);
  assert.equal(match.washStrength, 100);
  assert.equal(match.distance, 0);
  assert.deepEqual(Object.fromEntries(match.components.map((component) => [component.paintId, component.proportion])), { red: 0.2, yellow: 0.3, blue: 0.5 });
});

test('keeps simpler recipes where they suffice', () => {
  assert.equal(findPaintMatch(palette[0].color, palette).components.length, 1);
  const target = mixColors([palette[0].color, palette[1].color], [0.4, 0.6]);
  assert.equal(findPaintMatch(target, palette).components.length, 2);
});

test('scores the rounded wash strength actually stored', () => {
  const target = [200, 150, 125];
  const color = [140, 50, 20];
  const match = bestWashMatch(target, color, 0.8);
  const actual = [246, 243, 233].map((paper, i) => (paper + (color[i] - paper) * match.washStrength / 100) * 0.8);
  assert.ok(Math.abs(match.distance - actual.reduce((sum, channel, i) => sum + (channel - target[i]) ** 2, 0)) < 1e-8);
});
