import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    vanilla: 'src/vanilla.ts',
    react: 'src/react.ts'
  },
  outDir: 'dist',
  format: ['esm'],
  dts: true,
  clean: true,
  external: [
    'react',
    'react-dom',
    'react/jsx-runtime',
    'immer',
    '@verso-js/stores',
    '@verso-js/verso',
  ],
});
