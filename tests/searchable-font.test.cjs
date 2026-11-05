const assert = require('node:assert/strict');
const { test } = require('node:test');
const { searchableFontFamily } = require('../searchable-font.js');

test('chooses font families from translated scripts rather than language alone', () => {
  assert.equal(searchableFontFamily('en', 'مرحبا'), 'Noto Sans Arabic');
  assert.equal(searchableFontFamily('en', 'こんにちは'), 'Noto Sans JP');
  assert.equal(searchableFontFamily('en', 'தமிழ்'), 'Noto Sans Tamil');
});

test('uses the target language font as a fallback for Latin text', () => {
  assert.equal(searchableFontFamily('ja', 'Document'), 'Noto Sans JP');
  assert.equal(searchableFontFamily('fr', 'Document'), 'Noto Sans');
});
