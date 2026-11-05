(function (root) {
  const styles = {
    classic: { id: 'classic', background: 'rgba(12,13,18,.72)', color: '#ffffff', outline: null, shadow: 'rgba(0,0,0,.38)' },
    glass: { id: 'glass', background: 'rgba(23,25,37,.58)', color: '#f9f7ff', outline: null, shadow: 'rgba(0,0,0,.42)' },
    outline: { id: 'outline', background: null, color: '#ffffff', outline: 'rgba(9,10,14,.96)', shadow: 'rgba(0,0,0,.28)' }
  };

  function getVideoCaptionStyle(id) {
    const style = styles[id] || styles.classic;
    return { ...style };
  }

  root.TransformoVideoCaptionStyle = { getVideoCaptionStyle };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.TransformoVideoCaptionStyle;
})(globalThis);
