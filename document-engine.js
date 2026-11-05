/* Local document operations. Files are read in this tab and are never uploaded. */
(() => {
  const { PDFDocument, StandardFonts, rgb, degrees } = window.PDFLib || {};
  const pdfjs = window.pdfjsLib;
  if (pdfjs) pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  function requireLibraries(...names) {
    const missing = names.filter(name => !window[name]);
    if (missing.length) throw new Error(`Could not load ${missing.join(', ')}. Check your connection and reload Transformo.`);
  }
  function safeBase(name) { return (name.replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N}-]+/gu, '-').replace(/^-|-$/g, '') || 'transformo-file').slice(0, 80); }
  function zipPath(base, target) {
    const parts = target.startsWith('/') ? [] : base.split('/');
    for (const part of target.split('/')) { if (!part || part === '.') continue; if (part === '..') parts.pop(); else parts.push(part); }
    return parts.join('/');
  }
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

  async function watermarkPdf(file, text) {
    requireLibraries('PDFLib');
    const watermark = text.trim();
    if (!watermark) throw new Error('Enter the watermark text first.');
    const pdf = await PDFDocument.load(await file.arrayBuffer()), font = await pdf.embedFont(StandardFonts.HelveticaBold);
    pdf.getPages().forEach(page => {
      const size = Math.min(52, Math.max(24, page.getWidth() * .085));
      const width = font.widthOfTextAtSize(watermark, size);
      page.drawText(watermark, { x: (page.getWidth() - width) / 2, y: page.getHeight() * .49, size, font, color: rgb(.55, .54, .62), opacity: .24, rotate: degrees(35) });
    });
    download(bytesToBlob(await pdf.save()), `${safeBase(file.name)}-watermarked.pdf`);
    return 'Watermarked PDF downloaded. The original is unchanged.';
  }

  async function numberPdf(file) {
    requireLibraries('PDFLib');
    const pdf = await PDFDocument.load(await file.arrayBuffer()), font = await pdf.embedFont(StandardFonts.Helvetica), pages = pdf.getPages();
    pages.forEach((page, index) => {
      const label = `${index + 1}`, size = 10, width = font.widthOfTextAtSize(label, size);
      page.drawText(label, { x: (page.getWidth() - width) / 2, y: 20, size, font, color: rgb(.35, .35, .4) });
    });
    download(bytesToBlob(await pdf.save()), `${safeBase(file.name)}-numbered.pdf`);
    return `Added page numbers to ${pages.length} page${pages.length === 1 ? '' : 's'}.`;
  }

  async function compressPdf(file, preset = 'balanced', onProgress = () => {}) {
    requireLibraries('PDFLib');
    if (!pdfjs) throw new Error('The PDF renderer did not load. Check your connection and reload.');
    if (!file?.name?.toLowerCase().endsWith('.pdf')) throw new Error('Choose a PDF to compress.');
    const settings = { compact: { scale: 1.2, quality: .62 }, balanced: { scale: 1.65, quality: .78 }, quality: { scale: 2.5, quality: .9 } }[preset];
    if (!settings) throw new Error('Choose a compression preset.');
    const source = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise, pageCount = source.numPages, output = await PDFDocument.create();
    try {
      for (let number = 1; number <= pageCount; number++) {
        const page = await source.getPage(number), viewport = page.getViewport({ scale: 1 }), renderViewport = page.getViewport({ scale: settings.scale });
        const canvas = document.createElement('canvas'); canvas.width = Math.ceil(renderViewport.width); canvas.height = Math.ceil(renderViewport.height);
        const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: context, viewport: renderViewport, background: '#ffffff' }).promise;
        const imageBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', settings.quality));
        if (!imageBlob) throw new Error(`Page ${number} could not be compressed in this browser.`);
        const image = await output.embedJpg(await imageBlob.arrayBuffer()), outputPage = output.addPage([viewport.width, viewport.height]);
        outputPage.drawImage(image, { x: 0, y: 0, width: viewport.width, height: viewport.height });
        canvas.width = 0; canvas.height = 0; onProgress(number, pageCount);
      }
    } finally { await source.destroy(); }
    const blob = bytesToBlob(await output.save({ useObjectStreams: true }));
    if (blob.size >= file.size) return { compressed: false, originalBytes: file.size, outputBytes: blob.size, pageCount };
    download(blob, `${safeBase(file.name)}-compressed.pdf`);
    return { compressed: true, originalBytes: file.size, outputBytes: blob.size, pageCount };
  }

  async function splitPdf(file, range) {
    requireLibraries('PDFLib');
    const source = await PDFDocument.load(await file.arrayBuffer());
    const indices = Array.isArray(range)
      ? [...new Set(range.map(Number))].sort((a, b) => a - b).map(page => page - 1)
      : parsePageRanges(range, source.getPageCount());
    if (indices.some(index => !Number.isInteger(index) || index < 0 || index >= source.getPageCount())) throw new Error(`Use page numbers from 1 to ${source.getPageCount()}.`);
    if (!indices.length) throw new Error('Enter the pages to keep, such as 1–3, 5.');
    const output = await PDFDocument.create();
    (await output.copyPages(source, indices)).forEach(page => output.addPage(page));
    download(bytesToBlob(await output.save()), `${safeBase(file.name)}-pages-${indices.map(i => i + 1).join('_')}.pdf`);
    return `Created a new PDF with ${indices.length} selected page${indices.length === 1 ? '' : 's'}.`;
  }

  async function organizePdf(file, order) {
    requireLibraries('PDFLib');
    const source = await PDFDocument.load(await file.arrayBuffer()), pageCount = source.getPageCount();
    if (!Array.isArray(order) || !order.length) throw new Error('Keep at least one page in the document.');
    const seen = new Set(), output = await PDFDocument.create();
    for (const item of order) {
      const index = Number(item.index), rotation = Number(item.rotation || 0);
      if (!Number.isInteger(index) || index < 0 || index >= pageCount || seen.has(index)) throw new Error('The page order is invalid.');
      if (![0, 90, 180, 270].includes(rotation)) throw new Error('Page rotation must be 90 degree steps.');
      seen.add(index);
      const [page] = await output.copyPages(source, [index]);
      if (rotation) page.setRotation(degrees((page.getRotation().angle + rotation) % 360));
      output.addPage(page);
    }
    for (let index = 0; index < pageCount; index++) {
      if (seen.has(index)) continue;
      const [page] = await output.copyPages(source, [index]);
      output.addPage(page);
    }
    download(bytesToBlob(await output.save()), `${safeBase(file.name)}-organized.pdf`);
    return `Saved ${output.getPageCount()} pages. The original is unchanged.`;
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
    const files = Array.isArray(file) ? file : [file];
    if (!files.length) throw new Error('Choose at least one text file.');
    if (files.some(item => !item.name.toLowerCase().endsWith('.txt'))) throw new Error('Text-to-PDF accepts .txt files.');
    const text = (await Promise.all(files.map(async item => files.length > 1 ? `— ${item.name} —\n${await item.text()}` : item.text()))).join('\n\n').replace(/\r/g, ''), output = await PDFDocument.create();
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
    download(bytesToBlob(await output.save()), `${files.length === 1 ? safeBase(files[0].name) : 'transformo-text'}-converted.pdf`);
    return `Created a PDF from ${files.length} text file${files.length === 1 ? '' : 's'}. Text is rasterized to support Unicode; it will not be searchable.`;
  }

  async function docxToText(input) {
    requireLibraries('JSZip');
    const files = Array.isArray(input) ? input : [input];
    if (!files.length) throw new Error('Choose at least one Word .docx file.');
    const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main', documents = [];
    for (const file of files) {
      if (!file?.name?.toLowerCase().endsWith('.docx')) throw new Error('Choose Word .docx files only.');
      const archive = await JSZip.loadAsync(await file.arrayBuffer()), entry = archive.file('word/document.xml');
      if (!entry) throw new Error(`${file.name} does not contain a readable Word document body.`);
      const document = new DOMParser().parseFromString(await entry.async('text'), 'application/xml');
      if (document.querySelector('parsererror')) throw new Error(`${file.name} has Word document XML that could not be read.`);
      const body = document.getElementsByTagNameNS(ns, 'body')[0];
      if (!body) throw new Error(`${file.name} has no readable document body.`);
      const readText = node => [...node.childNodes].map(child => {
        if (child.nodeType === Node.TEXT_NODE || child.localName === 't' || child.localName === 'delText') return child.textContent;
        if (child.localName === 'tab') return '\t';
        if (child.localName === 'br' || child.localName === 'cr') return '\n';
        return child.childNodes.length ? readText(child) : '';
      }).join('');
      const parts = [];
      for (const child of body.children) {
        if (child.namespaceURI !== ns) continue;
        if (child.localName === 'p') {
          const text = readText(child).replace(/[\t ]+$/gm, '').trim();
          if (!text) { parts.push(''); continue; }
          parts.push(`${child.getElementsByTagNameNS(ns, 'numPr').length ? '• ' : ''}${text}`);
        } else if (child.localName === 'tbl') {
          for (const row of [...child.children].filter(node => node.localName === 'tr')) {
            const cells = [...row.children].filter(node => node.localName === 'tc').map(cell => [...cell.children].filter(node => node.localName === 'p').map(readText).join(' / ').trim());
            parts.push(cells.join('\t'));
          }
        }
      }
      const text = parts.join('\n').replace(/\n{3,}/g, '\n\n').trim();
      if (!text) throw new Error(`No readable paragraph or table text was found in ${file.name}.`);
      documents.push(files.length > 1 ? `===== ${file.name} =====\n${text}` : text);
    }
    download(new Blob([documents.join('\n\n')], { type: 'text/plain;charset=utf-8' }), `${files.length === 1 ? safeBase(files[0].name) : 'transformo-word-documents'}.txt`);
    return `Extracted text from ${files.length} Word document${files.length === 1 ? '' : 's'}. Paragraph breaks, list markers, and table columns are preserved.`;
  }

  async function renderDocxPreview(file, container) {
    requireLibraries('docx', 'JSZip');
    if (!file?.name?.toLowerCase().endsWith('.docx')) throw new Error('Choose a Word .docx file.');
    if (!container) throw new Error('The Word preview area is unavailable.');
    container.replaceChildren();
    await window.docx.renderAsync(file, container, container, {
      className: 'docx', breakPages: true, ignoreWidth: false, ignoreHeight: false,
      renderHeaders: true, renderFooters: true, renderFootnotes: true, renderEndnotes: true
    });
    const pages = [...container.querySelectorAll('section.docx')];
    if (!pages.length) throw new Error('No Word pages were created for the preview.');
    if (document.fonts?.ready) await document.fonts.ready;
    await Promise.all([...container.querySelectorAll('img')].map(image => image.complete ? Promise.resolve() : new Promise(resolve => {
      const done = () => resolve();
      image.addEventListener('load', done, { once: true });
      image.addEventListener('error', done, { once: true });
      setTimeout(done, 12000);
    })));
    container.__transformoSourceFile = file;
    return pages.length;
  }

  function expandDocxPreviewHost(container) {
    const previous = { maxHeight: container.style.maxHeight, overflow: container.style.overflow, overflowX: container.style.overflowX, overflowY: container.style.overflowY };
    container.style.maxHeight = 'none'; container.style.overflow = 'visible'; container.style.overflowX = 'visible'; container.style.overflowY = 'visible';
    return () => Object.assign(container.style, previous);
  }

  function clearDocxTranslation(container) {
    if (!container) return;
    container.querySelectorAll('.docx-translation-layer').forEach(layer => layer.remove());
    container.querySelectorAll('.docx-translation-masked').forEach(element => element.classList.remove('docx-translation-masked'));
    container.querySelectorAll('section.docx').forEach(page => { page.classList.remove('docx-translation-page'); delete page.dataset.translationVisible; });
  }

  function setDocxTranslationMode(container, mode) {
    if (!container) return;
    const translated = mode === 'translated';
    container.querySelectorAll('section.docx').forEach(page => {
      page.classList.toggle('docx-translation-page', translated);
      page.querySelectorAll('.docx-translation-masked').forEach(element => element.classList.toggle('docx-translation-masked', translated));
      const layer = page.querySelector('.docx-translation-layer');
      if (layer) layer.style.display = translated ? 'block' : 'none';
    });
  }

  function clearDocxEdit(container) {
    if (!container) return;
    if (container.__transformoDocxHistory?.timer) clearTimeout(container.__transformoDocxHistory.timer);
    delete container.__transformoDocxHistory;
    delete container.__transformoUndoDocxEdit;
    delete container.__transformoRedoDocxEdit;
    if (container.__transformoDocxUndoKeydown) container.removeEventListener('keydown', container.__transformoDocxUndoKeydown);
    delete container.__transformoDocxUndoKeydown;
    delete container.__transformoReportDocxEdit;
    container.querySelectorAll('.docx-editing-layer').forEach(layer => layer.remove());
    container.querySelectorAll('.docx-editing-masked').forEach(element => element.classList.remove('docx-editing-masked'));
    container.querySelectorAll('section.docx').forEach(page => page.classList.remove('docx-editing-page'));
  }

  function setDocxEditMode(container, mode) {
    if (!container) return;
    const edited = mode === 'edited';
    container.querySelectorAll('section.docx').forEach(page => {
      page.classList.toggle('docx-editing-page', edited);
      page.querySelectorAll('.docx-editing-masked').forEach(element => element.classList.toggle('docx-editing-masked', edited));
      const layer = page.querySelector('.docx-editing-layer');
      if (layer) layer.style.display = edited ? 'block' : 'none';
    });
  }

  function resetDocxEdit(container) {
    if (!container) return;
    pushDocxEditSnapshot(container);
    container.querySelectorAll('.docx-editing-block').forEach(overlay => { overlay.textContent = overlay.dataset.originalText || ''; });
    pushDocxEditSnapshot(container);
    container.__transformoReportDocxEdit?.();
  }

  function readDocxEditSnapshot(container) {
    return [...container.querySelectorAll('.docx-editing-block')].map(overlay => overlay.innerText || overlay.textContent || '');
  }

  function pushDocxEditSnapshot(container) {
    const history = container.__transformoDocxHistory;
    if (!history) return;
    if (history.timer) clearTimeout(history.timer);
    history.timer = null;
    history.history.record(readDocxEditSnapshot(container));
  }

  function moveDocxEditHistory(container, direction) {
    const history = container.__transformoDocxHistory;
    if (!history) return false;
    if (history.timer) clearTimeout(history.timer);
    history.timer = null;
    const current = readDocxEditSnapshot(container), snapshot = direction < 0 ? history.history.undo(current) : history.history.redo(current);
    if (!snapshot) return false;
    [...container.querySelectorAll('.docx-editing-block')].forEach((overlay, index) => { overlay.textContent = snapshot[index] || ''; });
    container.__transformoReportDocxEdit?.();
    return true;
  }

  function createDocxEditOverlay(container) {
    const pages = [...(container?.querySelectorAll('section.docx') || [])];
    if (!pages.length) throw new Error('The Word page preview is unavailable. Choose the file again.');
    clearDocxTranslation(container); clearDocxEdit(container);
    const blocks = [];
    pages.forEach((page, pageIndex) => {
      const pageRect = page.getBoundingClientRect();
      for (const element of page.querySelectorAll('p')) {
        const text = (element.innerText || element.textContent || '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n[ \t]+/g, '\n').trim();
        if (!text) continue;
        const bounds = element.getBoundingClientRect(), style = getComputedStyle(element);
        if (bounds.width < 2 || bounds.height < 2) continue;
        const fontSize = Math.max(5, parseFloat(style.fontSize) || 11), lineHeight = Math.max(fontSize, parseFloat(style.lineHeight) || fontSize * 1.2);
        blocks.push({ page, pageIndex, element, text, x: bounds.left - pageRect.left, y: bounds.top - pageRect.top, width: bounds.width, height: bounds.height, fontSize, lineHeight, fontFamily: style.fontFamily, fontWeight: style.fontWeight, fontStyle: style.fontStyle, textAlign: style.textAlign, textIndent: style.textIndent, direction: style.direction });
      }
    });
    if (!blocks.length) throw new Error('No editable Word paragraphs were found in this document.');
    const layers = new Map();
    pages.forEach(page => {
      page.classList.add('docx-editing-page');
      const layer = document.createElement('div'); layer.className = 'docx-editing-layer'; layer.setAttribute('role', 'group'); layer.setAttribute('aria-label', 'Editable Word page');
      page.append(layer); layers.set(page, layer);
    });
    blocks.forEach(block => {
      const overlay = document.createElement('div');
      overlay.className = 'docx-editing-block'; overlay.textContent = block.text;
      overlay.contentEditable = 'true'; overlay.spellcheck = true; overlay.setAttribute('role', 'textbox'); overlay.setAttribute('aria-label', `Edit paragraph on page ${block.pageIndex + 1}`); overlay.setAttribute('aria-multiline', 'true');
      Object.assign(overlay.style, { left: `${block.x}px`, top: `${block.y}px`, width: `${block.width}px`, height: `${block.height}px`, fontFamily: block.fontFamily, fontSize: `${block.fontSize}px`, fontWeight: block.fontWeight, fontStyle: block.fontStyle, lineHeight: `${block.lineHeight}px`, textAlign: block.textAlign, textIndent: block.textIndent, direction: block.direction, color: '#171717' });
      overlay.dataset.originalText = block.text; overlay.dataset.baseFontSize = String(block.fontSize); overlay.dataset.baseLineHeight = String(block.lineHeight); overlay.dataset.originalHeight = String(block.height);
      block.element.classList.add('docx-editing-masked'); layers.get(block.page).append(overlay);
    });
    container.__transformoDocxHistory = { history: TransformoEditHistory.createEditHistory(readDocxEditSnapshot(container)), timer: null };
    const report = () => {
      for (const overlay of container.querySelectorAll('.docx-editing-block')) {
        let size = Number(overlay.dataset.baseFontSize), lineHeight = Number(overlay.dataset.baseLineHeight), maxHeight = Number(overlay.dataset.originalHeight);
        overlay.style.fontSize = `${size}px`; overlay.style.lineHeight = `${lineHeight}px`;
        while (overlay.scrollHeight > maxHeight + 1 && size > 5) { size = Math.max(5, size - .5); lineHeight = Math.max(size * 1.05, Number(overlay.dataset.baseLineHeight) * size / Number(overlay.dataset.baseFontSize)); overlay.style.fontSize = `${size}px`; overlay.style.lineHeight = `${lineHeight}px`; }
        overlay.classList.toggle('docx-edit-overflow', overlay.scrollHeight > maxHeight + 1);
      }
      const overflowBlocks = container.querySelectorAll('.docx-editing-block.docx-edit-overflow').length;
      const modifiedBlocks = [...container.querySelectorAll('.docx-editing-block')].filter(overlay => overlay.textContent !== overlay.dataset.originalText).length;
      const history = container.__transformoDocxHistory?.history, current = readDocxEditSnapshot(container), saved = history?.current;
      const pendingEdit = !!saved && (saved.length !== current.length || saved.some((value, index) => value !== current[index]));
      container.dispatchEvent(new CustomEvent('transformo:docx-edit-change', { detail: { overflowBlocks, totalBlocks: blocks.length, modifiedBlocks, canUndo: !!history && (history.canUndo || pendingEdit), canRedo: !!history && history.canRedo && !pendingEdit } }));
    };
    container.__transformoReportDocxEdit = report;
    container.__transformoUndoDocxEdit = () => moveDocxEditHistory(container, -1);
    container.__transformoRedoDocxEdit = () => moveDocxEditHistory(container, 1);
    container.__transformoDocxUndoKeydown = event => {
      if (!(event.ctrlKey || event.metaKey) || !container.contains(event.target)) return;
      const key = event.key.toLowerCase(), undo = key === 'z' && !event.shiftKey, redo = key === 'y' || (key === 'z' && event.shiftKey);
      if (!undo && !redo) return;
      event.preventDefault();
      (undo ? container.__transformoUndoDocxEdit : container.__transformoRedoDocxEdit)?.();
    };
    container.addEventListener('keydown', container.__transformoDocxUndoKeydown);
    container.querySelectorAll('.docx-editing-block').forEach(overlay => {
      overlay.addEventListener('input', () => {
        report();
        const history = container.__transformoDocxHistory;
        if (history?.timer) clearTimeout(history.timer);
        if (history) history.timer = setTimeout(() => pushDocxEditSnapshot(container), 400);
      });
      overlay.addEventListener('blur', () => pushDocxEditSnapshot(container));
    });
    report(); setDocxEditMode(container, 'edited');
    return { pages: pages.length, blocks: blocks.length };
  }

  async function exportDocxEditedPdf(file, container, onProgress = () => {}) {
    requireLibraries('PDFLib', 'html2canvas');
    const pages = [...(container?.querySelectorAll('section.docx') || [])];
    if (!pages.length || !container.querySelector('.docx-editing-layer')) throw new Error('The Word editing preview is unavailable. Choose the file again.');
    setDocxEditMode(container, 'edited');
    const overflowBlocks = container.querySelectorAll('.docx-editing-block.docx-edit-overflow').length;
    const output = await PDFDocument.create(), restoreHost = expandDocxPreviewHost(container);
    onProgress(0, pages.length);
    try {
      for (const [index, page] of pages.entries()) {
        const bounds = page.getBoundingClientRect(), width = bounds.width || page.offsetWidth, height = bounds.height || page.offsetHeight;
        if (!(width > 0 && height > 0)) throw new Error(`Word page ${index + 1} has no measurable size.`);
        const canvas = await window.html2canvas(page, { backgroundColor: '#ffffff', scale: 2, logging: false, useCORS: true });
        const imageBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        if (!imageBlob) throw new Error(`Edited Word page ${index + 1} could not be captured.`);
        const image = await output.embedPng(await imageBlob.arrayBuffer()), pdfPage = output.addPage([width * .75, height * .75]);
        pdfPage.drawImage(image, { x: 0, y: 0, width: pdfPage.getWidth(), height: pdfPage.getHeight() });
        canvas.width = 1; canvas.height = 1; onProgress(index + 1, pages.length);
      }
    } finally { restoreHost(); }
    return { blob: bytesToBlob(await output.save()), filename: `${safeBase(file.name)}-edited.pdf`, overflowBlocks };
  }

  async function exportDocxOverlay(file, container, selector, suffix) {
    requireLibraries('JSZip');
    const overlays = [...(container?.querySelectorAll(selector) || [])];
    if (!overlays.length) throw new Error('No editable Word text blocks were found. Choose the file again.');
    const zip = await JSZip.loadAsync(file), documentPart = zip.file('word/document.xml');
    if (!documentPart) throw new Error('This Word file has no main document text part.');
    const xml = await documentPart.async('string'), documentXml = new DOMParser().parseFromString(xml, 'application/xml');
    if (documentXml.getElementsByTagName('parsererror').length) throw new Error('The Word document XML could not be read.');
    const wordNs = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main', xmlNs = 'http://www.w3.org/XML/1998/namespace';
    const paragraphs = [...documentXml.getElementsByTagNameNS(wordNs, 'p')];
    const readWordText = node => {
      if (node.nodeType !== Node.ELEMENT_NODE || node.namespaceURI !== wordNs || node.localName === 'pPr') return '';
      if (node.localName === 't' || node.localName === 'delText') return node.textContent || '';
      if (['tab', 'br', 'cr'].includes(node.localName)) return ' ';
      return [...node.childNodes].map(readWordText).join('');
    };
    const normalize = text => String(text || '').normalize('NFC').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    const paragraphText = paragraphs.map(paragraph => normalize(readWordText(paragraph)));
    const changes = overlays.map(overlay => ({ original: normalize(overlay.dataset.originalText), text: overlay.innerText || overlay.textContent || '' })).filter(change => normalize(change.text) !== change.original);
    if (!changes.length) throw new Error('No translated or edited text differs from the source paragraphs.');
    const matches = TransformoDocxTextMapping.matchDocxParagraphs(paragraphText, changes.map(change => change.original));
    let updatedParagraphs = 0, skippedParagraphs = 0;
    for (const [changeIndex, change] of changes.entries()) {
      const index = matches[changeIndex];
      if (index < 0) { skippedParagraphs++; continue; }
      const paragraph = paragraphs[index], textNodes = [...paragraph.getElementsByTagNameNS(wordNs, 't')];
      for (const localName of ['tab', 'br', 'cr']) [...paragraph.getElementsByTagNameNS(wordNs, localName)].forEach(node => node.remove());
      const text = change.text;
      const textParts = text.split(/\r?\n/);
      if (textNodes.length) {
        textNodes[0].textContent = textParts[0];
        textNodes[0].setAttributeNS(xmlNs, 'xml:space', 'preserve');
        textNodes.slice(1).forEach(node => { node.textContent = ''; });
        let anchor = textNodes[0];
        for (const part of textParts.slice(1)) {
          const lineBreak = documentXml.createElementNS(wordNs, 'w:br'), lineText = documentXml.createElementNS(wordNs, 'w:t');
          lineText.setAttributeNS(xmlNs, 'xml:space', 'preserve'); lineText.textContent = part;
          anchor.parentNode.insertBefore(lineBreak, anchor.nextSibling); anchor.parentNode.insertBefore(lineText, lineBreak.nextSibling); anchor = lineText;
        }
      } else {
        const run = documentXml.createElementNS(wordNs, 'w:r'), styleRun = paragraph.getElementsByTagNameNS(wordNs, 'r')[0], style = styleRun?.getElementsByTagNameNS(wordNs, 'rPr')[0];
        if (style) run.appendChild(style.cloneNode(true));
        textParts.forEach((part, index) => {
          if (index) run.appendChild(documentXml.createElementNS(wordNs, 'w:br'));
          const textElement = documentXml.createElementNS(wordNs, 'w:t'); textElement.setAttributeNS(xmlNs, 'xml:space', 'preserve'); textElement.textContent = part; run.appendChild(textElement);
        });
        const properties = paragraph.firstElementChild?.localName === 'pPr' ? paragraph.firstElementChild : null;
        paragraph.insertBefore(run, properties?.nextSibling || null);
      }
      updatedParagraphs++;
    }
    if (!updatedParagraphs) throw new Error('No changed text block could be matched to a source Word paragraph. The original file was left unchanged.');
    zip.file(documentPart.name, new XMLSerializer().serializeToString(documentXml));
    const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    return { blob, filename: `${safeBase(file.name)}-${suffix}.docx`, updatedParagraphs, skippedParagraphs };
  }

  async function exportDocxEditedDocx(file, container) { return exportDocxOverlay(file, container, '.docx-editing-block', 'edited'); }
  async function exportDocxTranslatedDocx(file, container) { return exportDocxOverlay(file, container, '.docx-translation-block', 'translated'); }

  async function translateDocxInPlace(container, sourceLanguage, targetLanguage, onProgress = () => {}, translationOptions = {}) {
    requireLibraries('docx', 'JSZip');
    const blocks = collectDocxTranslationBlocks(container);
    if (!blocks.length) throw new Error('No readable Word paragraphs were found to translate.');
    const translations = await translateTextBlocks(blocks.map(block => block.text), sourceLanguage, targetLanguage, onProgress, translationOptions);
    return applyDocxTranslationTexts(container, translations, targetLanguage);
  }

  function collectDocxTranslationBlocks(container) {
    const pages = [...(container?.querySelectorAll('section.docx') || [])];
    if (!pages.length) throw new Error('The Word page preview is unavailable. Choose the file again.');
    const blocks = [];
    pages.forEach((page, pageIndex) => {
      const pageRect = page.getBoundingClientRect();
      for (const element of page.querySelectorAll('p')) {
        const text = (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim();
        if (!text) continue;
        const bounds = element.getBoundingClientRect(), style = getComputedStyle(element);
        if (bounds.width < 2 || bounds.height < 2) continue;
        const fontSize = Math.max(5, parseFloat(style.fontSize) || 11), lineHeight = Math.max(fontSize, parseFloat(style.lineHeight) || fontSize * 1.2);
        blocks.push({ page, pageIndex, element, text, x: bounds.left - pageRect.left, y: bounds.top - pageRect.top, width: bounds.width, height: bounds.height, fontSize, lineHeight, fontFamily: style.fontFamily, fontWeight: style.fontWeight, fontStyle: style.fontStyle, textAlign: style.textAlign, textIndent: style.textIndent, direction: style.direction });
      }
    });
    return blocks;
  }

  function applyDocxTranslationTexts(container, translations, targetLanguage) {
    const pages = [...(container?.querySelectorAll('section.docx') || [])];
    if (!pages.length) throw new Error('The Word page preview is unavailable. Choose the file again.');
    clearDocxTranslation(container);
    const blocks = collectDocxTranslationBlocks(container);
    if (!blocks.length) throw new Error('No readable Word paragraphs were found to translate.');
    if (!Array.isArray(translations) || translations.length !== blocks.length || translations.some(text => typeof text !== 'string')) throw new Error('The saved Word translation does not match this document. Translate it again.');
    const layers = new Map();
    pages.forEach(page => {
      page.classList.add('docx-translation-page');
      const layer = document.createElement('div'); layer.className = 'docx-translation-layer'; layer.style.display = 'block'; layer.setAttribute('aria-hidden', 'true');
      page.append(layer); layers.set(page, layer);
    });
    const rtl = /^(ar|he)(?:-|$)/i.test(targetLanguage); let overflowBlocks = 0;
    blocks.forEach((block, index) => {
      const overlay = document.createElement('div'); overlay.className = 'docx-translation-block'; overlay.textContent = translations[index];
      overlay.dataset.originalText = block.text;
      Object.assign(overlay.style, { left: `${block.x}px`, top: `${block.y}px`, width: `${block.width}px`, height: `${block.height}px`, fontFamily: block.fontFamily, fontSize: `${block.fontSize}px`, fontWeight: block.fontWeight, fontStyle: block.fontStyle, lineHeight: `${block.lineHeight}px`, textAlign: block.textAlign === 'start' ? (rtl ? 'right' : 'left') : block.textAlign, textIndent: block.textIndent, direction: rtl ? 'rtl' : block.direction, color: '#171717' });
      layers.get(block.page).append(overlay); block.element.classList.add('docx-translation-masked');
      let size = block.fontSize, lineHeight = block.lineHeight;
      while (overlay.scrollHeight > block.height + 1 && size > 5) { size = Math.max(5, size - .5); lineHeight = Math.max(size * 1.05, lineHeight * size / block.fontSize); overlay.style.fontSize = `${size}px`; overlay.style.lineHeight = `${lineHeight}px`; }
      if (overlay.scrollHeight > block.height + 1) overflowBlocks++;
    });
    setDocxTranslationMode(container, 'translated');
    return overflowBlocks;
  }

  function captureDocxTranslationTexts(container) {
    return [...(container?.querySelectorAll('.docx-translation-block') || [])].map(overlay => overlay.textContent || '');
  }

  async function exportDocxTranslatedPdf(file, container, overflowLines = 0, onProgress = () => {}) {
    requireLibraries('PDFLib', 'html2canvas');
    if (!container || ![...container.querySelectorAll('section.docx')].length) throw new Error('The Word page preview is unavailable.');
    setDocxTranslationMode(container, 'translated');
    const pages = [...container.querySelectorAll('section.docx')], output = await PDFDocument.create(), restoreHost = expandDocxPreviewHost(container);
    onProgress(0, pages.length);
    try {
      for (const [index, page] of pages.entries()) {
        const bounds = page.getBoundingClientRect(), width = bounds.width || page.offsetWidth, height = bounds.height || page.offsetHeight;
        if (!(width > 0 && height > 0)) throw new Error(`Word page ${index + 1} has no measurable size.`);
        const canvas = await window.html2canvas(page, { backgroundColor: '#ffffff', scale: 2, logging: false, useCORS: true });
        const imageBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        if (!imageBlob) throw new Error(`Translated Word page ${index + 1} could not be captured.`);
        const image = await output.embedPng(await imageBlob.arrayBuffer()), pdfPage = output.addPage([width * .75, height * .75]);
        pdfPage.drawImage(image, { x: 0, y: 0, width: pdfPage.getWidth(), height: pdfPage.getHeight() });
        canvas.width = 1; canvas.height = 1; onProgress(index + 1, pages.length);
      }
    } finally { restoreHost(); }
    return { blob: bytesToBlob(await output.save()), overflowLines, filename: `${safeBase(file.name)}-translated.pdf` };
  }

  async function docxToPdf(file, container, onProgress = () => {}) {
    requireLibraries('PDFLib', 'docx', 'JSZip', 'html2canvas');
    if (!file?.name?.toLowerCase().endsWith('.docx')) throw new Error('Choose a Word .docx file.');
    if (!container || container.__transformoSourceFile !== file) await renderDocxPreview(file, container);
    const pages = [...container.querySelectorAll('section.docx')];
    if (!pages.length) throw new Error('The Word page preview is empty. Choose the file again.');
    const output = await PDFDocument.create(), restoreHost = expandDocxPreviewHost(container);
    onProgress(0, pages.length);
    try {
      for (const [index, page] of pages.entries()) {
        const bounds = page.getBoundingClientRect(), width = bounds.width || page.offsetWidth, height = bounds.height || page.offsetHeight;
        if (!(width > 0 && height > 0)) throw new Error(`Word page ${index + 1} has no measurable size.`);
        const canvas = await window.html2canvas(page, { backgroundColor: '#ffffff', scale: 2, logging: false, useCORS: true });
        const imageBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .95));
        if (!imageBlob) throw new Error(`Word page ${index + 1} could not be captured.`);
        const image = await output.embedJpg(await imageBlob.arrayBuffer()), pdfPage = output.addPage([width * .75, height * .75]);
        pdfPage.drawImage(image, { x: 0, y: 0, width: pdfPage.getWidth(), height: pdfPage.getHeight() });
        canvas.width = 1; canvas.height = 1;
        onProgress(index + 1, pages.length);
      }
    } finally { restoreHost(); }
    const blob = bytesToBlob(await output.save());
    download(blob, `${safeBase(file.name)}-visual.pdf`);
    return `Created a visual PDF from ${pages.length} Word page${pages.length === 1 ? '' : 's'}. Page appearance is preserved as images; text is not searchable.`;
  }

  async function docxToImages(file, container, format = 'png', onProgress = () => {}) {
    requireLibraries('docx', 'JSZip', 'html2canvas');
    if (!file?.name?.toLowerCase().endsWith('.docx')) throw new Error('Choose a Word .docx file.');
    if (!['png', 'jpg'].includes(format)) throw new Error('Choose PNG or JPG output.');
    if (!container || container.__transformoSourceFile !== file) await renderDocxPreview(file, container);
    const pages = [...container.querySelectorAll('section.docx')];
    if (!pages.length) throw new Error('The Word page preview is empty. Choose the file again.');
    const zip = new JSZip(), restoreHost = expandDocxPreviewHost(container), mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png', quality = format === 'jpg' ? .92 : undefined;
    onProgress(0, pages.length);
    try {
      for (const [index, page] of pages.entries()) {
        const canvas = await window.html2canvas(page, { backgroundColor: '#ffffff', scale: 2, logging: false, useCORS: true });
        const imageBlob = await new Promise(resolve => canvas.toBlob(resolve, mimeType, quality));
        if (!imageBlob) throw new Error(`Word page ${index + 1} could not be captured as ${format.toUpperCase()}.`);
        zip.file(`page-${String(index + 1).padStart(3, '0')}.${format}`, imageBlob);
        canvas.width = 1; canvas.height = 1; onProgress(index + 1, pages.length);
      }
    } finally { restoreHost(); }
    download(await zip.generateAsync({ type: 'blob' }), `${safeBase(file.name)}-${format}-pages.zip`);
    return `Exported ${pages.length} Word page${pages.length === 1 ? '' : 's'} as ${format.toUpperCase()} images in a ZIP. Images follow the browser-rendered page preview.`;
  }

  async function pptxToText(input) {
    requireLibraries('JSZip');
    const files = Array.isArray(input) ? input : [input], documents = [], presentationNs = 'http://schemas.openxmlformats.org/presentationml/2006/main', drawingNs = 'http://schemas.openxmlformats.org/drawingml/2006/main', relNs = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    if (!files.length) throw new Error('Choose at least one PowerPoint .pptx file.');
    for (const file of files) {
      if (!file?.name?.toLowerCase().endsWith('.pptx')) throw new Error('Choose PowerPoint .pptx files only.');
      const archive = await JSZip.loadAsync(await file.arrayBuffer()), presentationEntry = archive.file('ppt/presentation.xml');
      if (!presentationEntry) throw new Error(`${file.name} does not contain a readable PowerPoint presentation.`);
      const presentation = new DOMParser().parseFromString(await presentationEntry.async('text'), 'application/xml'), relationshipEntry = archive.file('ppt/_rels/presentation.xml.rels');
      if (presentation.querySelector('parsererror')) throw new Error(`${file.name} has presentation XML that could not be read.`);
      const targets = new Map();
      if (relationshipEntry) {
        const relationships = new DOMParser().parseFromString(await relationshipEntry.async('text'), 'application/xml');
        for (const relation of relationships.getElementsByTagName('Relationship')) targets.set(relation.getAttribute('Id'), relation.getAttribute('Target'));
      }
      const slideEntries = [...presentation.getElementsByTagNameNS(presentationNs, 'sldId')].map(item => {
        const target = targets.get(item.getAttributeNS(relNs, 'id')); if (!target) return null;
        return archive.file(zipPath('ppt', target));
      }).filter(Boolean);
      const orderedSlides = slideEntries.length ? slideEntries : Object.keys(archive.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort((a, b) => Number(a.match(/slide(\d+)/)[1]) - Number(b.match(/slide(\d+)/)[1])).map(name => archive.file(name));
      if (!orderedSlides.length) throw new Error(`No slides were found in ${file.name}.`);
      const slides = [];
      for (let index = 0; index < orderedSlides.length; index++) {
        const slideXml = new DOMParser().parseFromString(await orderedSlides[index].async('text'), 'application/xml');
        if (slideXml.querySelector('parsererror')) throw new Error(`Slide ${index + 1} in ${file.name} could not be read.`);
        const paragraphs = [...slideXml.getElementsByTagNameNS(drawingNs, 'p')].map(paragraph => [...paragraph.getElementsByTagNameNS(drawingNs, 't')].map(run => run.textContent).join('').trim()).filter(Boolean);
        if (paragraphs.length) slides.push(`Slide ${index + 1}\n${paragraphs.join('\n')}`);
      }
      if (!slides.length) throw new Error(`No slide text was found in ${file.name}.`);
      documents.push(files.length > 1 ? `===== ${file.name} =====\n${slides.join('\n\n')}` : slides.join('\n\n'));
    }
    download(new Blob([documents.join('\n\n')], { type: 'text/plain;charset=utf-8' }), `${files.length === 1 ? safeBase(files[0].name) : 'transformo-presentations'}.txt`);
    return `Extracted text from ${files.length} PowerPoint presentation${files.length === 1 ? '' : 's'} in slide order.`;
  }

  async function xlsxToCsv(input) {
    requireLibraries('JSZip');
    const files = Array.isArray(input) ? input : [input], outputs = [];
    if (!files.length) throw new Error('Choose at least one Excel .xlsx file.');
    const spreadsheetNs = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main', documentRelNs = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships', packageRelNs = 'http://schemas.openxmlformats.org/package/2006/relationships';
    const columnIndex = address => { const letters = address.match(/^[A-Z]+/i)?.[0]?.toUpperCase() || 'A'; return [...letters].reduce((index, char) => index * 26 + char.charCodeAt(0) - 64, 0) - 1; };
    const csvCell = (value, isText) => { let text = String(value ?? ''); if (isText && /^[=+\-@]/.test(text)) text = `'${text}`; return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; };
    for (const file of files) {
      if (!file?.name?.toLowerCase().endsWith('.xlsx')) throw new Error('Choose Excel .xlsx files only.');
      const archive = await JSZip.loadAsync(await file.arrayBuffer()), workbookEntry = archive.file('xl/workbook.xml'), relsEntry = archive.file('xl/_rels/workbook.xml.rels');
      if (!workbookEntry || !relsEntry) throw new Error(`${file.name} is missing Excel workbook metadata.`);
      const workbook = new DOMParser().parseFromString(await workbookEntry.async('text'), 'application/xml'), rels = new DOMParser().parseFromString(await relsEntry.async('text'), 'application/xml');
      if (workbook.querySelector('parsererror') || rels.querySelector('parsererror')) throw new Error(`${file.name} has Excel metadata that could not be read.`);
      const relationTargets = new Map([...rels.getElementsByTagNameNS(packageRelNs, 'Relationship')].map(relation => [relation.getAttribute('Id'), relation.getAttribute('Target')]));
      const sharedEntry = archive.file('xl/sharedStrings.xml'), sharedStrings = sharedEntry ? [...new DOMParser().parseFromString(await sharedEntry.async('text'), 'application/xml').getElementsByTagNameNS(spreadsheetNs, 'si')].map(item => [...item.getElementsByTagNameNS(spreadsheetNs, 't')].map(text => text.textContent).join('')) : [];
      const sheets = [...workbook.getElementsByTagNameNS(spreadsheetNs, 'sheet')];
      if (!sheets.length) throw new Error(`No worksheets were found in ${file.name}.`);
      for (const [sheetIndex, sheet] of sheets.entries()) {
        const target = relationTargets.get(sheet.getAttributeNS(documentRelNs, 'id'));
        if (!target) continue;
        const entry = archive.file(zipPath('xl', target)); if (!entry) continue;
        const xml = new DOMParser().parseFromString(await entry.async('text'), 'application/xml');
        if (xml.querySelector('parsererror')) throw new Error(`Worksheet ${sheet.getAttribute('name')} in ${file.name} could not be read.`);
        const rows = new Map(); let maxRow = -1, maxColumn = -1;
        for (const cell of xml.getElementsByTagNameNS(spreadsheetNs, 'c')) {
          const address = cell.getAttribute('r') || '', rowIndex = Math.max(0, Number(address.match(/\d+$/)?.[0] || 1) - 1), colIndex = columnIndex(address), type = cell.getAttribute('t');
          const valueNode = cell.getElementsByTagNameNS(spreadsheetNs, 'v')[0]; let value = valueNode?.textContent || '', isText = false;
          if (type === 's') { value = sharedStrings[Number(value)] || ''; isText = true; }
          else if (type === 'inlineStr') { value = [...cell.getElementsByTagNameNS(spreadsheetNs, 't')].map(text => text.textContent).join(''); isText = true; }
          else if (type === 'str' || type === 'e') isText = true;
          else if (type === 'b') value = value === '1' ? 'TRUE' : 'FALSE';
          const row = rows.get(rowIndex) || []; row[colIndex] = csvCell(value, isText); rows.set(rowIndex, row); maxRow = Math.max(maxRow, rowIndex); maxColumn = Math.max(maxColumn, colIndex);
        }
        const csv = Array.from({ length: maxRow + 1 }, (_, rowIndex) => Array.from({ length: maxColumn + 1 }, (_, colIndex) => rows.get(rowIndex)?.[colIndex] || '').join(',')).join('\r\n');
        const sheetName = sheet.getAttribute('name') || `Sheet${sheetIndex + 1}`;
        outputs.push({ file, sheetName, name: `${safeBase(file.name)}${sheets.length > 1 || files.length > 1 ? `/${safeBase(sheetName)}` : ''}.csv`, blob: new Blob([csv], { type: 'text/csv;charset=utf-8' }) });
      }
    }
    if (!outputs.length) throw new Error('No readable worksheets were found in these files.');
    if (outputs.length === 1) download(outputs[0].blob, outputs[0].name);
    else { const zip = new JSZip(); outputs.forEach(output => zip.file(output.name, output.blob)); download(await zip.generateAsync({ type: 'blob' }), 'transformo-spreadsheets-csv.zip'); }
    return `Exported ${outputs.length} worksheet${outputs.length === 1 ? '' : 's'} as CSV. Formula cells use their saved values; formatting is not included.`;
  }

  async function pdfsToImages(input, format = 'png') {
    requireLibraries('JSZip');
    if (!pdfjs) throw new Error('The PDF preview library did not load. Check your connection and reload.');
    const isJpg = format === 'jpg', mimeType = isJpg ? 'image/jpeg' : 'image/png', extension = isJpg ? 'jpg' : 'png';
    const files = Array.isArray(input) ? input : [input], zip = new JSZip();let totalPages=0;
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith('.pdf')) throw new Error('PDF-to-image conversion accepts PDF files only.');
      const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
      try {
        for (let number = 1; number <= pdf.numPages; number++) {
          const page = await pdf.getPage(number), viewport = page.getViewport({ scale: 1.6 });
          const canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
          await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
          const blob = await new Promise(resolve => canvas.toBlob(resolve, mimeType, isJpg ? .9 : undefined));
          if (!blob) throw new Error(`This browser could not create ${extension.toUpperCase()} images.`);
          zip.file(`${files.length > 1 ? `${safeBase(file.name)}/` : ''}page-${String(number).padStart(3, '0')}.${extension}`, blob);
          canvas.width = 0; canvas.height = 0;
        }
        totalPages += pdf.numPages;
      } finally { await pdf.destroy(); }
    }
    download(await zip.generateAsync({ type: 'blob' }), `${files.length === 1 ? safeBase(files[0].name) : 'transformo-pdfs'}-pages.zip`);
    return `Exported ${totalPages} ${extension.toUpperCase()} page image${totalPages === 1 ? '' : 's'} from ${files.length} PDF${files.length === 1 ? '' : 's'}.`;
  }

  async function pdfsToText(files) {
    if (!files.length) throw new Error('Choose at least one PDF.');
    const sections=[];
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith('.pdf')) throw new Error('PDF-to-text conversion accepts PDF files only.');
      const pages=await inspectPdf(file);
      sections.push(`${files.length>1?`===== ${file.name} =====\n`:''}${pages.map((page,index)=>`--- Page ${index+1} ---\n${page.lines.map(line=>line.text).join('\n')}`).join('\n\n')}`);
    }
    const blob=new Blob([sections.join('\n\n')],{type:'text/plain;charset=utf-8'});
    download(blob,`${files.length===1?safeBase(files[0].name):'transformo-pdfs'}-text.txt`);
    return `Extracted text from ${files.length} PDF${files.length===1?'':'s'}. Scanned pages need OCR first.`;
  }

  function xmlText(value) {
    return String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }

  function pdfDocxDocumentXml(pages) {
    const firstPage = pages[0], pageWidth = Math.max(6120, Math.round(firstPage.width * 20)), pageHeight = Math.max(7920, Math.round(firstPage.height * 20));
    const orientation = pageWidth > pageHeight ? ' w:orient="landscape"' : '', body = pages.map((page, pageIndex) => {
      let previousBottom = 36;
      const paragraphs = page.lines.map(line => {
        const left = Math.max(0, Math.min(page.width - 36, line.x - 36)), top = Math.max(36, page.height - line.y - line.height), before = Math.max(0, top - previousBottom), size = Math.max(6, Math.min(72, line.size || 10));
        previousBottom = Math.max(previousBottom, top + line.height);
        const rightToLeft = /[\u0590-\u08ff\ufb50-\ufdff\ufe70-\ufeff]/u.test(line.text);
        const bidi = rightToLeft ? '<w:bidi/>' : '', rtl = rightToLeft ? '<w:rtl/>' : '';
        return `<w:p><w:pPr>${bidi}<w:ind w:left="${Math.round(left * 20)}"/><w:spacing w:before="${Math.round(before * 20)}" w:after="0"/></w:pPr><w:r><w:rPr><w:sz w:val="${Math.round(size * 2)}"/>${rtl}</w:rPr><w:t xml:space="preserve">${xmlText(line.text)}</w:t></w:r></w:p>`;
      }).join('');
      return `${pageIndex ? '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' : ''}${paragraphs}`;
    }).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="${pageWidth}" w:h="${pageHeight}"${orientation}/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="360" w:footer="360" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  }

  function createDocxArchive(pages) {
    const archive = new JSZip();
    archive.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    archive.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    archive.file('word/document.xml', pdfDocxDocumentXml(pages));
    return archive;
  }

  async function pdfToDocx(file) {
    requireLibraries('JSZip');
    if (!file?.name?.toLowerCase().endsWith('.pdf')) throw new Error('Choose a PDF file.');
    const pages = await inspectPdf(file), textLines = pages.reduce((total, page) => total + page.lines.length, 0);
    if (pages.some(page => !page.lines.length)) throw new Error('This PDF contains scanned or image-only pages. Run OCR in Edit, export the OCR-enabled PDF, then convert it.');
    const archive = createDocxArchive(pages);
    const blob = await archive.generateAsync({ type: 'blob' });
    download(blob, `${safeBase(file.name)}.docx`);
    return `Created an editable Word document from ${textLines} text lines across ${pages.length} page${pages.length === 1 ? '' : 's'}. Approximate text positions, font sizes, and page breaks are carried over; columns, tables, and exact styling need review.`;
  }

  async function pdfsToDocx(files) {
    if (!files.length) throw new Error('Choose at least one PDF.');
    if (files.length === 1) return pdfToDocx(files[0]);
    const outputs = [];
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith('.pdf')) throw new Error('PDF-to-Word conversion accepts PDF files only.');
      const pages = await inspectPdf(file), textLines = pages.reduce((total, page) => total + page.lines.length, 0);
      if (pages.some(page => !page.lines.length)) throw new Error(`${file.name} contains scanned or image-only pages. Run OCR in Edit, export the OCR-enabled PDF, then convert it.`);
      const archive = createDocxArchive(pages);
      outputs.push({ name: `${String(outputs.length + 1).padStart(2, '0')}-${safeBase(file.name)}.docx`, blob: await archive.generateAsync({ type: 'blob' }) });
    }
    const zip = new JSZip(); outputs.forEach(output => zip.file(output.name, output.blob));
    download(await zip.generateAsync({ type: 'blob' }), 'transformo-pdfs-to-word.zip');
    return `Created ${outputs.length} editable Word files in a ZIP. Approximate text positions, font sizes, and page breaks are carried over; complex layout needs review.`;
  }

  async function inspectPdf(file) {
    if (!pdfjs) throw new Error('The PDF text reader did not load. Check your connection and reload.');
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages = [];
    try {
      for (let number = 1; number <= pdf.numPages; number++) {
        const page = await pdf.getPage(number), content = await page.getTextContent(), rows = [];
        for (const item of content.items) {
          if (!item.str || !item.str.trim() || !item.transform) continue;
          const x = item.transform[4], y = item.transform[5], size = Math.max(5, Math.hypot(item.transform[0], item.transform[1])), width = Math.max(0, item.width || 0);
          let row = rows.find(candidate => Math.abs(candidate.y - y) <= Math.max(1.25, size * .16));
          if (!row) { row = { y, segments: [] }; rows.push(row); }
          const nearby = row.segments.map(segment => {
            const gap = x > segment.right ? x - segment.right : x + width < segment.left ? segment.left - (x + width) : 0;
            return { segment, gap };
          }).filter(candidate => candidate.gap <= Math.max(14, size * 2.2)).sort((a, b) => a.gap - b.gap)[0];
          const segment = nearby?.segment || { page: number - 1, x, y, size, width: 0, height: 0, left: x, right: x, parts: [] };
          if (!nearby) row.segments.push(segment);
          segment.x = Math.min(segment.x, x); segment.left = Math.min(segment.left, x); segment.right = Math.max(segment.right, x + width);
          segment.size = Math.max(segment.size, size); segment.height = Math.max(segment.height, item.height || size);
          segment.width = Math.max(0, segment.right - segment.left); segment.parts.push({ x, text: item.str });
        }
        const lines = rows.flatMap(row => row.segments.map(line => ({ ...line, y: row.y, text: line.parts.sort((a, b) => a.x - b.x).map(part => part.text).join(' ').replace(/\s+/g, ' ').trim() })))
          .filter(line => line.text).sort((a, b) => b.y - a.y || a.x - b.x);
        pages.push({ width: page.view[2] - page.view[0], height: page.view[3] - page.view[1], lines });
      }
      return pages;
    } finally { await pdf.destroy(); }
  }

  async function renderPdfPages(file, scale = 0.42, limit = 24) {
    if (!pdfjs) throw new Error('The PDF preview library did not load. Check your connection and reload.');
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages = [];
    try {
      for (let number = 1; number <= Math.min(pdf.numPages, limit); number++) {
        const page = await pdf.getPage(number), viewport = page.getViewport({ scale });
        const canvas = window.document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.82));
        if (!blob) throw new Error(`Page ${number} could not be rendered for preview.`);
        pages.push({ number, blob });
        canvas.width = 0; canvas.height = 0;
      }
      return { pages, total: pdf.numPages };
    } finally { await pdf.destroy(); }
  }

  async function ocrPdf(file, language = 'eng', onProgress = () => {}, existingPages = []) {
    if (!pdfjs) throw new Error('The PDF renderer did not load. Check your connection and reload.');
    if (!window.Tesseract) throw new Error('The OCR engine did not load. Check your connection and reload.');
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages = [], worker = await Tesseract.createWorker(language, 1, { logger: message => onProgress(message) });
    try {
      for (let number = 1; number <= pdf.numPages; number++) {
        if (existingPages[number - 1]?.lines?.length) { pages.push(existingPages[number - 1]); onProgress({ status: 'recognizing text', progress: number / pdf.numPages }); continue; }
        const page = await pdf.getPage(number), viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        const result = await worker.recognize(canvas), factor = viewport.scale;
        const view = page.view, lines = (result.data.lines || []).map(line => {
          const box = line.bbox;
          return { page: number - 1, x: box.x0 / factor + view[0], y: view[3] - box.y1 / factor, width: (box.x1 - box.x0) / factor, height: (box.y1 - box.y0) / factor, size: (box.y1 - box.y0) / factor, text: line.text.trim() };
        }).filter(line => line.text);
        pages.push({ width: view[2] - view[0], height: view[3] - view[1], lines });
        onProgress({ status: 'recognizing text', progress: number / pdf.numPages });
      }
    } finally { await worker.terminate(); }
    return pages;
  }

  function supportsTranslation() { return typeof window.Translator !== 'undefined'; }
  async function translateTextBlocks(texts, sourceLanguage, targetLanguage, onProgress = () => {}, translationOptions = {}) {
    if (!texts.length) return [];
    const mode = translationOptions.mode || 'smart', allowOnline = !!translationOptions.allowOnline;
    const provider = translationOptions.provider || 'azure', providerName = provider === 'deepl' ? 'DeepL' : 'Azure Translator';
    if (mode === 'online' && !allowOnline) throw new Error(`Check the online translation consent box before sending text to ${providerName}.`);
    const translateOnline = async () => {
      if (!allowOnline) throw new Error(`On-device translation is unavailable. Select online translation and confirm that document text may be sent to ${providerName}.`);
      const output = [], batches = []; let batch = [], batchBytes = 0;
      for (const text of texts) {
        const bytes = new TextEncoder().encode(text).length;
        if (bytes > 10_000) throw new Error('A text block is too large for the online translation service. Edit or split that paragraph, then try again.');
        if (batch.length >= 24 || batchBytes + bytes > 90_000) { batches.push(batch); batch = []; batchBytes = 0; }
        batch.push(text); batchBytes += bytes;
      }
      if (batch.length) batches.push(batch);
      for (const batch of batches) {
        let response;
        try {
          response = await fetch('http://127.0.0.1:8766/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider, texts: batch, sourceLanguage, targetLanguage }) });
        } catch { throw new Error(`The local ${providerName} bridge is not running. Follow the optional online translation setup in README.md.`); }
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || `${providerName} translation failed (${response.status}).`);
        if (!Array.isArray(result.translations) || result.translations.length !== batch.length || result.translations.some(value => typeof value !== 'string')) throw new Error(`${providerName} returned an incomplete translation batch.`);
        output.push(...result.translations);
        onProgress(output.length, texts.length, { stage: 'online' });
      }
      return output;
    };
    if (mode === 'online') return translateOnline();
    if (mode === 'local' && !supportsTranslation()) throw new Error('This browser has no on-device Translator API. Switch to Smart or Online to use the optional translation bridge.');
    if (supportsTranslation()) {
      let translator;
      try {
        const options = { sourceLanguage, targetLanguage }, availability = await Translator.availability(options);
        if (availability === 'unavailable') throw new Error(`The browser has no translation model for ${sourceLanguage} → ${targetLanguage}.`);
        translator = await Translator.create({ ...options, monitor(monitor) { monitor.addEventListener('downloadprogress', event => onProgress(0, texts.length, { stage: 'download', progress: event.loaded })); } });
        const output = [];
        for (const [index, text] of texts.entries()) { output.push(await translator.translate(text)); onProgress(index + 1, texts.length, { stage: 'local' }); }
        return output;
      } catch (error) {
        if (!allowOnline || mode === 'local') throw error;
        onProgress(0, texts.length, { stage: 'fallback' });
      } finally { translator?.destroy?.(); }
    } else if (!allowOnline) {
      throw new Error(`This browser has no on-device Translator API. Select Online and confirm that document text may be sent to ${providerName}.`);
    }
    return translateOnline();
  }
  function groupParagraphLines(lines) {
    const groups = [];
    for (const line of [...lines].sort((a, b) => b.y - a.y || a.x - b.x)) {
      const beginsListItem = /^(?:[•◦▪*-]\s|\d+[.)]\s)/.test(line.text.trim());
      const candidates = beginsListItem ? [] : groups.map(group => {
        const previous = group.lines[group.lines.length - 1], leading = previous.y - line.y;
        const height = Math.max(previous.height || previous.size, line.height || line.size, 5);
        const indent = Math.abs(line.x - group.anchorX);
        return { group, leading, indent, score: indent + Math.abs(leading - height * 1.2) };
      }).filter(candidate => candidate.group.lines.length < 10 && candidate.group.lines.reduce((sum, item) => sum + item.text.length, 0) < 1500 && candidate.leading >= 2 && candidate.leading <= Math.max(candidate.group.lines.at(-1).height || 0, line.height || 0, 5) * 2.2 && candidate.indent <= Math.max(18, line.size * 2.5))
        .sort((a, b) => a.score - b.score);
      if (candidates.length) candidates[0].group.lines.push(line);
      else groups.push({ anchorX: line.x, lines: [line] });
    }
    return groups;
  }
  async function translateLines(pages, sourceLanguage, targetLanguage, onProgress = () => {}, translationOptions = {}) {
    const blocks = pages.flatMap((page, pageIndex) => groupParagraphLines(page.lines).map((group, blockIndex) => ({ ...group, pageIndex, blockIndex })));
    const texts = blocks.map(block => block.lines.map(line => line.edited ?? line.text).join(' ').replace(/\s+/g, ' ').trim());
    const translations = await translateTextBlocks(texts, sourceLanguage, targetLanguage, onProgress, translationOptions);
    blocks.forEach((block, index) => { const translated = translations[index], id = `${block.pageIndex}:${block.blockIndex}`; for (const line of block.lines) { line.edited = translated; line.translationBlockId = id; line.translationText = translated; } });
    return pages;
  }

  function samplePageBackground(ctx, x, y, width, height) {
    const canvas = ctx.canvas, right = x + width, bottom = y + height;
    const points = [
      [x - 2, y - 1], [x - 2, bottom + 1], [right + 2, y - 1], [right + 2, bottom + 1],
      [x + width * .5, y - 1], [x + width * .5, bottom + 1]
    ];
    const samples = points.filter(([px, py]) => px >= 0 && py >= 0 && px < canvas.width && py < canvas.height)
      .map(([px, py]) => [...ctx.getImageData(Math.round(px), Math.round(py), 1, 1).data].slice(0, 3));
    if (!samples.length) return 'rgb(255, 255, 255)';
    const median = channel => samples.map(sample => sample[channel]).sort((a, b) => a - b)[Math.floor(samples.length / 2)];
    return `rgb(${median(0)}, ${median(1)}, ${median(2)})`;
  }

  function wrapBlockText(ctx, value, width, language) {
    const text = value.trim();
    if (!text) return [];
    const hasSpaces = /\s/.test(text);
    let tokens;
    if (hasSpaces) tokens = text.split(/\s+/);
    else if (typeof Intl.Segmenter === 'function') tokens = [...new Intl.Segmenter(language, { granularity: 'word' }).segment(text)].map(part => part.segment).filter(Boolean);
    else tokens = Array.from(text);
    const separator = hasSpaces ? ' ' : '';
    const result = []; let line = '';
    for (const token of tokens) {
      const candidate = line ? `${line}${separator}${token}` : token;
      if (line && ctx.measureText(candidate).width > width) { result.push(line); line = ''; }
      if (!line && ctx.measureText(token).width > width) {
        let piece = '';
        for (const character of Array.from(token)) {
          if (piece && ctx.measureText(piece + character).width > width) { result.push(piece); piece = ''; }
          piece += character;
        }
        line = piece;
      } else line = line ? `${line}${separator}${token}` : token;
    }
    if (line) result.push(line);
    return result;
  }

  function drawTranslatedBlock(ctx, lines, value, viewport, language) {
    const left = Math.min(...lines.map(line => line.x)), right = Math.max(...lines.map(line => line.x + line.width));
    const bottom = Math.min(...lines.map(line => line.y - line.height * .22)), top = Math.max(...lines.map(line => line.y + line.height * .9));
    const corners = [[left, bottom], [left, top], [right, bottom], [right, top]].map(([x, y]) => viewport.convertToViewportPoint(x, y));
    const x = Math.max(0, Math.min(...corners.map(point => point[0]))), y = Math.max(0, Math.min(...corners.map(point => point[1])));
    const width = Math.min(ctx.canvas.width - x, Math.max(...corners.map(point => point[0])) - x), height = Math.min(ctx.canvas.height - y, Math.max(...corners.map(point => point[1])) - y);
    if (width < 2 || height < 2) return true;
    const pad = Math.max(1, Math.min(3, height * .04)), coverX = Math.max(0, x - pad), coverY = Math.max(0, y - pad);
    const coverRight = Math.min(ctx.canvas.width, x + width + pad), coverBottom = Math.min(ctx.canvas.height, y + height + pad);
    const background = samplePageBackground(ctx, coverX, coverY, coverRight - coverX, coverBottom - coverY);
    ctx.fillStyle = background; ctx.fillRect(coverX, coverY, coverRight - coverX, coverBottom - coverY);
    const baseSize = Math.max(6, lines.reduce((sum, line) => sum + line.size, 0) / lines.length * viewport.scale * .92);
    let fontSize = baseSize, wrapped = [], lineHeight = fontSize * 1.16;
    while (fontSize >= 6) {
      ctx.font = `${fontSize}px Arial, sans-serif`;
      wrapped = wrapBlockText(ctx, value, width, language);
      lineHeight = fontSize * 1.16;
      if (wrapped.length * lineHeight <= height + .5) break;
      fontSize -= .5;
    }
    const overflow = wrapped.length * lineHeight > height + .5;
    ctx.font = `${fontSize}px Arial, sans-serif`; ctx.fillStyle = '#171717'; ctx.textBaseline = 'top';
    const rtl = /^(ar|he)(?:-|$)/i.test(language), previousDirection = ctx.direction, previousAlign = ctx.textAlign;
    ctx.direction = rtl ? 'rtl' : 'ltr'; ctx.textAlign = rtl ? 'right' : 'left';
    wrapped.forEach((text, index) => ctx.fillText(text, rtl ? x + width : x, y + index * lineHeight, width));
    ctx.direction = previousDirection; ctx.textAlign = previousAlign;
    return overflow;
  }

  const searchableFontFaces = new Map(), searchableFontFamily = window.TransformoSearchableFont.searchableFontFamily;

  function fontCoversCodePoint(face, codePoint) {
    return face.ranges.some(([start, end]) => codePoint >= start && codePoint <= end);
  }

  async function getSearchableFontFaces(language, text) {
    const family = searchableFontFamily(language, text);
    if (!searchableFontFaces.has(family)) searchableFontFaces.set(family, (async () => {
      const query = new URLSearchParams({ family: `${family}:wght@400`, display: 'swap' });
      const response = await fetch(`https://fonts.googleapis.com/css2?${query}`);
      if (!response.ok) throw new Error('The Unicode font service is unavailable.');
      const css = await response.text(), faces = [];
      for (const match of css.matchAll(/@font-face\s*\{([^}]+)\}/g)) {
        const body = match[1], src = body.match(/src:\s*url\(([^)]+)\)\s*format\(['"]woff2['"]\)/i), ranges = body.match(/unicode-range:\s*([^;]+);/i);
        if (!src || !ranges) continue;
        const codeRanges = [...ranges[1].matchAll(/U\+([\da-f?]+)(?:-([\da-f?]+))?/gi)].map(([, first, last]) => {
          const start = parseInt(first.replace(/\?/g, '0'), 16), end = parseInt((last || first).replace(/\?/g, 'f'), 16);
          return [start, end];
        });
        faces.push({ url: src[1].replace(/["']/g, ''), ranges: codeRanges });
      }
      if (!faces.length) throw new Error('No embeddable Unicode font subsets were returned.');
      return faces;
    })());
    return searchableFontFaces.get(family);
  }

  async function drawSearchableText(page, pdf, fontkit, text, language, x, y, size, maxWidth, embeddedFonts) {
    if (!text?.trim()) return { embedded: 0, skipped: 0 };
    let faces;
    try { faces = await getSearchableFontFaces(language, text); }
    catch { return { embedded: 0, skipped: [...text].length }; }
    const runs = [];
    let current = null;
    for (const character of text) {
      const codePoint = character.codePointAt(0), face = faces.find(candidate => fontCoversCodePoint(candidate, codePoint));
      if (!face) { current = null; continue; }
      if (!current || current.face.url !== face.url) { current = { face, text: '' }; runs.push(current); }
      current.text += character;
    }
    let cursorX = x, embedded = 0, skipped = 0;
    for (const run of runs) {
      try {
        if (!embeddedFonts.has(run.face.url)) {
          if (!fontkit?.create) throw new Error('Fontkit is unavailable.');
          pdf.registerFontkit(fontkit);
          const response = await fetch(run.face.url);
          if (!response.ok) throw new Error('Could not download a font subset.');
          embeddedFonts.set(run.face.url, await pdf.embedFont(await response.arrayBuffer(), { subset: true }));
        }
        const font = embeddedFonts.get(run.face.url), runWidth = font.widthOfTextAtSize(run.text, size);
        page.drawText(run.text, { x: cursorX, y, size, font, color: rgb(0, 0, 0), opacity: 0, maxWidth: Math.max(size, Math.min(maxWidth, runWidth + size)) });
        cursorX += runWidth; embedded += [...run.text].length;
      } catch { skipped += [...run.text].length; }
    }
    return { embedded, skipped: [...text].length - embedded };
  }

  async function exportPositionedPdf(file, pages, onProgress = () => {}, returnBlob = false, language = 'en') {
    requireLibraries('PDFLib');
    if (!pdfjs) throw new Error('The PDF renderer did not load.');
    const source = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise, output = await PDFDocument.create();
    let overflowLines = 0, searchableCharacters = 0, skippedSearchableCharacters = 0;
    const overflowDetails = [];
    const embeddedFonts = new Map(), fontkit = window.fontkit;
    for (let index = 0; index < source.numPages; index++) {
      const page = await source.getPage(index + 1), viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d', { alpha: false }); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      const lines = pages[index]?.lines || [];
      const renderedBlocks = new Set();
      for (const line of lines) {
        if (line.translationBlockId) {
          if (renderedBlocks.has(line.translationBlockId)) continue;
          renderedBlocks.add(line.translationBlockId);
          const blockLines = lines.filter(candidate => candidate.translationBlockId === line.translationBlockId);
          const translatedText = line.translationText || line.edited || line.text;
          if (drawTranslatedBlock(ctx, blockLines, translatedText, viewport, language)) {
            overflowLines++;
            overflowDetails.push({ page: index + 1, text: String(translatedText).replace(/\s+/g, ' ').trim().slice(0, 120) });
          }
          continue;
        }
        const value = (line.edited ?? line.text).trim(); if (!value) continue;
        const [left, baseline] = viewport.convertToViewportPoint(line.x, line.y);
        const width = Math.max(6, line.width * viewport.scale), height = Math.max(7, line.height * viewport.scale);
        const x = left, y = baseline - height * .92, pad = Math.max(1, height * .06);
        const coverX = Math.max(0, x - pad), coverY = Math.max(0, y - pad);
        const coverRight = Math.min(canvas.width, x + width + pad), coverBottom = Math.min(canvas.height, y + height * 1.12 + pad);
        const background = samplePageBackground(ctx, coverX, coverY, coverRight - coverX, coverBottom - coverY);
        ctx.fillStyle = background; ctx.fillRect(coverX, coverY, coverRight - coverX, coverBottom - coverY);
        let fontSize = Math.max(8, line.size * viewport.scale * .92); ctx.font = `${fontSize}px Arial, sans-serif`;
        while (ctx.measureText(value).width > width && fontSize > 6) { fontSize -= .5; ctx.font = `${fontSize}px Arial, sans-serif`; }
        if (ctx.measureText(value).width > width) overflowLines++;
        ctx.fillStyle = '#171717'; ctx.textBaseline = 'alphabetic'; ctx.fillText(value, x, baseline, width);
      }
      const image = await output.embedPng(await (await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))).arrayBuffer());
      const newPage = output.addPage([viewport.width / viewport.scale, viewport.height / viewport.scale]);
      newPage.drawImage(image, { x: 0, y: 0, width: newPage.getWidth(), height: newPage.getHeight() });
      const searchableBlocks = new Set();
      for (const line of lines) {
        if (line.translationBlockId && searchableBlocks.has(line.translationBlockId)) continue;
        if (line.translationBlockId) searchableBlocks.add(line.translationBlockId);
        const blockLines = line.translationBlockId ? lines.filter(candidate => candidate.translationBlockId === line.translationBlockId) : [line];
        const value = line.translationBlockId ? line.translationText || line.edited || line.text : (line.edited ?? line.text).trim();
        if (!value) continue;
        const points = blockLines.flatMap(candidate => [[candidate.x, candidate.y], [candidate.x + candidate.width, candidate.y - candidate.height]]).map(point => viewport.convertToViewportPoint(...point));
        const x = Math.max(0, Math.min(...points.map(point => point[0])) / viewport.scale), top = Math.max(0, Math.min(...points.map(point => point[1])) / viewport.scale);
        const width = Math.max(8, (Math.max(...points.map(point => point[0])) - Math.min(...points.map(point => point[0]))) / viewport.scale);
        const y = newPage.getHeight() - top - Math.max(4, line.size * .18), fontSize = Math.max(4, Math.min(72, line.size * .78));
        const indexed = await drawSearchableText(newPage, output, fontkit, value, language, x, y, fontSize, width, embeddedFonts);
        searchableCharacters += indexed.embedded; skippedSearchableCharacters += indexed.skipped;
      }
      onProgress(index + 1, source.numPages);
    }
    const blob = bytesToBlob(await output.save());
    if (returnBlob) return { blob, overflowLines, overflowDetails, searchableCharacters, skippedSearchableCharacters, filename: `${safeBase(file.name)}-translated.pdf` };
    download(blob, `${safeBase(file.name)}-transformed.pdf`);
    return overflowLines;
  }

  window.DocumentEngine = { mergePdfs, watermarkPdf, numberPdf, compressPdf, splitPdf, organizePdf, imagesToPdf, textToPdf, docxToText, renderDocxPreview, docxToPdf, docxToImages, createDocxEditOverlay, clearDocxEdit, setDocxEditMode, resetDocxEdit, undoDocxEdit: container => container?.__transformoUndoDocxEdit?.() || false, redoDocxEdit: container => container?.__transformoRedoDocxEdit?.() || false, exportDocxEditedPdf, exportDocxEditedDocx, translateDocxInPlace, applyDocxTranslationTexts, captureDocxTranslationTexts, clearDocxTranslation, setDocxTranslationMode, exportDocxTranslatedPdf, exportDocxTranslatedDocx, pptxToText, xlsxToCsv, pdfsToImages, pdfsToText, pdfsToDocx, inspectPdf, renderPdfPages, ocrPdf, supportsTranslation, translateTextBlocks, translateLines, exportPositionedPdf, download };
})();
