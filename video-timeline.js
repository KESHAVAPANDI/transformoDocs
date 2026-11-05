(function (root) {
  function locatePosition(clips, position) {
    if (!clips?.length) return null;
    const duration = clips.reduce((sum, clip) => sum + Math.max(0, clip.end - clip.start), 0);
    const target = Math.max(0, Math.min(Number(position) || 0, duration));
    let offset = 0;
    for (let index = 0; index < clips.length; index++) {
      const clip = clips[index], length = Math.max(0, clip.end - clip.start), end = offset + length;
      if (target < end || index === clips.length - 1) return { index, offset, duration: length, time: clip.start + Math.max(0, Math.min(length, target - offset)), position: target };
      offset = end;
    }
    return null;
  }

  function positionAt(clips, index, sourceTime) {
    const clip = clips?.[index]; if (!clip) return 0;
    const offset = clips.slice(0, index).reduce((sum, item) => sum + Math.max(0, item.end - item.start), 0);
    return offset + Math.max(0, Math.min(clip.end - clip.start, sourceTime - clip.start));
  }

  root.TransformoVideoTimeline = { locatePosition, positionAt };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.TransformoVideoTimeline;
})(globalThis);
