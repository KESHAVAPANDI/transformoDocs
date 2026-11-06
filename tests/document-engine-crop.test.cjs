const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const TransformoPdfCrop = require('../pdf-crop.js');

function loadEngine(pages) {
  let downloadedName = '';
  const pdf = { getPages: () => pages, save: async () => new Uint8Array([1]) };
  const window = {
    PDFLib: { PDFDocument: { load: async () => pdf } },
    pdfjsLib: { GlobalWorkerOptions: {} },
    TransformoPdfCrop,
    TransformoSearchableFont: { searchableFontFamily: () => 'Arial' }
  };
  const sandbox = {
    window,
    document: { createElement: () => ({ click() {}, set download(value) { downloadedName = value; } }) },
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
    Blob,
    setTimeout() {}
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../document-engine.js'), 'utf8'), sandbox);
  return { engine: window.DocumentEngine, getDownloadedName: () => downloadedName };
}

function page(width, height, rotation = 0) {
  return {
    box: { x: 0, y: 0, width, height },
    crop: null,
    getCropBox() { return this.box; },
    getRotation() { return { angle: rotation }; },
    setCropBox(x, y, nextWidth, nextHeight) { this.crop = { x, y, width: nextWidth, height: nextHeight }; }
  };
}

test('crops every PDF page with visual millimeter margins and downloads a copy', async () => {
  const pages = [page(600, 800), page(600, 800, 90)];
  const { engine, getDownloadedName } = loadEngine(pages);
  await engine.cropPdf({ name: 'sample.pdf', arrayBuffer: async () => new ArrayBuffer(0) }, { left: 10, right: 20, top: 30, bottom: 40 });
  const pt = value => value * 72 / 25.4;
  assert.deepEqual(pages[0].crop, { x: pt(10), y: pt(40), width: 600 - pt(30), height: 800 - pt(70) });
  assert.deepEqual(pages[1].crop, { x: pt(40), y: pt(10), width: 600 - pt(70), height: 800 - pt(30) });
  assert.equal(getDownloadedName(), 'sample-cropped.pdf');
});

test('validates every page before changing any crop box', async () => {
  const pages = [page(600, 800), page(600, 800)];
  const { engine } = loadEngine(pages);
  await assert.rejects(engine.cropPdf({ name: 'sample.pdf', arrayBuffer: async () => new ArrayBuffer(0) }, { left: 200, right: 20, top: 0, bottom: 0 }), /consume the entire page/);
  assert.deepEqual(pages.map(item => item.crop), [null, null]);
});
