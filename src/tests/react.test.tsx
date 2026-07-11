import { act, type RefObject } from 'react';
import { expect, test, vi, afterEach, describe } from 'vitest';
import { render, renderHook, cleanup } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { createStoryStore } from '../vanilla';
import { useStoryStore, createStory, useStableSelector, useShallow } from '../react';

afterEach(cleanup);

type CounterState = { a: number; b: number; c: number };

function makeStore(initial: CounterState = { a: 0, b: 0, c: 0 }) {
  return createStoryStore<CounterState>(() => ({ ...initial }));
}

type ProbeProps<State extends object, T> = {
  store: ReturnType<typeof createStoryStore<State>>;
  select: (s: State) => T;
  renderCount?: RefObject<number>;
};

function Probe<State extends object, T>({ store, select, renderCount }: ProbeProps<State, T>) {
  const value = useStoryStore(store, select);
  if (renderCount) renderCount.current++;
  return <span data-testid="probe">{String(value)}</span>;
}

describe('react bindings', () => {

  describe('useStoryStore', () => {
    test('renders initial selection', () => {
      const store = makeStore({ a: 42, b: 0, c: 0 });
      const { getByTestId } = render(<Probe store={store} select={s => s.a} />);
      expect(getByTestId('probe').textContent).toBe('42');
    });

    test('rerenders when selected field changes', () => {
      const store = makeStore();
      const { getByTestId } = render(<Probe store={store} select={s => s.a} />);
      expect(getByTestId('probe').textContent).toBe('0');
      act(() => { store.update(s => { s.a = 7; }); });
      expect(getByTestId('probe').textContent).toBe('7');
    });

    test('rerenders only if subscribed to the selection that changed', () => {
      const store = makeStore();
      const rcA = { current: 0 };
      const rcB = { current: 0 };

      render(
        <>
          <Probe store={store} select={s => s.a} renderCount={rcA} />
          <Probe store={store} select={s => s.b} renderCount={rcB} />
        </>
      );

      const beforeA = rcA.current;
      const beforeB = rcB.current;

      act(() => { store.update(s => { s.a = 1; }); });

      expect(rcA.current).toBeGreaterThan(beforeA);
      expect(rcB.current).toBe(beforeB);
    });

    test('subscribe is not called again on parent re-render', () => {
      const store = makeStore();
      const spy = vi.spyOn(store, 'subscribe');

      const { rerender } = render(
        <Probe store={store} select={s => s.a} />
      );

      const callsAfterMount = spy.mock.calls.length;

      // Force rerenders of the parent
      rerender(<Probe store={store} select={s => s.a} />);
      rerender(<Probe store={store} select={s => s.a} />);

      expect(spy.mock.calls.length).toBe(callsAfterMount);
    });

    test('store swap resubscribes to new store', () => {
      const storeA = createStoryStore<{ val: number }>(() => ({ val: 1 }));
      const storeB = createStoryStore<{ val: number }>(() => ({ val: 2 }));

      const { rerender, getByTestId } = render(
        <Probe store={storeA} select={s => s.val} />
      );
      expect(getByTestId('probe').textContent).toBe('1');

      rerender(<Probe store={storeB} select={s => s.val} />);
      expect(getByTestId('probe').textContent).toBe('2');
    });

    test('unmount removes listener -- no throw after update', () => {
      const store = makeStore();
      const rc = { current: 0 };
      const { unmount } = render(<Probe store={store} select={s => s.a} renderCount={rc} />);
      const before = rc.current;
      unmount();
      expect(() => { act(() => { store.update(s => { s.a = 5; }); }); }).not.toThrow();
      expect(rc.current).toBe(before);
    });

  });

  describe('createStory', () => {
    test('returns a hook that selects into the state (useStory)', () => {
      const useStory = createStory<{ count: number }>(() => ({ count: 3 }));
      function App() {
        const count = useStory(s => s.count);
        return <span data-testid="v">{count}</span>;
      }
      const { getByTestId } = render(<App />);
      expect(getByTestId('v').textContent).toBe('3');
    });

    test('can trigger a backdoor update via the .store property', () => {
      const useStory = createStory<{ count: number }>(() => ({ count: 0 }));
      function App() {
        const count = useStory(s => s.count);
        return <span data-testid="v">{count}</span>;
      }
      const { getByTestId } = render(<App />);
      act(() => { useStory.store.update(s => { s.count = 10; }); });
      expect(getByTestId('v').textContent).toBe('10');
    });
  });

  describe('useStableSelector', () => {
    test('primes ref and returns projection on first call', () => {
      const store = makeStore({ a: 1, b: 2, c: 3 });
      const eq = vi.fn((a: { a: number }, b: { a: number }) => a.a === b.a);
      const { result } = renderHook(() => {
        const sel = useStableSelector((s: CounterState) => ({ a: s.a }), eq);
        return sel(store.select(s => s));
      });
      expect(result.current).toEqual({ a: 1 });
    });

    test('returns same reference when equals holds', () => {
      const store = makeStore({ a: 1, b: 2, c: 3 });
      const state = store.select(s => s);
      let capturedRef: { a: number } | undefined;

      const { result, rerender } = renderHook(() => {
        const sel = useStableSelector(
          (s: CounterState) => ({ a: s.a }),
          (a, b) => a.a === b.a,
        );
        const val = sel(state);
        if (!capturedRef) capturedRef = val;
        return val;
      });

      rerender();
      expect(result.current).toBe(capturedRef);

      // make sure the baseline doesn't slide
      rerender();
      rerender();
      rerender();
      expect(result.current).toBe(capturedRef);
    });

    test('returns new reference when equals fails', () => {
      let currentState = makeStore({ a: 1, b: 2, c: 3 }).select(s => s);
      let callCount = 0;

      const { result, rerender } = renderHook(() => {
        const sel = useStableSelector(
          (s: CounterState) => ({ a: s.a }),
          (a, b) => a.a === b.a,
        );
        callCount++;
        return sel(currentState);
      });

      const first = result.current;
      currentState = { a: 99, b: 2, c: 3 };
      rerender();
      expect(result.current).not.toBe(first);
      expect(result.current.a).toBe(99);
    });
  });

  describe('useShallow', () => {
    test('unrelated field change does not re-render', () => {
      const store = createStoryStore<CounterState>(() => ({ a: 0, b: 0, c: 0 }));
      const rc = { current: 0 };

      function App() {
        rc.current++;
        const sel = useShallow((s: CounterState) => ({ a: s.a, b: s.b }));
        const val = useStoryStore(store, sel);
        return <span>{val.a},{val.b}</span>;
      }

      render(<App />);
      const before = rc.current;
      act(() => { store.update(s => { s.c = 42; }); });
      expect(rc.current).toBe(before);
    });

    test('changing selected field does re-render', () => {
      const store = createStoryStore<CounterState>(() => ({ a: 0, b: 0, c: 0 }));
      const rc = { current: 0 };

      function App() {
        rc.current++;
        const sel = useShallow((s: CounterState) => ({ a: s.a, b: s.b }));
        const val = useStoryStore(store, sel);
        return <span data-testid="v">{val.a},{val.b}</span>;
      }

      const { getByTestId } = render(<App />);
      const before = rc.current;
      act(() => { store.update(s => { s.a = 5; }); });
      expect(rc.current).toBeGreaterThan(before);
      expect(getByTestId('v').textContent).toBe('5,0');
    });

    test('object selector does not throw', () => {
      const store = createStoryStore<CounterState>(() => ({ a: 0, b: 0, c: 0 }));

      function App() {
        const sel = useShallow((s: CounterState) => ({ a: s.a, b: s.b }));
        const val = useStoryStore(store, sel);
        return <span>{val.a}</span>;
      }

      expect(() => render(<App />)).not.toThrow();
    });
  });

  describe('SSR', () => {
    test('server snapshot uses initial state, not live state', () => {
      const store = createStoryStore<{ val: number }>(() => ({ val: 1 }));
      act(() => { store.update(s => { s.val = 99; }); });

      // client reads live state
      expect(store.select(s => s.val)).toBe(99);

      // server snapshot must return initial value
      const html = renderToString(
        <Probe store={store} select={s => s.val} />
      );
      expect(html).toContain('1');
      expect(html).not.toContain('99');
    });

    test('no hydration mismatch warning', async () => {
      const store = createStoryStore<{ val: number }>(() => ({ val: 42 }));

      const html = renderToString(
        <Probe store={store} select={s => s.val} />
      );

      const container = document.createElement('div');
      document.body.appendChild(container);
      container.innerHTML = html;

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        await act(async () => {
          hydrateRoot(container, <Probe store={store} select={s => s.val} />);
        });
        const hydrationErrors = errorSpy.mock.calls.filter(args =>
          typeof args[0] === 'string' && args[0].includes('hydrat')
        );
        expect(hydrationErrors).toHaveLength(0);
      } finally {
        errorSpy.mockRestore();
        document.body.removeChild(container);
      }
    });
  });

});
