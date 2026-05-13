import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    testTimeout: 60000,
    hookTimeout: 60000,
    include: [
      'src/**/*.{test,spec}.{ts,tsx}',
      'server/**/*.{test,spec}.{ts,tsx}',
      'scripts/scraper/__tests__/**/*.{test,spec}.{ts,tsx}',
      'feature-validation/**/*.{test,spec}.{ts,tsx}',
    ],
    exclude: [
      'node_modules/**',
      'dist/**',
      'feature-validation/e2e/blog-page-consistency.test.ts',
      'feature-validation/e2e/homepage-rendering.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/components/**/*.tsx'],
      exclude: ['src/test/**', '**/*.d.ts'],
    },
  },
});
