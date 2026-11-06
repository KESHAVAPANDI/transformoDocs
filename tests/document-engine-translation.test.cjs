const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

function loadEngine() {
  const Translator = {
    availability: async () => 'available',
    create: async () => ({ translate: async text => `JP: ${text}`, destroy() {} })
  };
  const window = {
    PDFLib: {}, pdfjsLib: { GlobalWorkerOptions: {} },
    TransformoPdfCrop: {},
    TransformoSearchableFont: { searchableFontFamily: () => 'Arial' },
    Translator
  };
  const sandbox = {
    window, Translator,
    document: { createElement: () => ({}) },
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
    Blob,
    setTimeout() {}
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../document-engine.js'), 'utf8'), sandbox);
  return window.DocumentEngine;
}

test('PDF translation groups nearby lines and preserves every source anchor', async () => {
  const engine = loadEngine();
  const lines = [
    { text: 'Hello', x: 100, y: 700, width: 30, height: 10, size: 10 },
    { text: 'world', x: 102, y: 688, width: 28, height: 10, size: 10 },
    { text: '• Separate item', x: 100, y: 650, width: 100, height: 10, size: 10 }
  ];
  const anchors = lines.map(({ x, y, width, height, size }) => ({ x, y, width, height, size }));
  const pages = [{ width: 612, height: 792, lines }];
  await engine.translateLines(pages, 'en', 'ja', () => {}, { mode: 'local' });
  assert.equal(lines[0].translationText, 'JP: Hello world');
  assert.equal(lines[1].translationText, 'JP: Hello world');
  assert.equal(lines[2].translationText, 'JP: • Separate item');
  assert.deepEqual(lines.map(({ x, y, width, height, size }) => ({ x, y, width, height, size })), anchors);
  assert.equal(lines[0].translationBlockId, lines[1].translationBlockId);
  assert.notEqual(lines[1].translationBlockId, lines[2].translationBlockId);
});
