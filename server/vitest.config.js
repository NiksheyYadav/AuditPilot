import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node', testTimeout: 30000, hookTimeout: 180000, fileParallelism: false, env: { NODE_ENV: 'test' }, exclude: ['node_modules/**', 'tests/live.test.js'] } });
