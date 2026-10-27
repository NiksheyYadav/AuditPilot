const TOKEN_KEY = 'ap_token';
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

async function req(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && getToken()) { setToken(null); window.dispatchEvent(new Event('ap-logout')); }
    const err = new Error(data?.error?.message || `Request failed (${res.status})`);
    err.status = res.status; err.details = data?.error?.details;
    throw err;
  }
  return data;
}

export const api = {
  health: () => req('/health'),
  register: (b) => req('/auth/register', { method: 'POST', body: b }),
  login: (b) => req('/auth/login', { method: 'POST', body: b }),
  me: () => req('/auth/me'),
  listAudits: () => req('/audits'),
  createAudit: (url, render = false) => req('/audits', { method: 'POST', body: { url, render } }),
  listSchedules: () => req('/schedules'),
  createSchedule: (b) => req('/schedules', { method: 'POST', body: b }),
  deleteSchedule: (id) => req(`/schedules/${id}`, { method: 'DELETE' }),
  getAudit: (id) => req(`/audits/${id}`),
  deleteAudit: (id) => req(`/audits/${id}`, { method: 'DELETE' }),
  compare: (a, b) => req(`/audits/compare?a=${a}&b=${b}`),
  trend: (url) => req(`/audits/trend?url=${encodeURIComponent(url)}`),
};

/** POST a chat message and consume the SSE stream. onEvent(name, data). */
export async function streamChat(id, message, onEvent, signal) {
  const res = await fetch(`/api/audits/${id}/chat`, {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    body: JSON.stringify({ message }),
  });
  if (!res.ok || !res.body) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d?.error?.message || `Chat failed (${res.status})`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i); buf = buf.slice(i + 2);
      let ev = 'message', data = '';
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) ev = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (data) { try { onEvent(ev, JSON.parse(data)); } catch { /* ignore malformed event */ } }
    }
  }
}
