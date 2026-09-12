import { expect, test } from '@playwright/test';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

const directory = process.env.COLMAP_TRAIN_ENCODING_DATASET;
const count = Number(process.env.COLMAP_TRAIN_ENCODING_LIMIT ?? '0');

test('compare baseline and worker encoding on identical local source files', async ({ page }, testInfo) => {
  test.skip(!directory, 'Set COLMAP_TRAIN_ENCODING_DATASET to a local directory of source JPEGs.');
  test.setTimeout(600_000);
  const entries = (await readdir(directory!)).filter(name => /\.(jpe?g|png|webp)$/i.test(name)).sort();
  const paths = (count > 0 ? entries.slice(0, count) : entries).map(name => join(directory!, name));
  expect(paths.length).toBeGreaterThan(0);
  await page.goto('/');
  await page.evaluate(() => {
    const input = document.createElement('input');
    input.type = 'file'; input.multiple = true; input.id = 'encoding-benchmark';
    document.body.appendChild(input);
  });
  // Browser-owned File objects, without base64 materialization in the test runner.
  await page.locator('#encoding-benchmark').setInputFiles(paths);
  // Production gets dimensions from cameras. This encoder-only harness has no
  // reconstruction: discover them once outside timing and close each bitmap.
  const dimensions = await page.evaluate(async () => {
    const result = [];
    for (const source of document.querySelector<HTMLInputElement>('#encoding-benchmark')!.files!) {
      const bitmap = await createImageBitmap(source, { imageOrientation: 'none' });
      try { result.push({ width: bitmap.width, height: bitmap.height }); }
      finally { bitmap.close(); }
    }
    return result;
  });
  const results = [];
  // Rotate candidates between repetitions instead of giving one a fixed cache order.
  for (const order of [[0, 2, 4], [2, 4, 0], [4, 0, 2]] as const) {
    for (const workers of order) {
      const receipt = await page.evaluate(async ({ workers, dimensions }) => {
        const encoderPath = '/src/training/trainingImageEncoding.ts';
        const poolPath = '/src/training/trainingImageWorkerPool.ts';
        const { encodeTrainingJpeg } = await import(encoderPath) as typeof import('../src/training/trainingImageEncoding');
        const { configureTrainingImageWorkers, trainingImageWorkers } = await import(poolPath) as typeof import('../src/training/trainingImageWorkerPool');
        configureTrainingImageWorkers(workers);
        const sources = [...document.querySelector<HTMLInputElement>('#encoding-benchmark')!.files!];
        let next = 0, outputBytes = 0;
        let maxFrameGapMs = 0, previousFrame = performance.now(), frame = 0;
        const tick = (now: number) => {
          maxFrameGapMs = Math.max(maxFrameGapMs, now - previousFrame);
          previousFrame = now; frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        const start = performance.now();
        try {
          await Promise.all(Array.from({ length: Math.min(4, sources.length) }, async () => {
            while (next < sources.length) {
              const index = next++;
              const source = sources[index];
              const output = await encodeTrainingJpeg(source, 'benchmark.jpg', undefined, { dimensions: dimensions[index] });
              outputBytes += output.size;
            }
          }));
          return { workers, elapsedMs: performance.now() - start, maxFrameGapMs,
            sourceFiles: sources.length, sourceBytes: sources.reduce((sum, source) => sum + source.size, 0),
            outputBytes, pool: trainingImageWorkers()?.inspect() ?? null };
        } finally { cancelAnimationFrame(frame); configureTrainingImageWorkers(0); }
      }, { workers, dimensions });
      results.push(receipt);
      console.log(JSON.stringify(receipt));
    }
  }
  await testInfo.attach('encoding-performance.json', { contentType: 'application/json', body: JSON.stringify({
    scope: 'encoding-only; no upload or trainer startup; four caller slots; source dimensions decoded once before timing',
    browser: page.context().browser()?.version(), results,
  }, null, 2) });
});
