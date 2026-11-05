const assert = require('node:assert/strict');
const { test } = require('node:test');
const { locatePosition, positionAt } = require('../video-timeline.js');

const clips = [
  { start: 2, end: 7 },
  { start: 10, end: 16 },
  { start: 1, end: 4 }
];

test('maps combined timeline positions to clip source times across trims', () => {
  assert.deepEqual(locatePosition(clips, 0), { index: 0, offset: 0, duration: 5, time: 2, position: 0 });
  assert.deepEqual(locatePosition(clips, 5), { index: 1, offset: 5, duration: 6, time: 10, position: 5 });
  assert.deepEqual(locatePosition(clips, 8.5), { index: 1, offset: 5, duration: 6, time: 13.5, position: 8.5 });
  assert.deepEqual(locatePosition(clips, 14), { index: 2, offset: 11, duration: 3, time: 4, position: 14 });
});

test('clamps seeks to the full timeline and handles empty clips', () => {
  assert.equal(locatePosition(clips, -4).time, 2);
  assert.deepEqual(locatePosition(clips, 200), { index: 2, offset: 11, duration: 3, time: 4, position: 14 });
  assert.equal(locatePosition([], 1), null);
});

test('maps a clip source time back to its combined timeline position', () => {
  assert.equal(positionAt(clips, 0, 3.25), 1.25);
  assert.equal(positionAt(clips, 1, 15), 10);
  assert.equal(positionAt(clips, 2, 0), 11);
  assert.equal(positionAt(clips, 99, 1), 0);
});
