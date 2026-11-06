const assert = require('node:assert/strict');
const { test } = require('node:test');
const { millimetersToPoints, cropBoxForMargins } = require('../pdf-crop.js');

test('converts millimeters to PDF points', () => {
  assert.equal(millimetersToPoints(25.4), 72);
  assert.equal(millimetersToPoints(0), 0);
});

test('applies visual margins to an unrotated crop box', () => {
  assert.deepEqual(cropBoxForMargins({ x: 10, y: 20, width: 600, height: 800 }, { left: 10, right: 20, top: 30, bottom: 40 }), { x: 20, y: 60, width: 570, height: 730 });
});

test('maps visual margins through page rotation', () => {
  assert.deepEqual(cropBoxForMargins({ x: 0, y: 0, width: 600, height: 800 }, { left: 10, right: 20, top: 30, bottom: 40 }, 90), { x: 40, y: 10, width: 530, height: 770 });
  assert.deepEqual(cropBoxForMargins({ x: 0, y: 0, width: 600, height: 800 }, { left: 10, right: 20, top: 30, bottom: 40 }, 180), { x: 20, y: 30, width: 570, height: 730 });
  assert.deepEqual(cropBoxForMargins({ x: 0, y: 0, width: 600, height: 800 }, { left: 10, right: 20, top: 30, bottom: 40 }, 270), { x: 30, y: 20, width: 530, height: 770 });
});

test('rejects negative margins, invalid rotations, and empty crop areas', () => {
  assert.throws(() => cropBoxForMargins({ x: 0, y: 0, width: 100, height: 100 }, { left: -1 }), /non-negative/);
  assert.throws(() => cropBoxForMargins({ x: 0, y: 0, width: 100, height: 100 }, { left: 50, right: 50 }), /consume/);
  assert.throws(() => cropBoxForMargins({ x: 0, y: 0, width: 100, height: 100 }, {}, 45), /rotation/);
});
