(function (root) {
  const languageFamilies = {
    ja: 'Noto Sans JP', zh: 'Noto Sans SC', 'zh-Hant': 'Noto Sans TC', ko: 'Noto Sans KR',
    hi: 'Noto Sans Devanagari', mr: 'Noto Sans Devanagari', bn: 'Noto Sans Bengali',
    ta: 'Noto Sans Tamil', te: 'Noto Sans Telugu', kn: 'Noto Sans Kannada',
    ar: 'Noto Sans Arabic', he: 'Noto Sans Hebrew', th: 'Noto Sans Thai'
  };

  function searchableFontFamily(language, text) {
    const value = String(text || '');
    if (/[\u0600-\u08ff\ufb50-\ufdff\ufe70-\ufeff]/u.test(value)) return 'Noto Sans Arabic';
    if (/[\u0590-\u05ff]/u.test(value)) return 'Noto Sans Hebrew';
    if (/[\u0900-\u097f]/u.test(value)) return 'Noto Sans Devanagari';
    if (/[\u0980-\u09ff]/u.test(value)) return 'Noto Sans Bengali';
    if (/[\u0b80-\u0bff]/u.test(value)) return 'Noto Sans Tamil';
    if (/[\u0c00-\u0c7f]/u.test(value)) return 'Noto Sans Telugu';
    if (/[\u0c80-\u0cff]/u.test(value)) return 'Noto Sans Kannada';
    if (/[\u0e00-\u0e7f]/u.test(value)) return 'Noto Sans Thai';
    if (/[\u3040-\u30ff\u3400-\u9fff]/u.test(value)) return languageFamilies[language] && /Noto Sans (?:JP|SC|TC|KR)/.test(languageFamilies[language]) ? languageFamilies[language] : 'Noto Sans JP';
    return languageFamilies[language] || 'Noto Sans';
  }

  root.TransformoSearchableFont = { searchableFontFamily };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.TransformoSearchableFont;
})(globalThis);
