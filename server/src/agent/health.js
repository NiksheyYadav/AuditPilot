import { cfg } from '../config.js';

let cache = { at: 0, value: null };

/** Probes Ollama (/api/tags). Cached for 3 s so the header badge never slows the API. */
export async function llmHealth({ force = false } = {}) {
  if (cfg.llmProvider === 'mock') return { reachable: true, modelInstalled: true };
  if (!force && Date.now() - cache.at < 3000 && cache.value) return cache.value;
  let value;
  try {
    const root = cfg.llmBaseUrl.replace(/\/v1\/?$/, '');
    const r = await fetch(`${root}/api/tags`, { signal: AbortSignal.timeout(1500) });
    const names = ((await r.json()).models || []).map((m) => m.name);
    const want = cfg.llmModel;
    const installed = names.some((n) => n === want || n === `${want}:latest` || n.split(':')[0] === want);
    value = { reachable: true, modelInstalled: installed, ...(installed ? {} : { error: `Model ${want} is not installed (run: ollama pull ${want})` }) };
  } catch {
    value = { reachable: false, modelInstalled: false, error: 'Ollama is not reachable' };
  }
  cache = { at: Date.now(), value };
  return value;
}

/** Loads the model into memory (native /api/generate with no prompt) and keeps it there. */
export async function warmModel(keep = process.env.WARMUP_KEEP_ALIVE || '30m') {
  const root = cfg.llmBaseUrl.replace(/\/v1\/?$/, '');
  const t0 = Date.now();
  const r = await fetch(`${root}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: cfg.llmModel, keep_alive: keep }), signal: AbortSignal.timeout(300000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return Date.now() - t0;
}
