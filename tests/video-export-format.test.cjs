const assert = require('node:assert/strict');
const { test } = require('node:test');
const { selectVideoExportFormat } = require('../video-export-format.js');

test('prefers MP4 when the browser reports a supported MP4 recorder', () => {
  const format = selectVideoExportFormat(type => type.startsWith('video/mp4'));
  assert.equal(format.extension, 'mp4');
  assert.equal(format.mimeType.startsWith('video/mp4'), true);
});

test('falls back to a supported WebM codec when MP4 is unavailable', () => {
  const format = selectVideoExportFormat(type => type === 'video/webm;codecs=vp8,opus');
  assert.deepEqual(format, { mimeType: 'video/webm;codecs=vp8,opus', extension: 'webm' });
});

test('returns no format when the browser supports none of the export types', () => {
  assert.equal(selectVideoExportFormat(() => false), null);
});
