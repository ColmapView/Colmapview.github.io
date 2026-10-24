import { readImageDimensions, readImageOrientation } from '../utils/imageDimensions';
import { MAX_BUFFERED_PUBLICATION_FILE_BYTES } from '../features/datasetPublishing/types';

const PIXEL_LIMIT = 64_000_000;

/** Invert the browser's Exif orientation without resizing the model's source pixels. */
function restorePixelCoordinates(context: OffscreenCanvasRenderingContext2D, orientation: number, width: number, height: number) {
  const transforms: Record<number, [number, number, number, number, number, number]> = {
    2: [-1, 0, 0, 1, width, 0], 3: [-1, 0, 0, -1, width, height], 4: [1, 0, 0, -1, 0, height],
    5: [0, 1, 1, 0, 0, 0], 6: [0, -1, 1, 0, 0, height], 7: [0, -1, -1, 0, width, height], 8: [0, 1, -1, 0, width, 0],
  };
  const transform = transforms[orientation];
  if (transform) context.setTransform(...transform);
}

/** Opt-in lossy publication copies. Masks and display previews never use this encoder. */
export async function encodePublicationJpeg(blob: Blob, quality: number, signal: AbortSignal): Promise<File> {
  signal.throwIfAborted();
  if (!Number.isFinite(quality) || quality < 0 || quality > 1) throw new Error('JPEG quality must be between 0 and 1.');
  if (blob.size > MAX_BUFFERED_PUBLICATION_FILE_BYTES) throw new Error('JPEG source images are limited to 128 MiB.');
  const declared = await readImageDimensions(blob, { signal });
  if (!declared) throw new Error('This image format cannot be converted to JPEG. Choose Source formats instead.');
  if (declared.width * declared.height > PIXEL_LIMIT) throw new Error('JPEG conversion supports up to 64 megapixels per image. Choose Source formats instead.');
  if (typeof createImageBitmap === 'undefined' || typeof OffscreenCanvas === 'undefined') {
    throw new Error('JPEG conversion is unavailable in this browser. Choose Source formats instead.');
  }
  const orientation = await readImageOrientation(blob, signal);
  signal.throwIfAborted();
  let bitmap: ImageBitmap | undefined, canvas: OffscreenCanvas | undefined;
  try {
    // Firefox cannot decode some Exif JPEGs backed by composite Blob parts. Normalize one bounded image in the worker.
    const input = new Blob([await blob.arrayBuffer()], { type: blob.type });
    signal.throwIfAborted();
    bitmap = await createImageBitmap(input, { imageOrientation: 'from-image' });
    signal.throwIfAborted();
    const rotated = orientation >= 5 && orientation <= 8;
    if (bitmap.width !== (rotated ? declared.height : declared.width) || bitmap.height !== (rotated ? declared.width : declared.height)) {
      throw new Error('The decoder changed the image dimensions. Choose Source formats instead.');
    }
    canvas = new OffscreenCanvas(declared.width, declared.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('JPEG conversion is unavailable in this browser. Choose Source formats instead.');
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, declared.width, declared.height);
    restorePixelCoordinates(context, orientation, declared.width, declared.height);
    context.drawImage(bitmap, 0, 0);
    const jpeg = await canvas.convertToBlob({ type: 'image/jpeg', quality });
    signal.throwIfAborted();
    if (jpeg.type !== 'image/jpeg' || !jpeg.size) throw new Error('The browser did not produce a JPEG image.');
    return new File([jpeg], 'image.jpg', { type: 'image/jpeg' });
  } finally {
    bitmap?.close();
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}
