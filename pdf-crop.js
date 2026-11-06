function millimetersToPoints(value) {
  const millimeters = Number(value);
  if (!Number.isFinite(millimeters) || millimeters < 0) throw new Error('Crop margins must be finite, non-negative millimeter values.');
  return millimeters * 72 / 25.4;
}

function cropBoxForMargins(box, margins = {}, rotation = 0) {
  const angle = ((Number(rotation) % 360) + 360) % 360;
  if (![0, 90, 180, 270].includes(angle)) throw new Error('PDF page rotation must be a 90 degree step.');
  const visual = Object.fromEntries(['left', 'right', 'top', 'bottom'].map(side => {
    const value = Number(margins[side] ?? 0);
    if (!Number.isFinite(value) || value < 0) throw new Error('Crop margins must be finite, non-negative millimeter values.');
    return [side, value];
  }));
  const map = angle === 90 ? { left: 'bottom', right: 'top', top: 'right', bottom: 'left' }
    : angle === 180 ? { left: 'right', right: 'left', top: 'bottom', bottom: 'top' }
      : angle === 270 ? { left: 'top', right: 'bottom', top: 'left', bottom: 'right' }
        : { left: 'left', right: 'right', top: 'top', bottom: 'bottom' };
  const marginsPt = Object.fromEntries(Object.entries(map).map(([side, source]) => [side, visual[source]]));
  const width = box.width - marginsPt.left - marginsPt.right;
  const height = box.height - marginsPt.top - marginsPt.bottom;
  if (width <= 0 || height <= 0) throw new Error('Crop margins consume the entire page. Reduce the margins and try again.');
  return { x: box.x + marginsPt.left, y: box.y + marginsPt.bottom, width, height };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { millimetersToPoints, cropBoxForMargins };
if (typeof window !== 'undefined') window.TransformoPdfCrop = { millimetersToPoints, cropBoxForMargins };
