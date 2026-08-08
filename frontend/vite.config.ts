import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { viteCommonjs } from '@originjs/vite-plugin-commonjs';
import { fileURLToPath, URL } from 'node:url';

// The Midnight JS / Compact toolchain ships CommonJS + WASM + Node built-ins.
// These plugins make it bundle correctly for the browser.
export default defineConfig({
  plugins: [
    react(),
    viteCommonjs(),
    wasm(),
    topLevelAwait(),
    nodePolyfills({
      include: ['crypto', 'buffer', 'process', 'stream', 'util'],
    }),
  ],

  optimizeDeps: {
    include: [
      '@midnight-ntwrk/compact-js',
      '@midnight-ntwrk/compact-runtime',
    ],
  },

  resolve: {
    alias: {
      // Route isomorphic-ws through our browser shim
      'isomorphic-ws': fileURLToPath(
        new URL('./src/shims/isomorphic-ws.ts', import.meta.url)
      ),
    },
  },

  build: {
    target: 'es2022',
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },

  server: {
    port: 5173,
  },
});