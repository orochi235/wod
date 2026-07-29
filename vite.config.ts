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
  },
})
