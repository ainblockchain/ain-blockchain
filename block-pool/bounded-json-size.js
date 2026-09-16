function boundedJsonSize(value, limit) {
  if (!Number.isSafeInteger(limit) || limit < 0) throw new Error('invalid JSON byte limit');
  const ancestors = new Set();
  const exceeded = Symbol('JSON byte limit exceeded');
  let bytes = 0;
  const add = (amount) => {
    bytes += amount;
    if (bytes > limit) throw exceeded;
  };
  const string = (entry) => {
    if (Buffer.byteLength(entry) + 2 > limit - bytes) throw exceeded;
    add(Buffer.byteLength(JSON.stringify(entry)));
  };
  const visit = (entry, depth) => {
    if (depth > 256) throw exceeded;
    if (entry === null) return add(4);
    if (typeof entry === 'string') return string(entry);
    if (typeof entry === 'boolean') return add(entry ? 4 : 5);
    if (typeof entry === 'number') return add(JSON.stringify(entry).length);
    if (typeof entry !== 'object' || typeof entry.toJSON === 'function' || ancestors.has(entry)) {
      throw exceeded;
    }
    ancestors.add(entry);
    add(2);
    let count = 0;
    if (Array.isArray(entry)) {
      for (const child of entry) {
        if (count++) add(1);
        if (['undefined', 'function', 'symbol'].includes(typeof child)) add(4);
        else visit(child, depth + 1);
      }
    } else {
      for (const key of Object.keys(entry)) {
        const child = entry[key];
        if (['undefined', 'function', 'symbol'].includes(typeof child)) continue;
        if (count++) add(1);
        string(key);
        add(1);
        visit(child, depth + 1);
      }
    }
    ancestors.delete(entry);
  };
  try {
    visit(value, 0);
    return bytes;
  } catch (error) {
    if (error === exceeded) return null;
    throw error;
  }
}

module.exports = boundedJsonSize;
