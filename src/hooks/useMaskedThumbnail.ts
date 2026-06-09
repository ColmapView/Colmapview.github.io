import { useEffect, useMemo, useState } from 'react';
import { getResizedImageDimensions } from './asyncImageCachePolicy';
import {
  createBrowserImageCacheCanvas,
  type ImageCacheCanvas,
  type ImageCacheCanvasFactory,
} from './asyncImageCanvas';
import { isOffscreenCanvas } from '../utils/canvasTypeGuards';

const MASKED_THUMBNAIL_SIZE = 256;

const maskedThumbnailCache = new Map<string, string>();
const maskedThumbnailLoads = new Map<string, Promise<string | null>>();
let maskedThumbnailCacheGeneration = 0;

type Canvas2DContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function getCanvasContext(canvas: ImageCacheCanvas): Canvas2DContext | null {
  return isOffscreenCanvas(canvas) ? canvas.getContext('2d') : canvas.getContext('2d');
}

function getFileCacheKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function getMaskedThumbnailCacheKey(imageName: string, imageFile: File, maskFile: File, inverseMask: boolean): string {
  return `${inverseMask ? 'inverse' : 'masked'}|${imageName}|${getFileCacheKey(imageFile)}|${getFileCacheKey(maskFile)}`;
}

function hasUsefulAlpha(maskPixels: Uint8ClampedArray): boolean {
  for (let i = 3; i < maskPixels.length; i += 4) {
    if (maskPixels[i] !== 255) return true;
  }
  return false;
}

export function applyMaskAlphaToImagePixels(
  imagePixels: Uint8ClampedArray,
  maskPixels: Uint8ClampedArray,
  inverseMask = false
): void {
  const useMaskAlpha = hasUsefulAlpha(maskPixels);
  const pixelCount = Math.min(imagePixels.length, maskPixels.length);

  for (let i = 0; i < pixelCount; i += 4) {
    const maskedAmount = useMaskAlpha
      ? maskPixels[i + 3]
      : Math.round((maskPixels[i] * 0.2126) + (maskPixels[i + 1] * 0.7152) + (maskPixels[i + 2] * 0.0722));
    const maskAlpha = inverseMask ? 255 - maskedAmount : maskedAmount;
    imagePixels[i + 3] = Math.round((imagePixels[i + 3] * maskAlpha) / 255);
  }
}

export function createMaskedThumbnailCanvas(
  imageBitmap: ImageBitmap,
  maskBitmap: ImageBitmap,
  inverseMask = false,
  maxSize = MASKED_THUMBNAIL_SIZE,
  createCanvas: ImageCacheCanvasFactory = createBrowserImageCacheCanvas
): ImageCacheCanvas | null {
  const { width, height } = getResizedImageDimensions(imageBitmap, maxSize);
  const imageCanvas = createCanvas(width, height);
  const maskCanvas = createCanvas(width, height);
  const imageCtx = getCanvasContext(imageCanvas);
  const maskCtx = getCanvasContext(maskCanvas);

  try {
    if (!imageCtx || !maskCtx) return null;

    imageCtx.imageSmoothingEnabled = true;
    imageCtx.imageSmoothingQuality = 'high';
    maskCtx.imageSmoothingEnabled = true;
    maskCtx.imageSmoothingQuality = 'high';
    imageCtx.drawImage(imageBitmap, 0, 0, width, height);
    maskCtx.drawImage(maskBitmap, 0, 0, width, height);

    const imageData = imageCtx.getImageData(0, 0, width, height);
    const maskData = maskCtx.getImageData(0, 0, width, height);
    applyMaskAlphaToImagePixels(imageData.data, maskData.data, inverseMask);
    imageCtx.putImageData(imageData, 0, 0);

    return imageCanvas;
  } catch {
    return null;
  } finally {
    imageBitmap.close();
    maskBitmap.close();
  }
}

async function canvasToPngUrl(canvas: ImageCacheCanvas): Promise<string | null> {
  const blob = isOffscreenCanvas(canvas)
    ? await canvas.convertToBlob({ type: 'image/png' })
    : await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  return blob ? URL.createObjectURL(blob) : null;
}

async function loadMaskedThumbnail(imageFile: File, maskFile: File, inverseMask: boolean): Promise<string | null> {
  try {
    const [imageBitmap, maskBitmap] = await Promise.all([
      createImageBitmap(imageFile),
      createImageBitmap(maskFile),
    ]);
    const canvas = createMaskedThumbnailCanvas(imageBitmap, maskBitmap, inverseMask);
    return canvas ? await canvasToPngUrl(canvas) : null;
  } catch {
    return null;
  }
}

export function clearMaskedThumbnailCache(): void {
  maskedThumbnailCacheGeneration++;
  for (const url of maskedThumbnailCache.values()) {
    URL.revokeObjectURL(url);
  }
  maskedThumbnailCache.clear();
  maskedThumbnailLoads.clear();
}

export function getMaskedThumbnailCacheStats(): { count: number; loading: number } {
  return {
    count: maskedThumbnailCache.size,
    loading: maskedThumbnailLoads.size,
  };
}

export function useMaskedThumbnail(
  imageFile: File | undefined,
  maskFile: File | undefined,
  imageName: string,
  enabled: boolean,
  inverseMask = false
): string | null {
  const cacheKey = useMemo(
    () => enabled && imageFile && maskFile
      ? getMaskedThumbnailCacheKey(imageName, imageFile, maskFile, inverseMask)
      : '',
    [enabled, imageFile, imageName, maskFile, inverseMask]
  );
  const [state, setState] = useState<{ cacheKey: string; url: string | null }>(() => ({
    cacheKey,
    url: cacheKey ? maskedThumbnailCache.get(cacheKey) ?? null : null,
  }));

  useEffect(() => {
    let cancelled = false;

    if (!enabled || !imageFile || !maskFile || !cacheKey) {
      return () => {
        cancelled = true;
      };
    }

    const cached = maskedThumbnailCache.get(cacheKey);
    if (cached) {
      return () => {
        cancelled = true;
      };
    }

    let load = maskedThumbnailLoads.get(cacheKey);
    if (!load) {
      const loadGeneration = maskedThumbnailCacheGeneration;
      load = loadMaskedThumbnail(imageFile, maskFile, inverseMask).then((result) => {
        maskedThumbnailLoads.delete(cacheKey);
        if (loadGeneration !== maskedThumbnailCacheGeneration) {
          if (result) URL.revokeObjectURL(result);
          return null;
        }
        if (result) {
          maskedThumbnailCache.set(cacheKey, result);
        }
        return result;
      });
      maskedThumbnailLoads.set(cacheKey, load);
    }

    load.then((result) => {
      if (!cancelled) {
        setState({ cacheKey, url: result });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [cacheKey, enabled, imageFile, maskFile, inverseMask]);

  if (!enabled || !cacheKey) return null;
  return maskedThumbnailCache.get(cacheKey) ?? (state.cacheKey === cacheKey ? state.url : null);
}
