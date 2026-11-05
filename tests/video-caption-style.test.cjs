const assert = require('node:assert/strict');
const { test } = require('node:test');
const { getVideoCaptionStyle } = require('../video-caption-style.js');

test('returns the selected classic, glass, or outline caption preset', () => {
  for (const id of ['classic', 'glass', 'outline']) assert.equal(getVideoCaptionStyle(id).id, id);
  assert.ok(getVideoCaptionStyle('glass').background.includes('rgba'));
  assert.equal(getVideoCaptionStyle('outline').background, null);
});

test('unknown saved styles safely fall back to classic', () => {
  assert.equal(getVideoCaptionStyle('missing').id, 'classic');
});
