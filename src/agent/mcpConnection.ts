import { create } from 'zustand';
import { z } from 'zod';
import { enableAgentControl, disableAgentControl } from './browserBridge';
import { useCommandState } from '../commands/runtime';

export const useMcpConnection = create<{ status: 'disconnected' | 'connecting' | 'connected'; message: string }>(() => ({ status: 'disconnected', message: '' }));
const callSchema = z.strictObject({ type: z.literal('call'), id: z.string().max(128), method: z.enum(['features', 'read', 'execute', 'images']), input: z.unknown().optional() });
let disconnect: (() => void) | undefined;

export function disconnectMcp() { disconnect?.(); }

/** Explicit user pairing only. No URL, storage or automatic reconnect grants. */
export function connectMcp(pairingCode: string, port = 43127): void {
  const parsedCode = /^(?:(\d{1,5}):)?([a-f0-9]{32})$/.exec(pairingCode.trim());
  if (!parsedCode) throw new Error('Paste the pairing code from your agent.');
  if (parsedCode[1]) port = Number(parsedCode[1]);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Use a local port between 1024 and 65535.');
  disconnectMcp();
  const socket = new WebSocket(`ws://127.0.0.1:${port}/`);
  let closed = false;
  let authenticated = false;
  let sessionId: string | null = null;
  let unsubscribe: (() => void) | undefined;
  useMcpConnection.setState({ status: 'connecting', message: 'Waiting for the local MCP bridge…' });
  function stop(message: string) {
    if (closed) return;
    closed = true; clearTimeout(timer); unsubscribe?.();
    disconnect = undefined;
    socket.close();
    if (sessionId && useCommandState.getState().sessionId === sessionId) disableAgentControl();
    useMcpConnection.setState({ status: 'disconnected', message });
  }
  const timer = setTimeout(() => stop('Connection timed out. Ask the agent for a new pairing code.'), 10000);
  disconnect = () => stop('MCP disconnected.');
  socket.onopen = () => socket.send(JSON.stringify({ type: 'pair', code: parsedCode[2] }));
  socket.onerror = () => stop('Cannot connect to the local MCP bridge. Check that your agent started it.');
  socket.onclose = () => stop('MCP disconnected. To reconnect, request a new pairing code.');
  socket.onmessage = async event => {
    if (closed || typeof event.data !== 'string' || event.data.length > 32768) return;
    let message: unknown;
    try { message = JSON.parse(event.data); } catch { stop('Invalid MCP bridge message.'); return; }
    if (!authenticated) {
      if (!z.strictObject({ type: z.literal('paired') }).safeParse(message).success) { stop('MCP pairing failed.'); return; }
      authenticated = true;
      // Browser/WebMCP registration may be asynchronous, but the session is
      // installed synchronously. Capture it now so disconnection can revoke it.
      const enabling = enableAgentControl();
      sessionId = useCommandState.getState().sessionId;
      unsubscribe = useCommandState.subscribe(state => {
        if (state.sessionId !== sessionId) stop('Agent control stopped.');
      });
      await enabling;
      if (closed) return;
      clearTimeout(timer);
      socket.send(JSON.stringify({ type: 'ready', sessionId }));
      useMcpConnection.setState({ status: 'connected', message: 'Connected to your agent through MCP.' });
      return;
    }
    const parsed = callSchema.safeParse(message);
    if (!parsed.success || !sessionId) { stop('Invalid MCP command.'); return; }
    const { id, method, input } = parsed.data;
    try {
      const api = window.colmapAgent;
      if (!api || useCommandState.getState().sessionId !== sessionId) throw new Error('Agent session ended.');
      const result = method === 'read' ? api.readState() : method === 'features' ? api.listFeatures() : method === 'images' ? api.queryImages(input) : api.execute(input);
      socket.send(JSON.stringify({ type: 'result', id, result }));
    } catch (error) {
      if (!closed) socket.send(JSON.stringify({ type: 'result', id, error: error instanceof Error ? error.message : 'Command failed.' }));
    }
  };
}

if (import.meta.hot) import.meta.hot.dispose(disconnectMcp);
