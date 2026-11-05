const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createTranslationVariants } = require('../translation-variants.js');

test('keeps only the configured number of recent translation results', () => {
  const history = createTranslationVariants(2);
  history.add({ source: 'en', target: 'ja', document: 'japanese' });
  history.add({ source: 'en', target: 'fr', document: 'french' });
  history.add({ source: 'en', target: 'es', document: 'spanish' });

  assert.deepEqual(history.items.map(item => item.document), ['spanish', 'french']);
  assert.equal(history.select('1'), null);
  assert.equal(history.current.document, 'spanish');
});

test('replacing a language pair makes it the newest result without duplicates', () => {
  const history = createTranslationVariants(3);
  const first = history.add({ source: 'en', target: 'ja', document: 'older' });
  history.add({ source: 'en', target: 'fr', document: 'french' });
  const replacement = history.add({ source: 'en', target: 'ja', document: 'newer' });

  assert.notEqual(first.id, replacement.id);
  assert.deepEqual(history.items.map(item => item.document), ['newer', 'french']);
  assert.equal(history.current.id, replacement.id);
});

test('selection changes the current result and clearing drops retained results', () => {
  const history = createTranslationVariants();
  const japanese = history.add({ source: 'en', target: 'ja', document: 'japanese' });
  history.add({ source: 'en', target: 'fr', document: 'french' });

  assert.equal(history.select(japanese.id).document, 'japanese');
  assert.equal(history.current.id, japanese.id);
  history.clear();
  assert.deepEqual(history.items, []);
  assert.equal(history.current, null);
});
