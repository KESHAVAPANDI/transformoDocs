const assert = require('node:assert/strict');
const { test } = require('node:test');
const { canvasSize, frameRect, getAspect } = require('../video-transform.js');

test('provides landscape, square, and portrait export canvases', () => {
  assert.deepEqual(canvasSize('landscape'), { width: 1280, height: 720 });
  assert.deepEqual(canvasSize('square'), { width: 960, height: 960 });
  assert.deepEqual(canvasSize('portrait'), { width: 720, height: 1280 });
  assert.equal(getAspect('unknown').label, '16:9');
});

test('Fit keeps the whole source inside the selected frame', () => {
  assert.deepEqual(frameRect(1920, 1080, 720, 1280, 'fit'), { x: 0, y: 437.5, width: 720, height: 405 });
  assert.deepEqual(frameRect(1080, 1920, 1280, 720, 'fit'), { x: 437.5, y: 0, width: 405, height: 720 });
});

test('Fill scales past the frame edges so the canvas crops excess image area', () => {
  assert.deepEqual(frameRect(1920, 1080, 720, 1280, 'fill'), { x: -777.7777777777778, y: 0, width: 2275.5555555555557, height: 1280 });
  assert.equal(frameRect(0, 1080, 720, 1280, 'fill'), null);
});
