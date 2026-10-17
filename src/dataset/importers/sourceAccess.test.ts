import { File as NodeFile } from 'node:buffer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readBoundedResponseFile } from './sourceAccess';
beforeEach(() => vi.stubGlobal('File', NodeFile));
afterEach(() => vi.unstubAllGlobals());
it('bounds actual response bytes even without Content-Length', async () => {
  const cancel = vi.fn();
  const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(6)); controller.enqueue(new Uint8Array(6)); }, cancel });
  await expect(readBoundedResponseFile(new Response(stream), 'photo.png', 10)).rejects.toThrow(/budget/);
  expect(cancel).toHaveBeenCalled();
});
it('rejects oversized advertised bodies before reading and preserves successful bytes', async () => {
  await expect(readBoundedResponseFile(new Response('big',{headers:{'content-length':'100'}}),'a',10)).rejects.toThrow(/budget/);
  const file = await readBoundedResponseFile(new Response(new Uint8Array([1,2,3])),'a',10);
  expect(new Uint8Array(await file.arrayBuffer())).toEqual(new Uint8Array([1,2,3]));
});
it('aborts a stalled response body', async () => {
  const controller = new AbortController();
  const stream = new ReadableStream<Uint8Array>({ start() {} });
  const promise = readBoundedResponseFile(new Response(stream),'a',10,controller.signal);
  controller.abort();
  await expect(promise).rejects.toMatchObject({name:'AbortError'});
});
