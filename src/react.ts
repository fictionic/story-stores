import {useSyncExternalStore, useCallback, useRef} from 'react';
import {
  createStoryStore,
  type StoryInit,
  type Selector,
  type StoryStore,
  type Equals,
  type Select
} from "./vanilla";
import {shallow} from './shallow';

export type UseStoryStore = <State, T>(store: StoryStore<State>, selector: Selector<State, T>) => T;

const IDENTITY = <T>(a: T) => a;

// we don't expose an `equals` param here because useStableSelector bakes
// it into the selector, granting subscription filtering (within emit(), pre-react)
// and stable references for the hook's return value.
export const useStoryStore: UseStoryStore = (store, selector) => {
  const snapshot = useSyncExternalStore(
    useCallback((cb) => store.subscribe(selector, cb), [store, selector]),
    useCallback(() => store.select(IDENTITY), [store]),
    useCallback(() => store.selectInitial(IDENTITY), [store]),
  );
  return selector(snapshot);
};

export type UseStory<State> = Select<State>;

export type Story<State> = UseStory<State> & {
  store: StoryStore<State>;
}

export const createStory = <State extends object>(init: StoryInit<State>): Story<State> => {
  const store = createStoryStore(init);
  const hook: UseStory<State> = <T>(selector: Selector<State, T>) => useStoryStore(store, selector);
  const useStory: Story<State> = Object.assign(hook, {
    store,
  });
  return useStory;
};

export const useStableSelector = <State, T>(selector: Selector<State, T>, equals: Equals<T>): Selector<State, T> => {
  type Selection = { value: T } | null;
  const prevRef = useRef<Selection>(null);
  return useCallback((state) => {
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
  }, []);
};

export const useShallow = <State, T>(selector: Selector<State, T>): Selector<State, T> => {
  return useStableSelector(selector, shallow);
};
