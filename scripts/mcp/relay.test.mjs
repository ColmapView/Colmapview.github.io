import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createRelay } from './relay.mjs';

test('requires an allowed origin and a fresh pairing code', async () => {
  const relay = await createRelay({ port: 0 });
  try {
    const denied = new WebSocket(`ws://127.0.0.1:${relay.port}`, { origin: 'https://untrusted.example' });
    await assert.rejects(new Promise((resolve, reject) => { denied.on('open', resolve); denied.on('error', reject); }), /401/);
    const ws = new WebSocket(`ws://127.0.0.1:${relay.port}`, { origin: 'http://localhost:5173' });
    await new Promise(resolve => ws.on('open', resolve));
    ws.send(JSON.stringify({ type: 'pair', code: '0'.repeat(32) }));
    await new Promise(resolve => ws.on('close', resolve));
    assert.equal(relay.status().connected, false);
    await assert.rejects(relay.call('read'), /No paired tab/);
    assert.match(relay.pair().pairingCode, /^[a-f0-9]{32}$/);
  } finally { await relay.close(); }
});

test('times out missing replies without claiming success and rejects on disconnect', async () => {
  const relay = await createRelay({ port: 0, timeoutMs: 30 });
  try {
    const ws = new WebSocket(`ws://127.0.0.1:${relay.port}`, { origin: 'http://localhost:5173' });
    await new Promise(resolve => ws.on('open', resolve));
    const paired = new Promise(resolve => ws.once('message', resolve));
    ws.send(JSON.stringify({ type: 'pair', code: relay.pair().pairingCode }));
    await paired;
    ws.send(JSON.stringify({ type: 'ready', sessionId: 'test-session' }));
    // Wait for the ready frame to be processed, not an arbitrary sleep.
    await new Promise(resolve => { ws.ping(); ws.once('pong', resolve); });
    await assert.rejects(relay.call('read'), /timed out/);
    const pending = assert.rejects(relay.call('read'), /disconnected/);
    ws.close();
    await pending;
  } finally { await relay.close(); }
});
