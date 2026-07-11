import { expect, test } from "vitest";
import { shallow } from "../shallow";

// ─── Reference & primitives ─────────────────────────────────────────────────

test("shallow: same reference is equal", () => {
  const obj = { a: 1 };
  expect(shallow(obj, obj)).toBe(true);
});

test("shallow: equal primitives are equal", () => {
  expect(shallow(1, 1)).toBe(true);
  expect(shallow("x", "x")).toBe(true);
  expect(shallow(true, true)).toBe(true);
});

test("shallow: different primitives are not equal", () => {
  expect(shallow(1, 2)).toBe(false);
  expect(shallow("x", "y")).toBe(false);
});

test("shallow: a primitive and an object are not equal", () => {
  expect(shallow(1 as unknown as object, { a: 1 })).toBe(false);
  expect(shallow(null as unknown as object, { a: 1 })).toBe(false);
  expect(shallow({ a: 1 }, null as unknown as object)).toBe(false);
});

// ─── Plain objects ──────────────────────────────────────────────────────────

// Migrated from react.test.tsx `useShallow > shallow-equal projection returns same ref`:
// a fresh object with identical entries is shallow-equal.
test("shallow: distinct objects with identical entries are equal", () => {
  expect(shallow({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
});

// Migrated from react.test.tsx `useShallow > changed value returns new ref`:
// a changed field breaks equality.
test("shallow: a changed value is not equal", () => {
  expect(shallow({ a: 1, b: 2 }, { a: 99, b: 2 })).toBe(false);
});

test("shallow: differing key sets are not equal", () => {
  expect(shallow({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  expect(shallow({ a: 1, b: 2 }, { a: 1 })).toBe(false);
  expect(shallow({ a: 1 }, { b: 1 })).toBe(false);
});

test("shallow: only compares one level deep", () => {
  const inner = { n: 1 };
  // same nested reference → equal
  expect(shallow({ inner }, { inner })).toBe(true);
  // structurally-equal but distinct nested reference → not equal
  expect(shallow({ inner: { n: 1 } }, { inner: { n: 1 } })).toBe(false);
});

test("shallow: differing prototypes are not equal", () => {
  const plain = { a: 1 };
  const noProto = Object.assign(Object.create(null), { a: 1 });
  expect(shallow(plain, noProto)).toBe(false);
});

// ─── Arrays ─────────────────────────────────────────────────────────────────

test("shallow: arrays with identical entries are equal", () => {
  expect(shallow([1, 2, 3], [1, 2, 3])).toBe(true);
});

test("shallow: arrays with a differing entry are not equal", () => {
  expect(shallow([1, 2, 3], [1, 9, 3])).toBe(false);
});

test("shallow: arrays of differing length are not equal", () => {
  expect(shallow([1, 2], [1, 2, 3])).toBe(false);
  expect(shallow([1, 2, 3], [1, 2])).toBe(false);
});

// ─── Map ────────────────────────────────────────────────────────────────────

test("shallow: Maps with identical entries are equal", () => {
  const a = new Map([["x", 1], ["y", 2]]);
  const b = new Map([["x", 1], ["y", 2]]);
  expect(shallow(a, b)).toBe(true);
});

test("shallow: Maps with a differing value are not equal", () => {
  const a = new Map([["x", 1]]);
  const b = new Map([["x", 2]]);
  expect(shallow(a, b)).toBe(false);
});

test("shallow: Maps with differing size are not equal", () => {
  const a = new Map([["x", 1]]);
  const b = new Map([["x", 1], ["y", 2]]);
  expect(shallow(a, b)).toBe(false);
});

// ─── Set ────────────────────────────────────────────────────────────────────

test("shallow: Sets with identical members are equal", () => {
  expect(shallow(new Set([1, 2, 3]), new Set([1, 2, 3]))).toBe(true);
});

test("shallow: Sets with differing members are not equal", () => {
  expect(shallow(new Set([1, 2, 3]), new Set([1, 2, 4]))).toBe(false);
});

test("shallow: Sets of differing size are not equal", () => {
  expect(shallow(new Set([1, 2]), new Set([1, 2, 3]))).toBe(false);
});
