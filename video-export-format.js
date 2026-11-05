(function (root) {
  const formats = [
    { mimeType: 'video/mp4;codecs="avc1.42E01E,mp4a.40.2"', extension: 'mp4' },
    { mimeType: 'video/mp4', extension: 'mp4' },
    { mimeType: 'video/webm;codecs=vp9,opus', extension: 'webm' },
    { mimeType: 'video/webm;codecs=vp8,opus', extension: 'webm' },
    { mimeType: 'video/webm', extension: 'webm' }
  ];

  function selectVideoExportFormat(isTypeSupported) {
    const supported = typeof isTypeSupported === 'function' ? isTypeSupported : () => false;
    return formats.find(format => supported(format.mimeType)) || null;
  }

  root.TransformoVideoExportFormat = { selectVideoExportFormat };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.TransformoVideoExportFormat;
})(globalThis);
