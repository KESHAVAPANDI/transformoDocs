(function (root) {
  function fadeAlpha(mode, clipIndex, clipCount, elapsed, duration, fadeDuration = 0.4) {
    if (mode !== 'fade' || clipCount < 2 || !(duration > 0) || !(fadeDuration > 0)) return 0;
    const edge = Math.min(fadeDuration, duration / 2), time = Math.max(0, Math.min(duration, elapsed));
    let alpha = 0;
    if (clipIndex > 0) alpha = Math.max(alpha, 1 - time / edge);
    if (clipIndex < clipCount - 1) alpha = Math.max(alpha, (time - (duration - edge)) / edge);
    return Math.max(0, Math.min(1, alpha));
  }

  root.TransformoVideoTransition = { fadeAlpha };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.TransformoVideoTransition;
})(globalThis);
