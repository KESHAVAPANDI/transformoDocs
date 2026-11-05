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
  async function translateLines(pages, sourceLanguage, targetLanguage, onProgress = () => {}) {
    if (!supportsTranslation()) throw new Error('This browser does not provide its built-in Translator API. You can still edit the extracted text manually, or open Transformo in a browser that supports on-device translation.');
    const availability = await Translator.availability({ sourceLanguage, targetLanguage });
    if (availability === 'unavailable') throw new Error(`The browser has no translation model for ${sourceLanguage} → ${targetLanguage}.`);
    const translator = await Translator.create({ sourceLanguage, targetLanguage });
    const blocks = pages.flatMap((page, pageIndex) => groupParagraphLines(page.lines).map((group, blockIndex) => ({ ...group, pageIndex, blockIndex })));
    let done = 0; const total = blocks.length;
    try {
      for (const block of blocks) {
        const text = block.lines.map(line => line.text).join(' ').replace(/\s+/g, ' ').trim();
        const translated = await translator.translate(text), id = `${block.pageIndex}:${block.blockIndex}`;
        for (const line of block.lines) { line.edited = translated; line.translationBlockId = id; line.translationText = translated; }
        onProgress(++done, total);
      }
    } finally { translator.destroy?.(); }
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

  async function exportPositionedPdf(file, pages, onProgress = () => {}, returnBlob = false, language = 'en') {
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
      const renderedBlocks = new Set();
      for (const line of lines) {
        if (line.translationBlockId) {
          if (renderedBlocks.has(line.translationBlockId)) continue;
          renderedBlocks.add(line.translationBlockId);
          const blockLines = lines.filter(candidate => candidate.translationBlockId === line.translationBlockId);
          if (drawTranslatedBlock(ctx, blockLines, line.translationText || line.edited || line.text, viewport, language)) overflowLines++;
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
      onProgress(index + 1, source.numPages);
    }
    const blob = bytesToBlob(await output.save());
    if (returnBlob) return { blob, overflowLines, filename: `${safeBase(file.name)}-translated.pdf` };
    download(blob, `${safeBase(file.name)}-transformed.pdf`);
    return overflowLines;
  }

  window.DocumentEngine = { mergePdfs, watermarkPdf, numberPdf, compressPdf, splitPdf, organizePdf, imagesToPdf, textToPdf, docxToText, pdfsToImages, pdfsToText, inspectPdf, renderPdfPages, ocrPdf, supportsTranslation, translateLines, exportPositionedPdf, download };
})();
