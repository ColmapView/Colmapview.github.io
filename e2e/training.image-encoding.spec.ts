import { expect, test } from '@playwright/test';

for (const workers of [0, 1, 2, 4] as const) {
test(`training inputs become full-resolution JPEG Q90 before transfer (${workers} workers)`, async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async (workers) => {
    const poolPath = '/src/training/trainingImageWorkerPool.ts';
    const { configureTrainingImageWorkers, trainingImageWorkers } = await import(poolPath) as typeof import('../src/training/trainingImageWorkerPool');
    configureTrainingImageWorkers(workers);
    const modulePath = '/src/training/trainingImageEncoding.ts';
    const encoding = await import(modulePath) as typeof import('../src/training/trainingImageEncoding');
    const { createSolidTrainingMask, encodeTrainingJpeg, normalizeTrainingMask, TRAINING_JPEG_QUALITY } = encoding;
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 32;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#1d4ed8';
    context.fillRect(0, 0, 64, 32);
    const sourceBlob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error('Could not create source PNG.')),
      'image/png',
    ));
    const source = new File([sourceBlob], 'source.png', { type: 'image/png' });
    const encoded = await Promise.all(Array.from({ length: workers || 1 }, () =>
      encodeTrainingJpeg(source, 'nested/source.jpg', undefined, { dimensions: { width: 64, height: 32 } })));
    const jpeg = encoded[0];
    const workerState = trainingImageWorkers()?.inspect();
    const decoded = await createImageBitmap(jpeg);
    const mask = await normalizeTrainingMask(source, 'nested/source.jpg.png');
    const fallback = await createSolidTrainingMask(64, 32, true, 'nested/missing.jpg.png');
    const fallbackBitmap = await createImageBitmap(fallback);
    const fallbackCanvas = document.createElement('canvas');
    fallbackCanvas.width = fallbackBitmap.width;
    fallbackCanvas.height = fallbackBitmap.height;
    const fallbackContext = fallbackCanvas.getContext('2d')!;
    fallbackContext.drawImage(fallbackBitmap, 0, 0);
    const fallbackPixel = [...fallbackContext.getImageData(0, 0, 1, 1).data];
    const jpegHead = [...new Uint8Array(await jpeg.slice(0, 3).arrayBuffer())];
    const sourceBytes = new Uint8Array(await source.arrayBuffer());
    const maskBytes = new Uint8Array(await mask.arrayBuffer());
    const output = {
      quality: TRAINING_JPEG_QUALITY,
      workerState: workerState ?? null,
      jpegName: jpeg.name,
      jpegType: jpeg.type,
      jpegHead,
      width: decoded.width,
      height: decoded.height,
      maskName: mask.name,
      maskType: mask.type,
      maskUnchanged: sourceBytes.length === maskBytes.length
        && sourceBytes.every((byte, index) => byte === maskBytes[index]),
      fallbackName: fallback.name,
      fallbackType: fallback.type,
      fallbackSize: [fallbackBitmap.width, fallbackBitmap.height],
      fallbackPixel,
    };
    decoded.close();
    fallbackBitmap.close();
    configureTrainingImageWorkers(0);
    return output;
  }, workers);

  expect(result).toEqual({
    quality: 0.9,
    workerState: workers ? { workers, active: 0, queued: 0, unavailable: false } : null,
    jpegName: 'nested/source.jpg',
    jpegType: 'image/jpeg',
    jpegHead: [0xff, 0xd8, 0xff],
    width: 64,
    height: 32,
    maskName: 'nested/source.jpg.png',
    maskType: 'image/png',
    maskUnchanged: true,
    fallbackName: 'nested/missing.jpg.png',
    fallbackType: 'image/png',
    fallbackSize: [64, 32],
    fallbackPixel: [255, 255, 255, 255],
  });
});
}
