const assert = require('node:assert/strict');
const { test } = require('node:test');
const { fadeAlpha } = require('../video-transition.js');

test('cut mode never adds a fade', () => {
  assert.equal(fadeAlpha('cut', 1, 3, 0.1, 4), 0);
});

test('fade mode fades into the first frame of later clips', () => {
  assert.equal(fadeAlpha('fade', 1, 2, 0, 4), 1);
  assert.equal(fadeAlpha('fade', 1, 2, 0.2, 4), 0.5);
  assert.equal(fadeAlpha('fade', 1, 2, 0.4, 4), 0);
});

test('fade mode fades out of earlier clips without changing clip duration', () => {
  assert.equal(fadeAlpha('fade', 0, 2, 3.6, 4), 0);
  assert.ok(Math.abs(fadeAlpha('fade', 0, 2, 3.8, 4) - 0.5) < 1e-9);
  assert.ok(Math.abs(fadeAlpha('fade', 0, 2, 4, 4) - 1) < 1e-9);
});

test('a one-clip timeline does not fade its ends', () => {
  assert.equal(fadeAlpha('fade', 0, 1, 0, 4), 0);
  assert.equal(fadeAlpha('fade', 0, 1, 4, 4), 0);
});
