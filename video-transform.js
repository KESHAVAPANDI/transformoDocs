(function (root) {
  const aspects = {
    landscape: { width: 1280, height: 720, label: '16:9' },
    square: { width: 960, height: 960, label: '1:1' },
    portrait: { width: 720, height: 1280, label: '9:16' }
  };

  function getAspect(mode) { return aspects[mode] || aspects.landscape; }
  function canvasSize(mode) { const { width, height } = getAspect(mode); return { width, height }; }
  function frameRect(sourceWidth, sourceHeight, frameWidth, frameHeight, fit = 'fit') {
    if (![sourceWidth, sourceHeight, frameWidth, frameHeight].every(value => Number.isFinite(value) && value > 0)) return null;
    const scale = (fit === 'fill' ? Math.max : Math.min)(frameWidth / sourceWidth, frameHeight / sourceHeight);
    const width = sourceWidth * scale, height = sourceHeight * scale;
    return { x: (frameWidth - width) / 2, y: (frameHeight - height) / 2, width, height };
  }

  root.TransformoVideoTransform = { getAspect, canvasSize, frameRect };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.TransformoVideoTransform;
})(globalThis);
