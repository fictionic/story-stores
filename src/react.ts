import { useSyncExternalStore, useRef, useCallback } from 'react';
import {
  createStoryStore,
  type StoryInit,
  type Selector,
  type StoryStore,
  type Equals,
  type Select,
} from "./vanilla";
import { shallow } from './shallow';

const IDENTITY = <T>(a: T) => a;

/**
 * Subscribes to the given store with the given selector, and returns the selection.
 */
export function useStoryStore<State, T>(store: StoryStore<State>, selector: Selector<State, T>): T {
  // NOTE: We subscribe to the entire store and let React do the filtering,
  // despite the fact that story-stores could do the filtering itself.
  //
  // Two reasons:
  //
  // 1. Subscription churn.
  //
  //    Store-level filtering bakes the selector into subscribe(). Unless the
  //    caller opts to ensure a stable identity for the selector--which they
  //    have no reason to assume they should--the subscribe function will be
  //    recreated on every render, which will cause uSES to tear down
  //    and recreate the subscription to the store on every render. Although
  //    this isn't actually a huge performance issue (resubscribing to a
  //    story-store is cheap), it just feels kinda gross.
  //
  //    This cannot be avoided by creating a stable identity for the selector
  //    ourselves: the store caches its comparison baseline (`last`) per
  //    subscription and only refreshes it on a store update, so a ref-swapped
  //    selector leaves the baseline stale and silently drops updates.
  //
  // 2. Concurrent rendering.
  //
  //    Before committing a concurrent render, React will call getSnapshot again
  //    to see if the external store has updated; if it did, React will re-run
  //    the render synchronously, to prevent tearing.
  //
  //    If we filter within the store's subscription, we don't need to use
  //    the selector within getSnapshot--we just select the whole store, and
  //    then run the selector on the result we get from uSES. But because every
  //    story-store update produces a new state object (via immer), this will
  //    make React think there was always a tear-causing update, even when
  //    a component is only subscribed to a selection of state that didn't
  //    change. Every component will get dropped out of concurrent mode whenever
  //    a store update lands inside a concurrent render.
  //
  //    This could be mitigated by using the selector within getSnapshot, but
  //    then React is doing the same filtering as the store, which defeats the
  //    point of doing the filtering outside of React.
  //
  //  Although I'm disappointed that one of the cool features of story-stores
  //  can't be fully used in its React binding, this is the best implementation.
  return useSyncExternalStore(
    useCallback((cb) => store.subscribe(IDENTITY, cb), [store]),
    () => store.select(selector),
    () => store.selectInitial(selector),
  );
};

export type UseStory<State> = Select<State>;

export type Story<State> = UseStory<State> & {
  store: StoryStore<State>;
}

/**
 * TODO
 */
export function createStory<State extends object>(init: StoryInit<State>): Story<State> {
  const store = createStoryStore(init);
  const hook: UseStory<State> = <T>(selector: Selector<State, T>) => useStoryStore(store, selector);
  const useStory: Story<State> = Object.assign(hook, { store });
  return useStory;
};


/**
 * TODO
 */
export function useStableSelector<State, T>(
  selector: Selector<State, T>,
  equals: Equals<T>,
): Selector<State, T> {
  type Selection = { value: T } | null;
  const prevRef = useRef<Selection>(null);
  return (state) => {
    const next = selector(state);
    if (!prevRef.current) {
      prevRef.current = { value: next };
      return next;
    }
    const prev = prevRef.current.value
    if (equals(prev, next)) {
      return prev;
    }
    prevRef.current.value = next;
    return next;
  };
};

/**
 * TODO
 */
export function useShallow<State, T>(selector: Selector<State, T>): Selector<State, T> {
  return useStableSelector(selector, shallow);
};
