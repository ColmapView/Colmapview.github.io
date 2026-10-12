import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyPublicationZip } from './verifyPublicationZip';

afterEach(() => vi.restoreAllMocks());
const url = 'https://bucket.example/dataset.zip';
const signal = () => new AbortController().signal;

describe('ZIP upload verification', () => {
  it.each([200, 206])('verifies the size and cancels the %s body after the signature without reading the whole archive', async status => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array([0x50, 0x4b])); controller.enqueue(new Uint8Array([3, 4, 99])); }, cancel,
    });
    const request = vi.fn().mockResolvedValueOnce(new Response(null, { headers: { 'Content-Length': '1000' } }))
      .mockResolvedValueOnce(new Response(stream, { status }));
    await verifyPublicationZip(url, 1000, request, signal());
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1][1].headers).toEqual({ Range: 'bytes=0-3' });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each([undefined, '999', '1001'])('refuses an unconfirmed or changed object size: %s', async size => {
    const request = vi.fn().mockResolvedValue(new Response(null, { headers: size ? { 'Content-Length': size } : {} }));
    await expect(verifyPublicationZip(url, 1000, request, signal())).rejects.toThrow('size could not be verified');
    expect(request).toHaveBeenCalledOnce();
  });

  it.each([{ bytes: [0x50, 0x4b] }, { bytes: [1, 2, 3, 4] }])('refuses a truncated or invalid ZIP signature: $bytes', async ({ bytes }) => {
    const request = vi.fn().mockResolvedValueOnce(new Response(null, { headers: { 'Content-Length': '1000' } }))
      .mockResolvedValueOnce(new Response(new Uint8Array(bytes), { status: 206 }));
    await expect(verifyPublicationZip(url, 1000, request, signal())).rejects.toThrow(/incomplete|not the prepared ZIP/);
  });

  it('cancels a stalled verification read', async () => {
    const controller = new AbortController();
    const cancel = vi.fn();
    const request = vi.fn().mockResolvedValueOnce(new Response(null, { headers: { 'Content-Length': '1000' } }))
      .mockImplementationOnce(async () => {
        setTimeout(() => controller.abort(), 0);
        return new Response(new ReadableStream({ cancel }));
      });
    await expect(verifyPublicationZip(url, 1000, request, controller.signal)).rejects.toThrow();
    expect(cancel).toHaveBeenCalledOnce();
  });
});
