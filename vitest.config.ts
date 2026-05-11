import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'apps/web/lib/**/*.test.ts'],
  },
})
