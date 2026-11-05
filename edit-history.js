(function (root) {
  function createEditHistory(initialState, limit = 40) {
    const maxEntries = Math.max(1, limit);
    let snapshots = [initialState.slice()], index = 0;
    const same = (left, right) => left.length === right.length && left.every((value, position) => value === right[position]);
    const record = state => {
      if (same(snapshots[index], state)) return false;
      snapshots = snapshots.slice(0, index + 1);
      snapshots.push(state.slice());
      if (snapshots.length > maxEntries) snapshots.shift();
      index = snapshots.length - 1;
      return true;
    };
    return {
      get canUndo() { return index > 0; },
      get canRedo() { return index < snapshots.length - 1; },
      get current() { return snapshots[index].slice(); },
      record,
      undo(state) {
        record(state);
        if (index === 0) return null;
        return snapshots[--index].slice();
      },
      redo(state) {
        record(state);
        if (index >= snapshots.length - 1) return null;
        return snapshots[++index].slice();
      }
    };
  }

  root.TransformoEditHistory = { createEditHistory };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.TransformoEditHistory;
})(globalThis);
