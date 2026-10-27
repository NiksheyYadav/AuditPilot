import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

// Load server/.env even when launched by Claude Code from another directory.
try { process.loadEnvFile(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.env')); } catch { /* optional */ }
console.log = console.error; // stdout is reserved for the MCP protocol

const { connectDb, disconnectDb } = await import('../db.js');
const { User } = await import('../models/index.js');
const { TOOLS, executeTool } = await import('../agent/tools.js');
const bcrypt = (await import('bcryptjs')).default;

await connectDb();
const email = (process.env.AUDITPILOT_USER_EMAIL || 'demo@auditpilot.dev').toLowerCase();
const user = (await User.findOne({ email })) || (await User.create({ name: 'MCP User', email, passwordHash: await bcrypt.hash(`mcp-${Date.now()}`, 8) }));

const server = new McpServer({ name: 'auditpilot', version: '1.0.0' });
for (const t of TOOLS) {
  server.registerTool(t.mcpName, { description: t.description, inputSchema: t.schema.shape }, async (args) => {
    const out = await executeTool(t.name, args, { userId: String(user._id), auditId: args.audit_id });
    return out.ok
      ? { content: [{ type: 'text', text: JSON.stringify(out.result, null, 2) }] }
      : { isError: true, content: [{ type: 'text', text: out.error }] };
  });
}

await server.connect(new StdioServerTransport());
console.error(`[auditpilot-mcp] ready, acting as ${email}`);
process.on('SIGINT', async () => { await disconnectDb(); process.exit(0); });
process.stdin.on('close', async () => { await disconnectDb(); process.exit(0); });
