// Deterministic pseudo-random numbers so a failing property test is reproducible.
export function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// `count` random whole-cent amounts in [0, maxCents].
export const randomCents = (rnd, count, maxCents) =>
  Array.from({ length: count }, () => Math.floor(rnd() * (maxCents + 1)));

// Splits `totalCents` into `parts` non-negative whole-cent pieces.
export function splitCents(rnd, totalCents, parts) {
  const out = [];
  let remaining = totalCents;
  for (let i = 0; i < parts - 1; i++) {
    const piece = Math.floor(rnd() * (remaining + 1));
    out.push(piece);
    remaining -= piece;
  }
  out.push(remaining);
  return out;
}

// An in-memory stand-in for window.storage, behaving like the real one in storage.js:
// get -> null when missing; set -> null (not a throw) when it fails.
//   quotaBytes: writes that would push total size past this fail (simulates a full disk)
//   readThrows: get() throws (simulates storage being unavailable)
export function fakeStorage({ quotaBytes = Infinity, readThrows = false } = {}) {
  const data = new Map();
  const size = () => [...data].reduce((n, [k, v]) => n + k.length + v.length, 0);
  return {
    data,
    async get(key) {
      if (readThrows) throw new Error("storage unavailable");
      return data.has(key) ? { key, value: data.get(key), shared: false } : null;
    },
    async set(key, value) {
      const replaced = data.has(key) ? key.length + data.get(key).length : 0;
      if (size() - replaced + key.length + value.length > quotaBytes) return null;
      data.set(key, value);
      return { key, value, shared: false };
    },
    async delete(key) { data.delete(key); return { key, deleted: true, shared: false }; },
    async list(prefix = "") { return { keys: [...data.keys()].filter((k) => k.startsWith(prefix)), prefix, shared: false }; },
  };
}
