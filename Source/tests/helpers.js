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
