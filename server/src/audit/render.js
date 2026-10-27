import fs from 'node:fs';
import { assertSafeUrl } from './ssrf.js';

export class RenderError extends Error {
  constructor(message) { super(message); this.name = 'RenderError'; this.status = 422; }
}

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
].filter(Boolean);

/** Path of an installed Chrome/Edge/Chromium (no browser is downloaded by this project), or null. */
export const findBrowser = () => CANDIDATES.find((p) => fs.existsSync(p)) || null;

let chain = Promise.resolve(); // one headless render at a time

/**
 * Loads a page in a headless browser so JavaScript-built content is audited.
 * Every request the page makes (including redirects and sub-resources) goes through the same SSRF guard.
 */
export function renderPage(url, { timeoutMs = 15000, maxChars = 2 * 1024 * 1024 } = {}) {
  const exe = findBrowser();
  if (!exe) return Promise.reject(new RenderError('JavaScript rendering needs Chrome, Edge or Chromium. Install one or set CHROME_PATH in server/.env.'));
  const job = async () => {
    const { chromium } = await import('playwright-core');
    const browser = await chromium.launch({ executablePath: exe, headless: true });
    try {
      const page = await (await browser.newContext({ acceptDownloads: false, userAgent: 'AuditPilotBot/1.0 (render)' })).newPage();
      await page.route('**/*', async (route) => {
        const u = route.request().url();
        if (/^(data|blob|about):/i.test(u)) return route.continue();
        try { await assertSafeUrl(u); return await route.continue(); } catch { return route.abort('blockedbyclient'); }
      });
      await page.goto(url, { waitUntil: 'load', timeout: timeoutMs });
      await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
      const html = (await page.content()).slice(0, maxChars);
      return { html, finalUrl: page.url() };
    } catch (e) {
      throw new RenderError(`Could not render the page (${e.message.split('\n')[0].slice(0, 120)})`);
    } finally { await browser.close(); }
  };
  const p = chain.then(job, job);
  chain = p.catch(() => {});
  return p;
}
