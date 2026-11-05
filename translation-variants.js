(function (root) {
  function createTranslationVariants(limit = 3) {
    const maxEntries = Math.max(1, Math.floor(limit));
    let entries = [], nextId = 1, currentId = null;
    return {
      get items() { return entries.slice(); },
      get current() { return entries.find(entry => entry.id === currentId) || null; },
      add(variant) {
        const entry = { ...variant, id: String(nextId++) };
        entries = [entry, ...entries.filter(item => item.source !== entry.source || item.target !== entry.target)].slice(0, maxEntries);
        currentId = entry.id;
        return entry;
      },
      select(id) {
        const entry = entries.find(item => item.id === id) || null;
        if (entry) currentId = entry.id;
        return entry;
      },
      clear() { entries = []; currentId = null; }
    };
  }

  root.TransformoTranslationVariants = { createTranslationVariants };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.TransformoTranslationVariants;
})(globalThis);
