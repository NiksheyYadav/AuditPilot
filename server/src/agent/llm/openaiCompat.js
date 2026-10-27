import OpenAI from 'openai';
import { cfg } from '../../config.js';

/** Provider backed by Ollama's OpenAI-compatible endpoint (any OpenAI-compatible local server works). */
export function createOpenAiCompatProvider() {
  const client = new OpenAI({ baseURL: cfg.llmBaseUrl, apiKey: cfg.llmApiKey, timeout: cfg.llmTimeoutMs, maxRetries: 0 });
  const model = cfg.llmModel;

  return {
    name: 'ollama', model, mock: false,
    /**
     * chat({ messages, tools, onToken, signal }) -> { content, toolCalls: [{id,name,arguments}] }
     * With onToken the response is streamed (tool calls are assembled from deltas); otherwise one request.
     */
    async chat({ messages, tools, onToken, signal, temperature = 0.1, maxTokens = 600 }) {
      const base = { model, messages, temperature, max_tokens: maxTokens, ...(tools?.length ? { tools } : {}) };
      if (!onToken) {
        const r = await client.chat.completions.create({ ...base, stream: false }, { signal });
        const m = r.choices[0].message;
        return { content: m.content || '', toolCalls: (m.tool_calls || []).map((t) => ({ id: t.id, name: t.function.name, arguments: t.function.arguments })) };
      }
      const stream = await client.chat.completions.create({ ...base, stream: true }, { signal });
      let content = '';
      const calls = [];
      for await (const chunk of stream) {
        const d = chunk.choices?.[0]?.delta;
        if (!d) continue;
        if (d.content) { content += d.content; onToken(d.content); }
        for (const t of d.tool_calls || []) {
          const c = (calls[t.index ?? 0] ||= { id: t.id, name: '', arguments: '' });
          if (t.id) c.id = t.id;
          if (t.function?.name) c.name += t.function.name;
          if (t.function?.arguments) c.arguments += t.function.arguments;
        }
      }
      return { content, toolCalls: calls.filter(Boolean).map((c, i) => ({ ...c, id: c.id || `call_${i}` })) };
    },
  };
}
