import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';

/** One MCP process controls one explicitly paired tab. No discovery of other tabs. */
export async function createRelay({ port = 43127, origins = ['http://localhost:5173', 'http://127.0.0.1:5173', 'https://colmapview.github.io'], timeoutMs = 15000 } = {}) {
  let active;
  let pairing;
  const pending = new Map();
  const prepared = new Map();
  const server = new WebSocketServer({ host: '127.0.0.1', port, maxPayload: 512 * 1024,
    verifyClient: ({ origin, req }) => origins.includes(origin) && req.headers.host === `127.0.0.1:${server.address().port}` && req.url === '/',
  });
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const actualPort = server.address().port;
  function rejectPending(message) {
    for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error(message)); }
    pending.clear();
  }
  server.on('connection', socket => {
    socket.on('error', () => {});
    if (server.clients.size > 8 || active) { socket.close(1008, 'Already connected or busy'); return; }
    let authenticated = false;
    const timer = setTimeout(() => socket.close(1008, 'Pairing timed out'), 10000);
    socket.on('close', () => {
      clearTimeout(timer);
      if (active?.socket === socket) { active = undefined; prepared.clear(); rejectPending('Tab disconnected. A mutation may have completed; inspect state before retrying.'); }
    });
    socket.on('message', bytes => {
      let message;
      try { message = JSON.parse(bytes.toString()); } catch { socket.close(1008, 'Invalid JSON'); return; }
      if (!authenticated) {
        if (!pairing || Date.now() >= pairing.expiresAt || typeof message?.code !== 'string' || !/^[a-f0-9]{32}$/.test(message.code)
          || message.type !== 'pair' || !timingSafeEqual(Buffer.from(message.code), Buffer.from(pairing.code))) {
          if (pairing && ++pairing.failures >= 32) pairing = undefined;
          socket.close(1008, 'Invalid or expired pairing code'); return;
        }
        pairing = undefined;
        authenticated = true;
        active = { socket, ready: false };
        socket.send(JSON.stringify({ type: 'paired' }));
        return;
      }
      if (message?.type === 'ready' && typeof message.sessionId === 'string' && active?.socket === socket && !active.ready) {
        clearTimeout(timer); active.ready = true; active.sessionId = message.sessionId; return;
      }
      if (message?.type !== 'result' || typeof message.id !== 'string') return;
      const item = pending.get(message.id);
      if (!item || active?.socket !== socket) return;
      pending.delete(message.id); clearTimeout(item.timer);
      if (typeof message.error === 'string') item.reject(new Error(message.error));
      else item.resolve(message.result);
    });
  });
  function call(method, input) {
    if (!active?.ready || active.socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error('No paired tab. Call colmap_pair, then connect from Settings → Agent controls.'));
    if (pending.size >= 32) return Promise.reject(new Error('Too many pending commands.'));
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('Tab response timed out. Outcome may be unknown; retry the same requestId or inspect state.')); }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      active.socket.send(JSON.stringify({ type: 'call', id, method, input }));
    });
  }
  // Serialize preparation + dispatch so concurrent tool calls don't race revisions.
  let queue = Promise.resolve();
  let queued = 0;
  function execute({ requestId, feature, operation = 'set', input }) {
    if (queued >= 32) return Promise.reject(new Error('Command queue is full.'));
    queued++;
    const target = active;
    const run = queue.then(async () => {
      if (!target?.ready || active !== target) throw new Error('The paired session changed before this command could run.');
      const fingerprint = JSON.stringify({ feature, operation, input });
      if (fingerprint.length > 16384) throw new Error('Command is too large.');
      const existing = prepared.get(requestId);
      if (existing && existing.fingerprint !== fingerprint) throw new Error('requestId already used with different arguments.');
      if (!existing && prepared.size >= 1000) throw new Error('Session command limit reached. Reconnect from Settings.');
      let envelope = existing?.envelope;
      if (!envelope) {
        const state = await call('read');
        envelope = { protocolVersion: 1, sessionId: state.sessionId, requestId, feature, operation,
          expectedRevision: state.revision, datasetGeneration: state.datasetGeneration, input };
        prepared.set(requestId, { fingerprint, envelope });
      }
      return call('execute', envelope);
    });
    queue = run.catch(() => {}).finally(() => { queued--; });
    return run;
  }
  return {
    port: actualPort, call, execute,
    pair: () => {
      if (active) throw new Error('A tab is already paired. Disconnect it before pairing another.');
      pairing = { code: randomBytes(16).toString('hex'), expiresAt: Date.now() + 300000, failures: 0 };
      return { pairingCode: pairing.code, port: actualPort, expiresAt: new Date(pairing.expiresAt).toISOString(),
        instructions: 'In the desired ColmapView tab, open Settings → Agent controls, paste this code in MCP pairing code, and click Connect MCP. The code is single-use.' };
    },
    status: () => ({ connected: Boolean(active?.ready), sessionId: active?.ready ? active.sessionId : null, port: actualPort }),
    close: async () => { pairing = undefined; rejectPending('MCP bridge stopped'); for (const socket of server.clients) socket.terminate(); await new Promise(resolve => server.close(resolve)); },
  };
}
