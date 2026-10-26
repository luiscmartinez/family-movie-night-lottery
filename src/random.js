// Unbiased, cryptographically secure random integer in [0, n).
//
// Uses rejection sampling over 32-bit values from crypto.getRandomValues so
// that every outcome has exactly the same number of accepted inputs. A plain
// `value % n` would slightly favour the low indices.

const RANGE = 2 ** 32;

export function acceptanceLimit(n) {
  return RANGE - (RANGE % n);
}

export function secureRandomInt(n, getRandomValues = (a) => crypto.getRandomValues(a)) {
  if (!Number.isInteger(n) || n < 1 || n > RANGE) {
    throw new RangeError(`n must be an integer between 1 and 2^32 (got ${n})`);
  }
  const limit = acceptanceLimit(n);
  const buf = new Uint32Array(1);
  for (;;) {
    getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % n;
  }
}
