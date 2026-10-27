import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { listen, makeApp } from './helpers.js';

const serverPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'mcp', 'server.js');
let mem, web, client;

beforeAll(async () => {
  mem = await MongoMemoryServer.create();
  process.env.ALLOW_PRIVATE_TARGETS = 'true';
  web = await listen(makeApp());
  client = new Client({ name: 'test-client', version: '1.0.0' });
  await client.connect(new StdioClientTransport({
    command: process.execPath, args: [serverPath], stderr: 'pipe',
    env: { ...process.env, MONGO_URI: mem.getUri(), ALLOW_PRIVATE_TARGETS: 'true', LLM_PROVIDER: 'mock', AUDITPILOT_USER_EMAIL: 'mcp@test.dev' },
  }));
});
afterAll(async () => { await client?.close(); web?.server.close(); await mem?.stop(); });

describe('MCP stdio server', () => {
  it('lists the shared tool registry over stdio', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(['audit_url', 'get_audit', 'list_audits']));
    expect(tools.find((t) => t.name === 'audit_url').inputSchema.properties.url).toBeTruthy();
  });
  it('audit_url runs a real audit, then list_audits and get_audit see it', async () => {
    const r = await client.callTool({ name: 'audit_url', arguments: { url: `${web.base}/demo/good` } });
    expect(r.isError).toBeFalsy();
    const audit = JSON.parse(r.content[0].text);
    expect(audit.scores.overall).toBeGreaterThan(90);
    const list = JSON.parse((await client.callTool({ name: 'list_audits', arguments: {} })).content[0].text);
    expect(list.audits[0].id).toBe(audit.id);
    const got = JSON.parse((await client.callTool({ name: 'get_audit', arguments: { audit_id: audit.id } })).content[0].text);
    expect(got.url).toContain('/demo/good');
  });
  it('returns an error result for blocked or invalid input', async () => {
    const bad = await client.callTool({ name: 'get_audit', arguments: { audit_id: '64b64b64b64b64b64b64b64b' } });
    expect(bad.isError).toBe(true);
  });
});
