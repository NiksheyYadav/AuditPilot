import { cfg } from '../config.js';
import { llmHealth } from '../agent/health.js';
import { getProvider } from '../agent/llm/index.js';
import { toOpenAiTools } from '../agent/tools.js';

const ok = (m) => console.log(`  [ok]   ${m}`);
const bad = (m) => { console.log(`  [FAIL] ${m}`); process.exitCode = 1; };

console.log(`\nChecking LLM: ${cfg.llmProvider} / ${cfg.llmModel} @ ${cfg.llmBaseUrl}`);
const h = await llmHealth({ force: true });
if (!h.reachable) { bad(`${h.error}. Install and start Ollama: https://ollama.com/download`); process.exit(1); }
ok('Ollama is reachable');
if (!h.modelInstalled) { bad(h.error); process.exit(1); }
ok(`model ${cfg.llmModel} is installed`);

const provider = getProvider();
const messages = [
  { role: 'system', content: 'You are a web audit assistant. When asked for fix instructions for a check id, call the get_remediation tool.' },
  { role: 'user', content: 'How do I fix the check sec-csp? Use the tool.' },
];
const tools = toOpenAiTools();
async function trial(label, onToken) {
  const t0 = Date.now();
  try {
    const r = await provider.chat({ messages, tools, onToken, temperature: 0, maxTokens: 120 });
    const ms = Date.now() - t0;
    const call = r.toolCalls[0];
    if (call) ok(`${label}: tool call "${call.name}" ${call.arguments} in ${(ms / 1000).toFixed(1)} s`);
    else bad(`${label}: model answered in text instead of calling the tool (${(ms / 1000).toFixed(1)} s): "${r.content.slice(0, 80)}"`);
    return Boolean(call);
  } catch (e) { bad(`${label}: ${e.message}`); return false; }
}
console.log('\nTool-call round trips (first call includes model load time):');
await trial('non-streaming');
const s = await trial('streaming + tools', () => {});
console.log(`\nStreaming together with tool calls ${s ? 'WORKS' : 'did NOT work'} on this Ollama build.`);
if (!s) console.log('  -> set LLM_STREAM_TOOLS=false in server/.env (tool rounds non-streaming, final answer delivered at the end).');
console.log('');
