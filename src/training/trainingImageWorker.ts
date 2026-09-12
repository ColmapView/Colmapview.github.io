import { encodeRasterImage, encodeSolidRasterImage } from '../utils/imageRasterEncoding';
import { TRAINING_JPEG_QUALITY, TRAINING_JPEG_DECODE_OPTIONS, TRAINING_MASK_DECODE_OPTIONS,
  type TrainingImageRequest, type TrainingImageResponse } from './trainingImagePolicy';

// Keep DOM and WebWorker libraries independent: this worker needs only this
// narrow message surface, while the shared raster helper also serves DOM callers.
const worker = globalThis as unknown as {
  postMessage(message: TrainingImageResponse): void;
  onmessage: ((event: MessageEvent<TrainingImageRequest>) => void) | null;
};

worker.onmessage = event => {
  const request = event.data;
  if (request.type !== 'encode') return;
  void (async () => {
    const started = performance.now();
    let width = 0, height = 0;
    try {
      const jpeg = request.operation === 'jpeg-q90';
      const blob = await encodeRasterImage(request.source, jpeg ? 'image/jpeg' : 'image/png',
        jpeg ? TRAINING_JPEG_QUALITY : undefined, {
          decodeOptions: jpeg ? TRAINING_JPEG_DECODE_OPTIONS : TRAINING_MASK_DECODE_OPTIONS,
          decode: async (source, options) => {
            const bitmap = await createImageBitmap(source, options);
            width = bitmap.width; height = bitmap.height;
            return bitmap;
          },
        });
      worker.postMessage({ type: 'encoded', attemptId: request.attemptId, taskId: request.taskId,
        blob, width, height, elapsedMs: performance.now() - started });
    } catch (error) {
      worker.postMessage({ type: 'error', attemptId: request.attemptId, taskId: request.taskId,
        message: error instanceof Error ? error.message : 'Image encoding failed.' });
    }
  })();
};

// A real worker-local encode/decode probe covers CSP/startup and codec support;
// successful window-level feature detection alone does not establish this.
void (async () => {
  try {
    const png = await encodeSolidRasterImage(1, 1, 'image/png', '#fff');
    await encodeRasterImage(png, 'image/jpeg', TRAINING_JPEG_QUALITY,
      { decodeOptions: TRAINING_JPEG_DECODE_OPTIONS });
    worker.postMessage({ type: 'ready' });
  } catch { worker.postMessage({ type: 'unavailable' }); }
})();
