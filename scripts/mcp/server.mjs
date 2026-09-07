import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createRelay } from './relay.mjs';

const port = Number(process.env.COLMAP_MCP_PORT ?? 0);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid COLMAP_MCP_PORT');
const origins = process.env.COLMAP_MCP_ORIGINS?.split(',').map(value => new URL(value.trim()).origin);
const relay = await createRelay({ port, ...(origins ? { origins } : {}) });
const server = new McpServer({ name: 'colmapview', version: '1.0.0' }, {
  instructions: 'Use colmap_status first. If no tab is connected, call colmap_pair and ask the user to paste the code in Settings → Agent controls → Connect MCP. Never use computer-use or DOM automation to operate the app. Discover supported feature schemas before setting values. Reuse requestId only for identical retries. Timeouts may mean an unknown outcome; inspect state. Success means state applied, not a rendered frame; dataset.loadUrl only accepts a job, so poll read state until it finishes.',
});
const result = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }], ...(value?.status === 'failed' ? { isError: true } : {}) });
const register = (name, description, inputSchema, readOnly, handler) => server.registerTool(name, {
  description, inputSchema, annotations: { readOnlyHint: readOnly, destructiveHint: false, openWorldHint: false },
}, async input => {
  try { return result(await handler(input)); }
  catch (error) { return { isError: true, content: [{ type: 'text', text: error.message }] }; }
});
register('colmap_pair', 'Generate a five-minute single-use code. The user pastes it into the intended tab. Never pair another tab automatically.', {}, false, () => {
  const pairing = relay.pair();
  return { ...pairing, pairingCode: `${pairing.port}:${pairing.pairingCode}` };
});
register('colmap_status', 'Check whether the user has connected a tab.', {}, true, () => relay.status());
register('colmap_list_features', 'Discover supported contracts, schemas and unsupported workflows in the paired tab.', {}, true, () => relay.call('features'));
register('colmap_read_state', 'Read current settings, transform preview, revision and dataset generation.', {}, true, () => relay.call('read'));
register('colmap_query_images', 'List dataset image IDs/names in pages. Pass returned datasetGeneration on later pages to reject dataset changes.', {
  offset: z.number().int().nonnegative().max(10_000_000).default(0), limit: z.number().int().min(1).max(100).default(50),
  datasetGeneration: z.number().int().nonnegative().optional(),
}, true, args => relay.call('images', args));
register('colmap_set_feature', 'Apply one supported feature. The bridge handles revisions. Use a unique requestId; for transport retries reuse it with identical input. Success means state applied, not frame rendered; dataset.loadUrl accepts a non-cancellable job, poll read state for completion.', {
  requestId: z.string().min(1).max(128), feature: z.string().min(1).max(128), input: z.record(z.string(), z.unknown()),
}, false, args => relay.execute(args));
register('colmap_undo', 'Undo the latest command, provided no conflicting human or dataset changes intervened.', {
  requestId: z.string().min(1).max(128),
}, false, args => relay.execute({ ...args, feature: 'history', operation: 'undo', input: {} }));
await server.connect(new StdioServerTransport());
let closing = false;
async function close() { if (closing) return; closing = true; await relay.close(); await server.close(); }
process.stdin.on('end', () => { void close(); });
process.on('SIGTERM', () => { void close(); });
process.on('SIGINT', () => { void close(); });
