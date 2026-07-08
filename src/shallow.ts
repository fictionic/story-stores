// written by claude based on the shallow checker in zustand

const isIterable = (obj: object): obj is Iterable<unknown> => Symbol.iterator in obj;

const hasIterableEntries = (
  value: Iterable<unknown>,
): value is Iterable<unknown> & { entries(): Iterable<[unknown, unknown]> } =>
  'entries' in value;

const compareEntries = (
  a: { entries(): Iterable<[unknown, unknown]> },
  b: { entries(): Iterable<[unknown, unknown]> },
): boolean => {
  const mapA = a instanceof Map ? a : new Map(a.entries());
  const mapB = b instanceof Map ? b : new Map(b.entries());
  if (mapA.size !== mapB.size) return false;
  for (const [key, value] of mapA) {
    if (!mapB.has(key) || !Object.is(value, mapB.get(key))) return false;
  }
  return true;
};

// Ordered iterables (Set, arrays, generators, etc.)
const compareIterables = (a: Iterable<unknown>, b: Iterable<unknown>): boolean => {
  const itA = a[Symbol.iterator]();
  const itB = b[Symbol.iterator]();
  let nextA = itA.next();
  let nextB = itB.next();
  while (!nextA.done && !nextB.done) {
    if (!Object.is(nextA.value, nextB.value)) return false;
    nextA = itA.next();
    nextB = itB.next();
  }
  return !!nextA.done && !!nextB.done;
};

export function shallow<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
    return false;
  }
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
  if (isIterable(a) && isIterable(b)) {
    if (hasIterableEntries(a) && hasIterableEntries(b)) {
      return compareEntries(a, b);
    }
    return compareIterables(a, b);
  }
  // plain objects
  return compareEntries(
    { entries: () => Object.entries(a) },
    { entries: () => Object.entries(b) },
  );
}
