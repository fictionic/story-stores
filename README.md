# Story-Stores

> 📖 A small Zustand-inspired state management framework built around inter-store subscriptions.

## Introduction

If you think about it, a store is really just a _story_: "When I was created, I had this state. Then, all of a sudden, an _update_ came along and caused me to have some _new_ state!" (etc.) — Story-Stores is the very first state management library that fully embraces this undeniable fact.

A Story-Stores store—called a 'Story'—is very similar to a Zustand store:

```js
import { createStoryStore } from 'story-stores/vanilla';

const counterStory = createStoryStore(({ select, update }) => ({
  count: 1,
  increment: () => update(s => s.count++),
  negated: () => select(s => s.count * -1),
}));

counterStory.select(s => s.count);
counterStory.update(s => s.count = 50);
```

But what good would a Story be if no one ever heard it?

Along with `select` and `update`, Story-Stores provides a first-class mechanism for subscribing to another store, called `listen`:

```js
const messageStory = createStoryStore(({ update, listen }) => {
  listen(
    counterStory,
    s => s.count,
    count => update(s => s.message = `Count is ${count}`),
  );
  return {
    message: '',
  };
});

messageStory.select(s => s.message); // "Count is 1"
```

We believe that if you are going to depend on something, the best way to do that is by _listening_ to them right from the very start. In addition to being respectful, this also allows for the dependency graph between stores to be known statically.

**Active Listening**: Listeners are primed during store initialization, so you don't need to redundantly select from the child store to set the initial state.

## With React

The best Stories often elicit strong Reactions in those who listen to them.

To bind a component to a Story, you can call the `useStoryStore` hook with the Story an a selector:

```js
import { MyStory } from '@/path/to/MyStory';
import { useStoryStore } from 'story-stores';

export function MyComponent() {
  const foo = useStoryStore(MyStory, s => s.foo);
  // ...
}
```

Or, like Zustand, you can use `createStory` to create a Story that is its own hook:

```js
// MyStory.js
import { createStory } from 'story-stores';

export const useMyStory = createStory(/* ... */);

// MyComponent.js
import { useMyStory } from '@/path/to/useMyStory';

export function MyComponent() {
  const foo = useMyStory(s => s.foo);
  // ...
}
```

These are equivalent. In both cases, the component will update on each change to the selection of state.

## Examples

Ok no more jokes; this is a real library and it's very serious.

### Multi-Updates

Unlike Zustand, which uses `setState` merge semantics, all Story-Stores updates go through Immer. To set multiple fields at once, you can use `Object.assign`:

```js
update(s => Object.assign(s, {
  foo: 1,
  bar: true,
});
```

### Data-Store / View-Store

Suppose you have a page that fetches a big data payload, and this payload is not in a convenient shape for consumption by the view. You might want to separate the data model/controller from the view model/controller:

```js
const dataStory = createStoryStore(({ update }) => {
  const load = () => {
    fetch(URL)
      .then(data => update(s => s.data = data));
  };
  load();
  return {
    data: null,
    load,
  };
});

const viewStory = createStoryStore(({ update, listen }) => {
  listen(
    dataStory,
    s => s.data,
    data => {
      update(s => {
        s.foo = readFoo(data);
        // ...
      });
    },
  );
  return {
    foo: null,
    // ...
    // and perhaps you have some view-only state:
    showDialog: false,
    dialogVariant: null,
    onOpenDialog: (variant) => update(s => Object.assign(s, { showDialog: true, dialogVariant: variant }),
  };
});
```

Components wouldn't have to worry about the shape of the API response; they would only need to subscribe to the portions of the view model that they care about, and perhaps to `load()` for refreshing.

### Stable Multi-Selectors

Like Zustand, Story-Stores provides a hook called `useShallow` that can be used to performantly select multiple items from state via a single selector:

```js
import { useShallow } from 'story-stores';

const { foo, bar } = useMyStory(useShallow(s => ({ foo: s.foo, bar: s.bar })));
```

If you want something besides shallow equality, you can implement it yourself by using the more general `useStableSelector` and passing a custom equality checker:

```js
import { useStableSelector } from 'story-stores';

const { ... } = useMyStory(useStableSelector(s => ({ ... }), (a, b) => { ... }));
```

### Batched Updates

Even though React has batched updates automatically since version 18, Story-Stores has its own batching primitive called `batch()`, which is useful for working outside of React, or for extra-fancy over-optimized performance, or just as an idiomatic way to group together a sequence of updates:

```js
import { batch } from 'story-stores';

const onClick = () => {
  batch(() => {
    userStore.update(s => s.selected = id );
    filterStore.update(s => s.active = true );
    analyticsStore.update(s => s.clicks++ );
  });
};
```

This ensures that all three updates will happen together, before any listeners (including React) are invoked.

Batches can be nested.

### Transient Updates

The hook returned by `createStory` holds a reference to the vanilla StoryStore (see below for an API reference). You can subscribe to a store manually for non-reactive updates:

```js
const getFoo = (s) => s.foo;
const fooRef = useRef(useMyStory.store.select(getFoo));
useEffect(() => {
  const unsub = useMyStory.store.subscribe(
    getFoo,
    foo => fooRef.current = foo,
  );
  return unsub;
}, []);
```

You can also pass a custom equality checker as the third argument to `subscribe`, similar to `useStableSelector`.

## StoryStore API

Here are the TypeScript types.

### Vanilla StoryStores

A StoryStore object looks like this:

```ts
type StoryStore<State> = {
  select: Select<State>;
  update: Update<State>;
  subscribe: Subscribe<State>;
  selectInitial: Select<State>;
}
```

The function signatures are what you would probably expect:

```ts
type Select<State> = <T>(selector: Selector<State, T>) => T;
type Update<State> = (updater: Updater<State>) => void;
type Subscribe<State> = <T>(selector: Selector<State, T>, consumer: Consumer<T>, equals?: Equals<T>) => (() => void);

type Selector<State, T> = (state: State) => T;
type Updater<State> = (state: State) => void;
type Consumer<T> = (value: T) => void;
type Equals<T> = (a: T, b: T) => boolean;
```

- `select` returns a selection of the current state
- `update` updates the state by applying the given updater as a recipe to Immer's `produce`. Thus, state is immutable; new references are created as-needed on each mutation.
- `subscribe` installs the given callback as a subscriber for changes to the store, sliced to the given selector. Only updates that affect the selected state will trigger the callback. Values are compared with `Object.is` by default; a custom equality checker can be passed as the third argument.
- `selectInitial` works like `select` but only reads from the initial state. (Used for `getServerSnapshot`.)

The `batch` function looks like this:

```ts
type Batch = <T>(action: () => T) => T;
```

A shallow-equality function is provided via `import { shallow } from 'story-stores/shallow'`. It is just a rip-off of the one from Zustand: it works with objects, arrays, iterables, and anything with iterable `.entries()` like Sets and Maps.

### React API

The `useStoryStore` hook has this signature:

```ts
type UseStoryStore = <State, T>(store: StoryStore<State>, selector: Selector<State, T>) => T;
```

The function returned by `createStory` accepts only a selector, and it has the StoryStore API on a `store` property:

```ts
type UseStory<State> = Select<State>;
type Story<State> = UseStory<State> & {
  store: StoryStore<State>;
};
```

Both `useStableSelector` and `useShallow` return the same type as the provided selector.
