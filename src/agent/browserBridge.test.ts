import { afterEach, expect, it, vi } from 'vitest';
import { enableAgentControl, disableAgentControl } from './browserBridge';
import { disposeCommands } from '../commands/runtime';

afterEach(() => {
  disableAgentControl(); disposeCommands(); vi.useRealTimers();
  Reflect.deleteProperty(document, 'modelContext');
});
it('is opt-in, works without WebMCP, and revokes retained bridges', async () => {
  expect(window.colmapAgent).toBeUndefined();
  expect(await enableAgentControl()).toContain('Browser bridge ready');
  const previous = window.colmapAgent!;
  expect(previous.listFeatures().features.length).toBeGreaterThan(50);
  disableAgentControl();
  expect(window.colmapAgent).toBeUndefined();
  expect(() => previous.readState()).toThrow();
  await enableAgentControl();
  expect(() => previous.readState()).toThrow();
});
it('registers native tools and aborts their registration on stop', async () => {
  const registerTool = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(document, 'modelContext', { configurable: true, value: { registerTool } });
  expect(await enableAgentControl()).toContain('WebMCP tools');
  expect(registerTool).toHaveBeenCalledTimes(4);
  const [tool, options] = registerTool.mock.calls[1];
  const result = JSON.parse(await tool.execute({}, {}));
  expect(result.protocolVersion).toBe(1);
  expect(result.sessionId).toBeTruthy();
  disableAgentControl();
  expect(options.signal.aborted).toBe(true);
  await expect(tool.execute({}, {})).rejects.toThrow();
});
it('keeps the browser bridge usable after failed native registration', async () => {
  const registerTool = vi.fn().mockRejectedValue(new Error('not supported'));
  Object.defineProperty(document, 'modelContext', { configurable: true, value: { registerTool } });
  expect(await enableAgentControl()).toContain('registration was unavailable');
  expect(window.colmapAgent!.readState().sessionId).toBeTruthy();
  expect(registerTool.mock.calls[0][1].signal.aborted).toBe(true);
});
it('expires without needing another command', async () => {
  vi.useFakeTimers();
  await enableAgentControl();
  vi.advanceTimersByTime(30 * 60 * 1000);
  expect(window.colmapAgent).toBeUndefined();
});
it('does not finish registering a session stopped during registration', async () => {
  let finish!: () => void;
  const registerTool = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  Object.defineProperty(document, 'modelContext', { configurable: true, value: { registerTool } });
  const pending = enableAgentControl();
  disableAgentControl();
  finish();
  expect(await pending).toContain('stopped');
  expect(registerTool).toHaveBeenCalledTimes(1);
  expect(window.colmapAgent).toBeUndefined();
});
