import { VIEWPORT_FALLBACK } from '../theme/sizing';
import { appLogger } from './logger';
import {
  URL_IMAGE_JPEG_QUALITY,
  getBoundedCacheDimensions,
  getCacheResizeDimensions,
  getJpegCacheFilename,
  type CacheDimensionBounds,
} from './imageFileCachePolicy';
import { isOffscreenCanvas } from './canvasTypeGuards';

export interface ImageCompressionCanvas {
  drawImage(bitmap: ImageBitmap, width: number, height: number): void;
  toBlob(type: string, quality: number): Promise<Blob>;
}

export interface ImageCompressionOptions {
  decode?: (blob: Blob) => Promise<ImageBitmap>;
  createCanvas?: (width: number, height: number) => ImageCompressionCanvas | null;
  getBounds?: () => CacheDimensionBounds;
  warn?: (...data: unknown[]) => void;
}

/**
 * Compress and resize an image blob to cached JPEG form.
 */
export async function compressAndResizeToJpeg(
  blob: Blob,
  filename: string,
  options: ImageCompressionOptions = {}
): Promise<File> {
  const warn = options.warn ?? appLogger.warn;

  try {
    const decode = options.decode ?? createImageBitmap;
    const bitmap = await decode(blob);
    const { maxWidth, maxHeight } = options.getBounds?.() ?? getMaxCacheDimensions();
    const { width, height } = getCacheResizeDimensions(
      { width: bitmap.width, height: bitmap.height },
      { maxWidth, maxHeight }
    );
    const canvas = (options.createCanvas ?? createBrowserCompressionCanvas)(width, height);

    if (!canvas) {
      bitmap.close();
      return new File([blob], filename, { type: blob.type || 'image/png' });
    }

    canvas.drawImage(bitmap, width, height);
    bitmap.close();

    const jpegBlob = await canvas.toBlob('image/jpeg', URL_IMAGE_JPEG_QUALITY);
    return new File([jpegBlob], getJpegCacheFilename(filename), { type: 'image/jpeg' });
  } catch (err) {
    warn('[URL Image] Compression failed, using original:', err);
    return new File([blob], filename, { type: blob.type || 'application/octet-stream' });
  }
}

function getMaxCacheDimensions(): CacheDimensionBounds {
  return getBoundedCacheDimensions({
    devicePixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio : 1,
    screenWidth: typeof screen !== 'undefined' ? screen.width : VIEWPORT_FALLBACK.width,
    screenHeight: typeof screen !== 'undefined' ? screen.height : VIEWPORT_FALLBACK.height,
  });
}

function createBrowserCompressionCanvas(
  width: number,
  height: number
): ImageCompressionCanvas | null {
  let canvas: OffscreenCanvas | HTMLCanvasElement;
  let ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;

  if (typeof OffscreenCanvas !== 'undefined') {
    canvas = new OffscreenCanvas(width, height);
    ctx = canvas.getContext('2d');
  } else {
    canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    ctx = canvas.getContext('2d');
  }

  if (!ctx) {
    return null;
  }

  return {
    drawImage(bitmap: ImageBitmap, targetWidth: number, targetHeight: number): void {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    },
    toBlob(type: string, quality: number): Promise<Blob> {
      if (isOffscreenCanvas(canvas)) {
        return canvas.convertToBlob({ type, quality });
      }

      return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob: Blob | null) => blob ? resolve(blob) : reject(new Error('Failed to create blob')),
          type,
          quality
        );
      });
    },
  };
}
