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
