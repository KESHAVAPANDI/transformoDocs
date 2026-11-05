(function (root) {
  function matchDocxParagraphs(paragraphTexts, sourceTexts) {
    const used = new Set(); let cursor = 0;
    return sourceTexts.map(source => {
      let index = paragraphTexts.findIndex((text, candidate) => candidate >= cursor && !used.has(candidate) && text === source);
      if (index < 0) index = paragraphTexts.findIndex((text, candidate) => !used.has(candidate) && text === source);
      if (index < 0) return -1;
      used.add(index); cursor = Math.max(cursor, index + 1);
      return index;
    });
  }

  root.TransformoDocxTextMapping = { matchDocxParagraphs };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.TransformoDocxTextMapping;
})(globalThis);
