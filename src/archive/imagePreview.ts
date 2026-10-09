import { getCacheResizeDimensions, URL_IMAGE_JPEG_QUALITY, type CacheDimensionBounds } from '../utils/imageFileCachePolicy';

/** Originals never pass through this path; previews are disposable display assets. */
export async function createArchiveImagePreview(file: File, bounds: CacheDimensionBounds): Promise<File> {
  if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') return file;
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(file);
    const { width, height } = getCacheResizeDimensions(bitmap, bounds);
    if (file.type === 'image/jpeg' && width === bitmap.width && height === bitmap.height) return file;
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
    if (width === bitmap.width && height === bitmap.height && blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]+$/, blob.type === 'image/png' ? '.png' : '.jpg');
    return new File([blob], name, { type: blob.type, lastModified: file.lastModified });
  } catch {
    // Browser-unsupported image encodings still follow the viewer's existing decode/error path.
    return file;
  } finally { bitmap?.close(); }
}
