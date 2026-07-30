// Import defineConfig from vitest/config, not vite — the plain vite version
// does not know about the `test` key and rejects it as an unknown property.
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/vitest.setup.ts'],
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
