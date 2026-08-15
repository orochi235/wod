// Import defineConfig from vitest/config, not vite — the plain vite version
// does not know about the `test` key and rejects it as an unknown property.
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'

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
    // A worktree checked out under the repo is a second copy of every test file,
    // with no node_modules of its own to run them against. Gitignoring it does
    // not hide it from the test glob.
    exclude: [...configDefaults.exclude, '**/.claude/worktrees/**'],
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
