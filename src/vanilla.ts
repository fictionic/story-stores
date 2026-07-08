import { produce } from 'immer';

export type Selector<State, T> = (state: State) => T;
export type Updater<State> = (state: State) => void;
export type Consumer<T> = (value: T) => void;

type Unsub = () => void;

export type Equals<T> = (a: T, b: T) => boolean;

export type Select<State> = <T>(selector: Selector<State, T>) => T;
export type Update<State> = (updater: Updater<State>) => void;
export type Subscribe<State> = <T>(selector: Selector<State, T>, consumer: Consumer<T>, equals?: Equals<T>) => Unsub

export type StoryStore<State> = {
  select: Select<State>;
  update: Update<State>;
  subscribe: Subscribe<State>;
  selectInitial: Select<State>;
};

export type Listen = <S, T>(store: StoryStore<S>, selector: Selector<S, T>, consumer: Consumer<T>, equals?: Equals<T>) => Unsub;

export type StoryInitFns<State> = {
  select: Select<State>;
  update: Update<State>;
  listen: Listen;
};

export type StoryInit<State> = (fns: StoryInitFns<State>) => State;

// cross-store, module-level state. should not be used during server rendering.
let batchDepth = 0;
let pendingEmits = new Set<() => void>();
export type Batch = <T>(action: () => T) => T;
export const batch: Batch = (action) => {
  try {
    batchDepth++;
    return action();
  } finally {
    batchDepth--;
    if (batchDepth === 0) {
      pendingEmits.forEach((emit) => {
        emit();
      });
      pendingEmits.clear();
    }
  }
}

type Listener<State, T> = {
  selector: Selector<State, T>;
  consumer: Consumer<T>;
  last: T;
  equals: Equals<T>;
};

export const createStoryStore = <State extends object>(init: StoryInit<State>): StoryStore<State> => {
  let state: State = new Proxy<State>({} as State, {
    get: () => { throw new Error("not ready"); },
    set: () => { throw new Error("not ready"); },
  });
  const listeners = new Set<Listener<State, any>>();

  const subscribe: Subscribe<State> = (selector, consumer, equals = Object.is) => {
    const listener = { selector, consumer, last: selector(state), equals };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  const emit = () => {
    for (const l of listeners) {
      const { selector, consumer, last, equals } = l;
      const selected = selector(state);
      if (!equals(selected, last)) {
        consumer(selected);
        l.last = selected;
      }
    }
  };

  const select: Select<State> = (selector) => selector(state);

  const update: Update<State> = (recipe) => {
    state = produce(state, recipe);
    if (batchDepth > 0) {
      pendingEmits.add(emit); // no-op if this store is already pending an emit
    } else {
      emit();
    }
  };

  const didInitRef = { current: false };
  const listenerPrimings: Array<() => void> = [];

  // TODO: right now listen() is pretty rudimentary. a more robust version would:
  // - create a dependency graph
  // - check it for cycles and throw if it finds any
  // - solve the "diamond problem" (D <= {C, B} <= A) -- only update D once with batched update from B and C
  const listen: Listen = (store, selector, consumer, equals) => {
    if (didInitRef.current) {
      throw new Error("cannot listen after init");
    }
    listenerPrimings.push(() => consumer(store.select(selector)));
    return store.subscribe(selector, consumer, equals);
  };

  state = init({ select, update, listen });
  Object.freeze(state); // freeze initial state ourselves; then future updates will be frozen by immer

  const initialState = state; // for getServerSnapshot
  const selectInitial: Select<State> = (selector) => selector(initialState);

  didInitRef.current = true;
  batch(() => listenerPrimings.forEach((fn) => fn()));
  listenerPrimings.length = 0; // might as well free for GC

  return {
    select,
    update,
    subscribe,
    selectInitial,
  };
}
