import { expect, test, vi } from "vitest";
import { createStoryStore, batch } from "../vanilla";
import { shallow } from "../shallow";

// ─── Basic store ────────────────────────────────────────────────────────────

test("createStore: returns initial state from init", () => {
  const store = createStoryStore(() => ({ count: 0 }));
  expect(store.select(s => s.count)).toBe(0);
});

test("select: reads current state via selector", () => {
  const store = createStoryStore(() => ({ x: 10, y: 20 }));
  expect(store.select(s => s.x + s.y)).toBe(30);
});

// ─── Update ─────────────────────────────────────────────────────────────────

test("update: mutates state via immer", () => {
  const store = createStoryStore(() => ({ count: 0 }));
  store.update(s => { s.count = 5; });
  expect(store.select(s => s.count)).toBe(5);
});

test("update: notifies subscribers", () => {
  const store = createStoryStore(() => ({ count: 0 }));
  const fn = vi.fn();
  store.subscribe(s => s.count, fn);

  store.update(s => { s.count = 1; });
  expect(fn).toHaveBeenCalledWith(1);
});

test("update: does not notify subscriber if selected value is unchanged", () => {
  const store = createStoryStore(() => ({ a: 1, b: 2 }));
  const fn = vi.fn();
  store.subscribe(s => s.a, fn);

  store.update(s => { s.b = 99; });
  expect(fn).not.toHaveBeenCalled();
});

// ─── Subscribe ──────────────────────────────────────────────────────────────

test("subscribe: unsubscribe stops notifications", () => {
  const store = createStoryStore(() => ({ count: 0 }));
  const fn = vi.fn();
  const unsub = store.subscribe(s => s.count, fn);

  store.update(s => { s.count = 1; });
  expect(fn).toHaveBeenCalledTimes(1);

  unsub();
  store.update(s => { s.count = 2; });
  expect(fn).toHaveBeenCalledTimes(1);
});

test("subscribe: multiple subscribers on different selectors", () => {
  const store = createStoryStore(() => ({ a: 0, b: 0 }));
  const fnA = vi.fn();
  const fnB = vi.fn();
  store.subscribe(s => s.a, fnA);
  store.subscribe(s => s.b, fnB);

  store.update(s => { s.a = 1; });
  expect(fnA).toHaveBeenCalledWith(1);
  expect(fnB).not.toHaveBeenCalled();
});

// ─── Init receives select and update ────────────────────────────────────────

test("init: can use update to define actions", () => {
  type State = { count: number; increment: () => void };
  const store = createStoryStore<State>(({ update }) => ({
    count: 0,
    increment: () => update(s => { s.count++; }),
  }));

  store.select(s => s.increment)();
  expect(store.select(s => s.count)).toBe(1);
});

test("init: can use select to read state in actions", () => {
  type State = { count: number; double: () => number };
  const store = createStoryStore<State>(({ select }) => ({
    count: 5,
    double: () => select(s => s.count) * 2,
  }));

  expect(store.select(s => s.double)()).toBe(10);
});

// ─── Listen ─────────────────────────────────────────────────────────────────

test("listen: child store receives initial value from parent after init", () => {
  const parent = createStoryStore(() => ({ value: 42 }));

  type Child = { derived: number };
  const child = createStoryStore<Child>(({ listen, update }) => {
    listen(parent, s => s.value, v => update(s => { s.derived = v; }));
    return { derived: 0 };
  });

  // deferred flush should have set derived to 42
  expect(child.select(s => s.derived)).toBe(42);
});

test("listen: child store reacts to parent updates", () => {
  const parent = createStoryStore(() => ({ value: 1 }));

  type Child = { doubled: number };
  const child = createStoryStore<Child>(({ listen, update }) => {
    listen(parent, s => s.value, v => update(s => { s.doubled = v * 2; }));
    return { doubled: 0 };
  });

  parent.update(s => { s.value = 5; });
  expect(child.select(s => s.doubled)).toBe(10);
});

test("listen: child listens to multiple parents", () => {
  const storeA = createStoryStore(() => ({ x: 10 }));
  const storeB = createStoryStore(() => ({ y: 20 }));

  type Child = { sum: number };
  const child = createStoryStore<Child>(({ listen, update }) => {
    listen(storeA, s => s.x, x => update(s => { s.sum = x + storeB.select(s => s.y); }));
    listen(storeB, s => s.y, y => update(s => { s.sum = storeA.select(s => s.x) + y; }));
    return { sum: 0 };
  });

  // after init flush, sum should be 30
  expect(child.select(s => s.sum)).toBe(30);

  storeA.update(s => { s.x = 100; });
  expect(child.select(s => s.sum)).toBe(120);
});

test("listen: cannot be called after init", () => {
  const parent = createStoryStore(() => ({ value: 1 }));

  // listen isn't exposed on Store, so this is implicitly tested by the
  // didInitRef guard — but we can verify the error via a store that
  // tries to capture and call listen later
  let capturedListen!: typeof parent.subscribe;
  createStoryStore(({ listen }) => {
    capturedListen = (sel: any, cons: any) => listen(parent, sel, cons);
    return {};
  });

  expect(() => capturedListen(s => s, () => {})).toThrow("cannot listen after init");
});

test("listen: unsubscribe works", () => {
  const parent = createStoryStore(() => ({ value: 1 }));
  const fn = vi.fn();

  let unsub!: () => void;
  createStoryStore(({ listen }) => {
    unsub = listen(parent, s => s.value, fn);
    return {};
  });

  fn.mockClear(); // clear the deferred flush call
  parent.update(s => { s.value = 2; });
  expect(fn).toHaveBeenCalledTimes(1);

  unsub();
  parent.update(s => { s.value = 3; });
  expect(fn).toHaveBeenCalledTimes(1);
});

// ─── Batch ──────────────────────────────────────────────────────────────────

test("batch: defers subscriber notifications until batch completes", () => {
  const store = createStoryStore(() => ({ count: 0 }));
  const fn = vi.fn();
  store.subscribe(s => s.count, fn);

  batch(() => {
    store.update(s => { s.count = 1; });
    store.update(s => { s.count = 2; });
    store.update(s => { s.count = 3; });
    expect(fn).not.toHaveBeenCalled();
  });

  expect(fn).toHaveBeenCalledTimes(1);
  expect(fn).toHaveBeenCalledWith(3);
});

test("batch: returns the callback's return value", () => {
  const result = batch(() => 42);
  expect(result).toBe(42);
});

test("batch: nested batches only flush at outermost level", () => {
  const store = createStoryStore(() => ({ count: 0 }));
  const fn = vi.fn();
  store.subscribe(s => s.count, fn);

  batch(() => {
    store.update(s => { s.count = 1; });
    batch(() => {
      store.update(s => { s.count = 2; });
    });
    // inner batch didn't flush
    expect(fn).not.toHaveBeenCalled();
  });

  expect(fn).toHaveBeenCalledTimes(1);
  expect(fn).toHaveBeenCalledWith(2);
});

test("batch: multiple stores only emit once each", () => {
  const storeA = createStoryStore(() => ({ a: 0 }));
  const storeB = createStoryStore(() => ({ b: 0 }));
  const fnA = vi.fn();
  const fnB = vi.fn();
  storeA.subscribe(s => s.a, fnA);
  storeB.subscribe(s => s.b, fnB);

  batch(() => {
    storeA.update(s => { s.a = 1; });
    storeA.update(s => { s.a = 2; });
    storeB.update(s => { s.b = 10; });
  });

  expect(fnA).toHaveBeenCalledTimes(1);
  expect(fnA).toHaveBeenCalledWith(2);
  expect(fnB).toHaveBeenCalledTimes(1);
  expect(fnB).toHaveBeenCalledWith(10);
});

// ─── Equals (shallow) ───────────────────────────────────────────────────────

test("subscribe: default Object.is fires when selector returns a new object each time", () => {
  // baseline: without a custom equals, two structurally-equal objects with
  // different references are considered different and the consumer fires.
  const store = createStoryStore(() => ({ a: 1, b: 2, c: 3 }));
  const fn = vi.fn();
  store.subscribe(s => ({ a: s.a, b: s.b }), fn);

  store.update(s => { s.c = 99; });
  expect(fn).toHaveBeenCalledTimes(1);
  expect(fn).toHaveBeenCalledWith({ a: 1, b: 2 });
});

test("subscribe: shallow suppresses notification when selected object is shallow-equal", () => {
  const store = createStoryStore(() => ({ a: 1, b: 2, c: 3 }));
  const fn = vi.fn();
  store.subscribe(s => ({ a: s.a, b: s.b }), fn, shallow);

  // c changes; the selected projection is shallow-equal across updates.
  store.update(s => { s.c = 99; });
  expect(fn).not.toHaveBeenCalled();
});

test("subscribe: shallow fires when one of the projected fields actually changes", () => {
  const store = createStoryStore(() => ({ a: 1, b: 2, c: 3 }));
  const fn = vi.fn();
  store.subscribe(s => ({ a: s.a, b: s.b }), fn, shallow);

  store.update(s => { s.b = 20; });
  expect(fn).toHaveBeenCalledTimes(1);
  expect(fn).toHaveBeenCalledWith({ a: 1, b: 20 });
});

test("subscribe: shallow handles array projections", () => {
  const store = createStoryStore(() => ({ items: [1, 2, 3], unrelated: 0 }));
  const fn = vi.fn();
  store.subscribe(s => s.items.map(n => n), fn, shallow);

  // unrelated change → selector returns a new array with the same elements.
  store.update(s => { s.unrelated = 1; });
  expect(fn).not.toHaveBeenCalled();

  // an actual element change should fire.
  store.update(s => { s.items[0] = 99; });
  expect(fn).toHaveBeenCalledTimes(1);
  expect(fn).toHaveBeenCalledWith([99, 2, 3]);
});

test("subscribe: shallow does not suppress when reference identity changes for nested objects", () => {
  // shallow only compares one level deep — replacing a nested object with a
  // structurally-equal one should still fire because the references differ.
  const store = createStoryStore(() => ({ inner: { x: 1 }, other: 0 }));
  const fn = vi.fn();
  store.subscribe(s => ({ inner: s.inner }), fn, shallow);

  store.update(s => { s.inner = { x: 1 }; });
  expect(fn).toHaveBeenCalledTimes(1);
});

test("listen: shallow suppresses cascade when projected value is shallow-equal", () => {
  const parent = createStoryStore(() => ({ a: 1, b: 2, c: 3 }));

  type Child = { snapshot: { a: number; b: number }; cascades: number };
  const child = createStoryStore<Child>(({ listen, update }) => {
    listen(
      parent,
      s => ({ a: s.a, b: s.b }),
      v => update(s => { s.snapshot = v; s.cascades++; }),
      shallow,
    );
    return { snapshot: { a: 0, b: 0 }, cascades: 0 };
  });

  // priming pass during init runs the consumer once unconditionally.
  expect(child.select(s => s.cascades)).toBe(1);
  expect(child.select(s => s.snapshot)).toEqual({ a: 1, b: 2 });

  // unrelated parent change should not cascade thanks to shallow.
  parent.update(s => { s.c = 99; });
  expect(child.select(s => s.cascades)).toBe(1);

  // a real change to a projected field cascades.
  parent.update(s => { s.a = 10; });
  expect(child.select(s => s.cascades)).toBe(2);
  expect(child.select(s => s.snapshot)).toEqual({ a: 10, b: 2 });
});

test("listen: without shallow, identical projections still cascade on every parent update", () => {
  // contrast with the shallow case above.
  const parent = createStoryStore(() => ({ a: 1, b: 2, c: 3 }));

  type Child = { cascades: number };
  const child = createStoryStore<Child>(({ listen, update }) => {
    listen(
      parent,
      s => ({ a: s.a, b: s.b }),
      () => update(s => { s.cascades++; }),
    );
    return { cascades: 0 };
  });

  expect(child.select(s => s.cascades)).toBe(1); // priming
  parent.update(s => { s.c = 99; });
  expect(child.select(s => s.cascades)).toBe(2); // would be 1 with shallow
});

// ─── State immutability ─────────────────────────────────────────────────────

test("select: returned state is frozen", () => {
  const store = createStoryStore(() => ({ count: 0 }));
  const state = store.select(s => s);
  expect(() => { (state as any).count = 99; }).toThrow();
});
