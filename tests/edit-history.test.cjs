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
