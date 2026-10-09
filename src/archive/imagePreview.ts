import { getCacheResizeDimensions, URL_IMAGE_JPEG_QUALITY, URL_IMAGE_MAX_DIMENSION, type CacheDimensionBounds } from '../utils/imageFileCachePolicy';
import { readImageDimensions } from '../utils/imageDimensions';

export const ARCHIVE_PREVIEW_PIXEL_LIMIT = 64_000_000;
const RESIZED_BITMAP_PIXEL_LIMIT = 4 * URL_IMAGE_MAX_DIMENSION ** 2;
class ArchivePreviewLimitError extends Error {}

/** Originals never pass through this path; previews are disposable display assets. */
export async function createArchiveImagePreview(file: File, bounds: CacheDimensionBounds, signal?: AbortSignal): Promise<File> {
  const declared = await readImageDimensions(file, { applyOrientation: true, signal });
  signal?.throwIfAborted();
  if (!declared) throw new Error('Archive image dimensions could not be read.');
  if (declared.width * declared.height > ARCHIVE_PREVIEW_PIXEL_LIMIT) {
    throw new ArchivePreviewLimitError('Archive image previews are limited to 64 megapixels. The original remains available for export.');
  }
  const limits = {
    maxWidth: Math.max(1, Math.min(bounds.maxWidth, URL_IMAGE_MAX_DIMENSION)),
    maxHeight: Math.max(1, Math.min(bounds.maxHeight, URL_IMAGE_MAX_DIMENSION)),
  };
  const target = getCacheResizeDimensions(declared, limits);
  const unchanged = target.width === declared.width && target.height === declared.height;
  if (file.type === 'image/jpeg' && unchanged) return file;
  if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') return file;
  let bitmap: ImageBitmap | undefined;
  try {
    // One resize dimension preserves the decoder's actual orientation/aspect ratio across browsers.
    // For extreme aspect ratios, the already-checked source is safer than a potentially upscaled decode.
    const aspect = Math.max(declared.width / declared.height, declared.height / declared.width);
    const options: ImageBitmapOptions = target.width ** 2 * aspect <= RESIZED_BITMAP_PIXEL_LIMIT
      ? { resizeWidth: target.width, resizeQuality: 'high' } : {};
    bitmap = await createImageBitmap(file, options);
    signal?.throwIfAborted();
    if (bitmap.width * bitmap.height > ARCHIVE_PREVIEW_PIXEL_LIMIT) throw new ArchivePreviewLimitError('Decoded archive image exceeds the preview pixel limit.');
    const { width, height } = getCacheResizeDimensions(bitmap, limits);
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d', { willReadFrequently: file.type !== 'image/jpeg' });
    if (!context) return file;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, width, height);
    let transparent = false;
    if (file.type !== 'image/jpeg') {
      const rgba = context.getImageData(0, 0, width, height).data;
      for (let offset = 3; offset < rgba.length; offset += 4) {
        if (rgba[offset] !== 255) { transparent = true; break; }
      }
    }
    const type = transparent ? 'image/png' : 'image/jpeg';
    const blob = await canvas.convertToBlob({ type, quality: URL_IMAGE_JPEG_QUALITY });
    signal?.throwIfAborted();
    if (unchanged && blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]+$/, blob.type === 'image/png' ? '.png' : '.jpg');
    return new File([blob], name, { type: blob.type, lastModified: file.lastModified });
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof ArchivePreviewLimitError) throw error;
    // Browser-unsupported image encodings still follow the viewer's existing decode/error path.
    return file;
  } finally { bitmap?.close(); }
}
