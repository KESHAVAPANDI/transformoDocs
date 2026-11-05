const assert = require('node:assert/strict');
const { test } = require('node:test');
const { normalizeVolume, volumeFromPercent, volumePercent } = require('../video-audio.js');

test('keeps clip volume in the 0–1 range', () => {
  assert.equal(normalizeVolume(-0.3), 0);
  assert.equal(normalizeVolume(0.62), 0.62);
  assert.equal(normalizeVolume(1.5), 1);
});

test('defaults old or invalid clip volume settings to full volume', () => {
  assert.equal(normalizeVolume(undefined), 1);
  assert.equal(normalizeVolume('quiet'), 1);
  assert.equal(normalizeVolume('0.25'), 0.25);
});

test('converts the clip slider percentage to normalized audio volume', () => {
  assert.equal(volumeFromPercent(0), 0);
  assert.equal(volumeFromPercent(37), 0.37);
  assert.equal(volumeFromPercent(100), 1);
  assert.equal(volumeFromPercent(140), 1);
});

test('shows saved clip volume as a rounded slider percentage', () => {
  assert.equal(volumePercent(0), 0);
  assert.equal(volumePercent(0.376), 38);
  assert.equal(volumePercent(1), 100);
});
