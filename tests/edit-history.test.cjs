const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createEditHistory } = require('../edit-history.js');

test('undo and redo restore grouped document text snapshots', () => {
  const history = createEditHistory(['source title', 'source body']);
  history.record(['edited title', 'edited body']);

  assert.deepEqual(history.undo(['edited title', 'edited body']), ['source title', 'source body']);
  assert.equal(history.canUndo, false);
  assert.equal(history.canRedo, true);
  assert.deepEqual(history.redo(['source title', 'source body']), ['edited title', 'edited body']);
});

test('reset can be undone and a new edit clears the redo branch', () => {
  const history = createEditHistory(['original']);
  history.record(['edited']);
  history.record(['original']);

  assert.deepEqual(history.undo(['original']), ['edited']);
  assert.equal(history.redo(['edited'])[0], 'original');
  assert.deepEqual(history.undo(['original']), ['edited']);
  history.record(['new edit']);
  assert.equal(history.redo(['new edit']), null);
});

test('history is bounded and unchanged snapshots are ignored', () => {
  const history = createEditHistory(['0'], 3);
  assert.equal(history.record(['0']), false);
  history.record(['1']);
  history.record(['2']);
  history.record(['3']);

  assert.deepEqual(history.undo(['3']), ['2']);
  assert.deepEqual(history.undo(['2']), ['1']);
  assert.equal(history.undo(['1']), null);
});

test('undoing a translation restores its source snapshot before starting a different one', () => {
  const source = [JSON.stringify(['source heading', null, null]), JSON.stringify(['source body', null, null])];
  const japanese = [JSON.stringify(['日本語の見出し', '0:0', '日本語の見出し']), JSON.stringify(['日本語の本文', '0:1', '日本語の本文'])];
  const spanish = [JSON.stringify(['título en español', '0:0', 'título en español']), JSON.stringify(['texto en español', '0:1', 'texto en español'])];
  const history = createEditHistory(source);
  history.record(japanese);

  assert.deepEqual(history.undo(japanese), source);
  history.record(spanish);
  assert.equal(history.redo(spanish), null);
  assert.deepEqual(history.current, spanish);
});
