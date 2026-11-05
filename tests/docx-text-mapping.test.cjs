const assert = require('node:assert/strict');
const { test } = require('node:test');
const { matchDocxParagraphs } = require('../docx-text-mapping.js');

test('matching keeps repeated paragraphs in reading order', () => {
  assert.deepEqual(matchDocxParagraphs(['same', 'intro', 'same'], ['same', 'same']), [0, 2]);
});

test('an unmatched paragraph does not prevent later matches', () => {
  assert.deepEqual(matchDocxParagraphs(['first', 'second'], ['missing', 'second']), [-1, 1]);
});
