import {createStoryStore} from "./vanilla";

type DataStore = {
  count: number;
  increment: () => void;
};

const dataStore = createStoryStore<DataStore>(({ update }) => {
  return {
    count: 0,
    increment: () => update(s => s.count++),
  };
});

type ViewStore = {
  copy: string;
};

const viewStore = createStoryStore<ViewStore>(({ update, listen }) => {
  const parse = (c: number) => c.toString();
  listen(
    dataStore,
    (s) => s.count,
    (count) => update((s) => s.copy = parse(count)),
  );
  return {
    copy: '',
  };
});
