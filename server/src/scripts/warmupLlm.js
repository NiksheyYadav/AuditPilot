import { cfg } from '../config.js';
import { warmModel } from '../agent/health.js';

console.log(`Loading ${cfg.llmModel} into memory (keep_alive ${process.env.WARMUP_KEEP_ALIVE || '30m'})...`);
try {
  const ms = await warmModel();
  console.log(`Model is warm after ${(ms / 1000).toFixed(1)} s. The first answer in the demo will not pay the load cost.`);
  console.log('Tip: set OLLAMA_KEEP_ALIVE=30m (environment variable of the Ollama server) so it stays loaded between questions.');
} catch (e) {
  console.error(`Warm-up failed: ${e.message}. Is Ollama running and is the model pulled (ollama pull ${cfg.llmModel})?`);
  process.exit(1);
}
