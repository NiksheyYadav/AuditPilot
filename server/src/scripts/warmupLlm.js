import { cfg } from '../config.js';

// Loads the model into memory (native /api/generate with an empty prompt) and keeps it there.
const root = cfg.llmBaseUrl.replace(/\/v1\/?$/, '');
const keep = process.env.WARMUP_KEEP_ALIVE || '30m';
const t0 = Date.now();
console.log(`Loading ${cfg.llmModel} into memory (keep_alive ${keep})...`);
try {
  const r = await fetch(`${root}/api/generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: cfg.llmModel, keep_alive: keep }), signal: AbortSignal.timeout(300000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  console.log(`Model is warm after ${((Date.now() - t0) / 1000).toFixed(1)} s. The first answer in the demo will not pay the load cost.`);
  console.log('Tip: set OLLAMA_KEEP_ALIVE=30m (environment variable of the Ollama server) so it stays loaded between questions.');
} catch (e) {
  console.error(`Warm-up failed: ${e.message}. Is Ollama running and is the model pulled (ollama pull ${cfg.llmModel})?`);
  process.exit(1);
}
