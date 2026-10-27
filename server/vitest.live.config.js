import { defineConfig } from 'vitest/config';
// Opt-in: talks to the REAL local Ollama model. Run with npm run test:live
export default defineConfig({ test: { environment: 'node', testTimeout: 240000, hookTimeout: 180000, fileParallelism: false, include: ['tests/live.test.js'], env: { NODE_ENV: 'test', LIVE_LLM: '1', LLM_PROVIDER: 'ollama' } } });
