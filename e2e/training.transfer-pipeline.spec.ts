import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';

test('resident payload budget includes real in-flight browser uploads', async ({ page }) => {
  const prepared: number[] = [];
  const requests: Array<{ bytes: number; validHash: boolean }> = [];
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.exposeFunction('recordTransferPreparation', (entry: number) => { prepared.push(entry); });
  // No viewer or GPU rendering: exercise browser transfer primitives only.
  await page.route('**/transfer-pipeline-harness', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><title>Transfer test</title>',
  }));
  await page.route('**/transfer-pipeline-sink/*', async route => {
    const body = route.request().postDataBuffer()!;
    requests.push({ bytes: body.length,
      validHash: createHash('sha256').update(body).digest('hex') === route.request().headers()['x-content-sha256'] });
    if (requests.length === 1) await held;
    await route.fulfill({ status: 200, body: 'ok' });
  });
  await page.goto('/transfer-pipeline-harness');
  const pending = page.evaluate(async () => {
    const pipelinePath = '/src/training/trainingTransferPipeline.ts';
    const integrityPath = '/src/training/trainingIntegrity.ts';
    const { runTrainingTransferPipeline } = await import(pipelinePath) as typeof import('../src/training/trainingTransferPipeline');
    const { sha256Hex } = await import(integrityPath) as typeof import('../src/training/trainingIntegrity');
    const prepared = (window as unknown as { recordTransferPreparation(entry: number): Promise<void> }).recordTransferPreparation;
    await runTrainingTransferPipeline([0, 1, 2, 3], new AbortController().signal,
      { preparations: 4, uploads: 4, waitingFiles: 4, waitingBytes: 16 * 1024, residentBytes: 10 * 1024 },
      () => 8 * 1024, async entry => {
        await prepared(entry);
        return new Blob([new Uint8Array(8 * 1024).fill(entry)]);
      }, blob => blob.size, async (entry, blob, signal) => {
        const sha256 = await sha256Hex(blob);
        const response = await fetch(`/transfer-pipeline-sink/${entry}`, {
          method: 'PUT', body: blob, signal, headers: { 'X-Content-SHA256': sha256 },
        });
        if (!response.ok) throw new Error('Fixture upload failed');
      });
    return 'complete';
  });
  try {
    await expect.poll(() => requests.length).toBe(1);
    expect(prepared).toEqual([0]);
  } finally {
    release();
  }
  expect(await pending).toBe('complete');
  expect(prepared).toEqual([0, 1, 2, 3]);
  expect(requests).toEqual(Array.from({ length: 4 }, () => ({ bytes: 8192, validHash: true })));
});
