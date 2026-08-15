// Import defineConfig from vitest/config, not vite — the plain vite version
// does not know about the `test` key and rejects it as an unknown property.
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const entry = (name: string) => fileURLToPath(new URL(name, import.meta.url))

export default defineConfig({
  plugins: [react()],
  build: {
    // The probe is a second page rather than a route, so it stays out of the
    // show page's bundle and off `routing.ts`.
    rollupOptions: {
      input: { main: entry('index.html'), probe: entry('probe.html') },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/vitest.setup.ts'],
    // Vitest stubs CSS imports to '' by default, including `?raw`. Wheel.css is
    // read as text by a test that pins it against the custom properties css.ts
    // emits, so it has to survive the stub.
    css: { include: [/Wheel\.css/] },
    poolOptions: {
      forks: {
        // Node 22+'s experimental global `localStorage` shadows jsdom's window.localStorage
        // (jsdom/jsdom#3862-style conflict), leaving it undefined under Vitest. Disabling it
        // lets jsdom provide the real implementation.
        execArgv: ['--no-experimental-webstorage'],
      },
    },
  },
})
