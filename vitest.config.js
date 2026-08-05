import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // jsdom provides document, window, SVGElement, DOMParser, etc.
    // Required by svg-render.test.js and export.test.js.
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
    // Increase timeout for async file-read tests.
    testTimeout: 10000,
    // Run each test file in a separate worker process.
    // This prevents the "FATAL ERROR: v8::ToLocalChecked Empty MaybeLocal"
    // crash that occurs when jsdom tears down inside a shared worker.
    pool: 'forks',
  },
});
