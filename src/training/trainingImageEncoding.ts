import { encodeRasterImage, encodeSolidRasterImage, type RasterEncodingOptions } from '../utils/imageRasterEncoding';
import { currentTrainingTiming } from './trainingTiming';
import { trainingImageWorkers } from './trainingImageWorkerPool';
import { withTrainingRasterBudget, type TrainingRasterDimensions } from './trainingPreparationBudget';
import { TRAINING_JPEG_QUALITY, TRAINING_JPEG_DECODE_OPTIONS, TRAINING_MASK_DECODE_OPTIONS } from './trainingImagePolicy';

export { TRAINING_JPEG_QUALITY } from './trainingImagePolicy';

export async function encodeTrainingJpeg(
  source: File,
  outputName: string,
  signal?: AbortSignal,
  options: Omit<RasterEncodingOptions, 'signal' | 'decodeOptions'> & { dimensions?: TrainingRasterDimensions } = {},
): Promise<File> {
  const timing = currentTrainingTiming();
  const encode = async () => {
    signal?.throwIfAborted();
    const pool = options.decode || options.createCanvas ? null : trainingImageWorkers();
    const workerResult = await pool?.encode(source, 'jpeg-q90', timing?.attemptId ?? 'standalone', signal);
    signal?.throwIfAborted();
    return workerResult ?? encodeRasterImage(source, 'image/jpeg', TRAINING_JPEG_QUALITY, {
      ...options, signal, decodeOptions: TRAINING_JPEG_DECODE_OPTIONS,
    });
  };
  const boundedEncode = () => withTrainingRasterBudget(options.dimensions, signal, encode);
  const encoded = await (timing?.measure('jpeg_encode', boundedEncode) ?? boundedEncode());
  timing?.add('jpeg_source_bytes', source.size);
  timing?.add('jpeg_encoded_bytes', encoded.size);
  return new File([encoded], outputName, { type: 'image/jpeg' });
}

export async function normalizeTrainingMask(
  source: File,
  outputName: string,
  signal?: AbortSignal,
  options: Omit<RasterEncodingOptions, 'signal' | 'decodeOptions'> & { dimensions?: TrainingRasterDimensions } = {},
): Promise<File> {
  signal?.throwIfAborted();
  if (await hasPngSignature(source, signal)) {
    return new File([source], outputName, { type: 'image/png', lastModified: source.lastModified });
  }
  const encoded = await withTrainingRasterBudget(options.dimensions, signal, async () => {
    const pool = options.decode || options.createCanvas ? null : trainingImageWorkers();
    const workerResult = await pool?.encode(source, 'mask-png', currentTrainingTiming()?.attemptId ?? 'standalone', signal);
    signal?.throwIfAborted();
    return workerResult ?? await encodeRasterImage(source, 'image/png', undefined, {
      ...options, signal, decodeOptions: TRAINING_MASK_DECODE_OPTIONS,
    });
  });
  return new File([encoded], outputName, { type: 'image/png' });
}

/** Build a lossless mask for a view that has no supplied directory mask. */
export async function createSolidTrainingMask(
  width: number,
  height: number,
  foreground: boolean,
  outputName: string,
  signal?: AbortSignal,
  options: Omit<RasterEncodingOptions, 'signal' | 'decode' | 'decodeOptions'> = {},
): Promise<File> {
  const encoded = await withTrainingRasterBudget({ width, height }, signal, () => encodeSolidRasterImage(width, height, 'image/png', foreground ? '#fff' : '#000', {
    ...options,
    signal,
  }));
  return new File([encoded], outputName, { type: 'image/png' });
}

async function hasPngSignature(source: Blob, signal?: AbortSignal): Promise<boolean> {
  const head = source.slice(0, 8);
  const buffer = typeof head.arrayBuffer === 'function' ? await head.arrayBuffer() : await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(head);
  });
  const signature = new Uint8Array(buffer);
  signal?.throwIfAborted();
  return signature.length === 8
    && signature[0] === 0x89 && signature[1] === 0x50 && signature[2] === 0x4e && signature[3] === 0x47
    && signature[4] === 0x0d && signature[5] === 0x0a && signature[6] === 0x1a && signature[7] === 0x0a;
}
