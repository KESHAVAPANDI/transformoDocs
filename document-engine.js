/* Local document operations. Files are read in this tab and are never uploaded. */
(() => {
  const { PDFDocument, StandardFonts, rgb } = window.PDFLib || {};
  const pdfjs = window.pdfjsLib;
  if (pdfjs) pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  function requireLibraries(...names) {
    const missing = names.filter(name => !window[name]);
    if (missing.length) throw new Error(`Could not load ${missing.join(', ')}. Check your connection and reload Transformo.`);
  }
  function safeBase(name) { return (name.replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N}-]+/gu, '-').replace(/^-|-$/g, '') || 'transformo-file').slice(0, 80); }
  function download(blob, filename) {
    const url = URL.createObjectURL(blob), anchor = document.createElement('a');
    anchor.href = url; anchor.download = filename; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  function bytesToBlob(bytes, type = 'application/pdf') { return new Blob([bytes], { type }); }
  function parsePageRanges(input, max) {
    const selected = new Set();
    for (const token of input.split(',').map(part => part.trim()).filter(Boolean)) {
      const match = token.match(/^(\d+)(?:\s*[-–]\s*(\d+))?$/);
      if (!match) throw new Error(`“${token}” is not a valid page or range.`);
      let start = Number(match[1]), end = Number(match[2] || match[1]);
      if (start < 1 || end < start || end > max) throw new Error(`Use page numbers from 1 to ${max}.`);
      for (let p = start; p <= end; p++) selected.add(p - 1);
    }
    return [...selected].sort((a, b) => a - b);
  }

  async function mergePdfs(files) {
    requireLibraries('PDFLib');
    if (files.length < 2) throw new Error('Choose at least two PDF files to merge.');
    const output = await PDFDocument.create();
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith('.pdf')) throw new Error('Merge currently accepts PDF files.');
      const input = await PDFDocument.load(await file.arrayBuffer());
      const pages = await output.copyPages(input, input.getPageIndices());
      pages.forEach(page => output.addPage(page));
    }
    download(bytesToBlob(await output.save()), `${safeBase(files[0].name)}-merged.pdf`);
    return 'Merged PDF downloaded. The originals are unchanged.';
  }

  async function splitPdf(file, range) {
    requireLibraries('PDFLib');
    const source = await PDFDocument.load(await file.arrayBuffer());
    const indices = parsePageRanges(range, source.getPageCount());
    if (!indices.length) throw new Error('Enter the pages to keep, such as 1–3, 5.');
    const output = await PDFDocument.create();
    (await output.copyPages(source, indices)).forEach(page => output.addPage(page));
    download(bytesToBlob(await output.save()), `${safeBase(file.name)}-pages-${indices.map(i => i + 1).join('_')}.pdf`);
    return `Created a new PDF with ${indices.length} selected page${indices.length === 1 ? '' : 's'}.`;
  }

  async function imagesToPdf(files) {
    requireLibraries('PDFLib');
    const output = await PDFDocument.create();
    for (const file of files) {
      const data = await file.arrayBuffer(), type = file.type.toLowerCase();
      let image;
      if (type === 'image/jpeg' || type === 'image/jpg') image = await output.embedJpg(data);
      else if (type === 'image/png') image = await output.embedPng(data);
      else {
        const bitmap = await createImageBitmap(file), canvas = document.createElement('canvas');
        canvas.width = bitmap.width; canvas.height = bitmap.height;
        canvas.getContext('2d').drawImage(bitmap, 0, 0); bitmap.close();
        const png = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        image = await output.embedPng(await png.arrayBuffer());
      }
      const page = output.addPage([image.width, image.height]);
      page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
    }
    download(bytesToBlob(await output.save()), `${safeBase(files[0].name)}-images.pdf`);
    return `Created a PDF with ${files.length} image${files.length === 1 ? '' : 's'}.`;
  }

  async function textToPdf(file) {
    requireLibraries('PDFLib');
    const text = (await file.text()).replace(/\r/g, ''), output = await PDFDocument.create();
    const scale = 2, width = 612, height = 792, margin = 52 * scale, fontSize = 11 * scale, lineHeight = 16 * scale;
    let canvas = document.createElement('canvas'), context = canvas.getContext('2d');
    canvas.width = width * scale; canvas.height = height * scale;
    const drawPage = async () => {
      const image = await output.embedPng(await (await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))).arrayBuffer());
      const page = output.addPage([width, height]); page.drawImage(image, { x: 0, y: 0, width, height });
      canvas = document.createElement('canvas'); canvas.width = width * scale; canvas.height = height * scale; context = canvas.getContext('2d');
      context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.fillStyle = '#1f2025'; context.font = `${fontSize}px Arial, sans-serif`; context.textBaseline = 'top';
    };
    let y = margin; context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.fillStyle = '#1f2025'; context.font = `${fontSize}px Arial, sans-serif`; context.textBaseline = 'top';
    for (const rawLine of text.split('\n')) {
      const words = rawLine.trim().split(/\s+/), lines = []; let line = '';
      for (const word of words) { const next = line ? `${line} ${word}` : word; if (line && context.measureText(next).width > canvas.width - margin * 2) { lines.push(line); line = word; } else line = next; }
      lines.push(line);
      for (const item of lines) { if (y + lineHeight > canvas.height - margin) { await drawPage(); y = margin; } context.fillText(item, margin, y, canvas.width - margin * 2); y += lineHeight; }
      y += 5 * scale;
    }
    await drawPage();
    download(bytesToBlob(await output.save()), `${safeBase(file.name)}.pdf`);
    return 'Created a PDF from your text file. Text is rasterized to support Unicode; it will not be searchable.';
  }

  async function pdfToImages(file) {
    requireLibraries('PDFLib', 'JSZip');
    if (!pdfjs) throw new Error('The PDF preview library did not load. Check your connection and reload.');
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const zip = new JSZip();
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number), viewport = page.getViewport({ scale: 1.6 });
      const canvas = document.createElement('canvas'); canvas.width = viewport.width; canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      zip.file(`page-${String(number).padStart(3, '0')}.png`, blob);
    }
    download(await zip.generateAsync({ type: 'blob' }), `${safeBase(file.name)}-pages.zip`);
    return `Exported ${pdf.numPages} page images in a ZIP file.`;
  }

  async function inspectPdf(file) {
    if (!pdfjs) throw new Error('The PDF text reader did not load. Check your connection and reload.');
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number), content = await page.getTextContent(), lines = new Map();
      for (const item of content.items) {
        if (!item.str || !item.str.trim() || !item.transform) continue;
        const x = item.transform[4], y = item.transform[5], size = Math.max(5, Math.hypot(item.transform[0], item.transform[1]));
        const key = Math.round(y * 2) / 2;
        const current = lines.get(key) || { page: number - 1, x, y, size, width: 0, height: 0, parts: [] };
        current.x = Math.min(current.x, x); current.size = Math.max(current.size, size); current.height = Math.max(current.height, item.height || size);
        current.width = Math.max(current.width, x + (item.width || 0) - current.x); current.parts.push({ x, text: item.str }); lines.set(key, current);
      }
      pages.push({ width: page.view[2] - page.view[0], height: page.view[3] - page.view[1], lines: [...lines.values()].map(line => ({ ...line, text: line.parts.sort((a, b) => a.x - b.x).map(part => part.text).join(' ').replace(/\s+/g, ' ').trim() })).filter(line => line.text) });
    }
    return pages;
  }

  function supportsTranslation() { return typeof window.Translator !== 'undefined'; }
  async function translateLines(pages, sourceLanguage, targetLanguage, onProgress = () => {}) {
    if (!supportsTranslation()) throw new Error('This browser does not provide its built-in Translator API. You can still edit the extracted text manually, or open Transformo in a browser that supports on-device translation.');
    const availability = await Translator.availability({ sourceLanguage, targetLanguage });
    if (availability === 'unavailable') throw new Error(`The browser has no translation model for ${sourceLanguage} → ${targetLanguage}.`);
    const translator = await Translator.create({ sourceLanguage, targetLanguage });
    let done = 0; const total = pages.reduce((count, page) => count + page.lines.length, 0);
    for (const page of pages) for (const line of page.lines) {
      line.edited = await translator.translate(line.text); onProgress(++done, total);
    }
    translator.destroy?.();
    return pages;
  }

  async function exportPositionedPdf(file, pages, onProgress = () => {}) {
    requireLibraries('PDFLib');
    if (!pdfjs) throw new Error('The PDF renderer did not load.');
    const source = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise, output = await PDFDocument.create();
    let overflowLines = 0;
    for (let index = 0; index < source.numPages; index++) {
      const page = await source.getPage(index + 1), viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d', { alpha: false }); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      const lines = pages[index]?.lines || [];
      for (const line of lines) {
        const value = (line.edited ?? line.text).trim(); if (!value) continue;
        const [left, baseline] = viewport.convertToViewportPoint(line.x, line.y);
        const width = Math.max(6, line.width * viewport.scale), height = Math.max(7, line.height * viewport.scale);
        const x = left, y = baseline - height * .92, pad = Math.max(1, height * .06);
        ctx.fillStyle = '#fff'; ctx.fillRect(x - pad, y, width + 2 * pad, height * 1.12);
        let fontSize = Math.max(8, line.size * viewport.scale * .92); ctx.font = `${fontSize}px Arial, sans-serif`;
        while (ctx.measureText(value).width > width && fontSize > 6) { fontSize -= .5; ctx.font = `${fontSize}px Arial, sans-serif`; }
        if (ctx.measureText(value).width > width) overflowLines++;
        ctx.fillStyle = '#171717'; ctx.textBaseline = 'alphabetic'; ctx.fillText(value, x, baseline, width);
      }
      const image = await output.embedPng(await (await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))).arrayBuffer());
      const newPage = output.addPage([page.view[2] - page.view[0], page.view[3] - page.view[1]]);
      newPage.drawImage(image, { x: 0, y: 0, width: newPage.getWidth(), height: newPage.getHeight() });
      onProgress(index + 1, source.numPages);
    }
    download(bytesToBlob(await output.save()), `${safeBase(file.name)}-transformed.pdf`);
    return overflowLines;
  }

  window.DocumentEngine = { mergePdfs, splitPdf, imagesToPdf, textToPdf, pdfToImages, inspectPdf, supportsTranslation, translateLines, exportPositionedPdf, download };
})();
