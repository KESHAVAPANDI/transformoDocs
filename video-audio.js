(function (root) {
  function normalizeVolume(value, fallback = 1) {
    const volume = Number(value);
    return Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : fallback;
  }

  function volumeFromPercent(value) { return normalizeVolume(Number(value) / 100); }
  function volumePercent(value) { return Math.round(normalizeVolume(value) * 100); }

  root.TransformoVideoAudio = { normalizeVolume, volumeFromPercent, volumePercent };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.TransformoVideoAudio;
})(globalThis);
