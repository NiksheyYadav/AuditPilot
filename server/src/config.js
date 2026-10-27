const env = (k, d) => (process.env[k] === undefined || process.env[k] === '' ? d : process.env[k]);

// Read lazily so tests can change process.env at runtime.
export const cfg = {
  get port() { return Number(env('PORT', 4000)); },
  get mongoUri() { return env('MONGO_URI', ''); },
  get jwtSecret() { return env('JWT_SECRET', 'dev-only-secret-change-me'); },
  get allowPrivate() { return env('ALLOW_PRIVATE_TARGETS', 'false') === 'true'; },
  get auditRateLimit() { return Number(env('AUDIT_RATE_LIMIT', 20)); },
  get chatRateLimit() { return Number(env('CHAT_RATE_LIMIT', 30)); },
  get llmProvider() { return env('LLM_PROVIDER', 'ollama'); },
  get llmBaseUrl() { return env('LLM_BASE_URL', 'http://localhost:11434/v1'); },
  get llmApiKey() { return env('LLM_API_KEY', 'ollama'); },
  get llmModel() { return env('LLM_MODEL', 'qwen2.5:3b'); },
  // true: stream while tool calls may happen. false: non-streaming rounds, finished answer is emitted at the end.
  get streamWithTools() { return env('LLM_STREAM_TOOLS', 'true') === 'true'; },
  get llmTimeoutMs() { return Number(env('LLM_TIMEOUT_MS', 120000)); },
  // empty MONGO_URI: keep the demo DB on disk (server/.data/mongo) so data survives restarts; false = pure in-memory
  get persistDemoDb() { return env('DEMO_DB_PERSIST', 'true') === 'true'; },
  get maxLinks() { return Math.min(100, Math.max(1, Number(env('AUDIT_MAX_LINKS', 50)))); },
  get clientOrigin() { return env('CLIENT_ORIGIN', 'http://localhost:5173'); },
};

export function describeLlm() {
  const mock = cfg.llmProvider === 'mock';
  return { provider: mock ? 'mock' : 'ollama', model: mock ? 'scripted-mock' : cfg.llmModel, mock };
}
