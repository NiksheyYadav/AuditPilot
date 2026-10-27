// In-process LLM queue, concurrency 1. Higher priority jumps ahead of waiting (not running) jobs.
const waiting = [];
let running = false;
let seq = 0;

async function pump() {
  if (running) return;
  const job = waiting.shift();
  if (!job) return;
  running = true;
  try { job.resolve(await job.fn()); } catch (e) { job.reject(e); } finally { running = false; pump(); }
}

export function enqueue(fn, { priority = 0 } = {}) {
  return new Promise((resolve, reject) => {
    waiting.push({ fn, priority, resolve, reject, seq: ++seq });
    waiting.sort((a, b) => b.priority - a.priority || a.seq - b.seq);
    pump();
  });
}

export const queueStats = () => ({ running, waiting: waiting.length });
