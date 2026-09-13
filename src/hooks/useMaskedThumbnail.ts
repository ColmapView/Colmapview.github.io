import { useEffect, useMemo, useState } from 'react';
import { createMaskedThumbnailCache, type MaskedThumbnailLease } from './maskedThumbnailCache';
import { getResizedImageDimensions } from './asyncImageCachePolicy';
import {
  createBrowserImageCacheCanvas,
  type ImageCacheCanvas,
  type ImageCacheCanvasFactory,
} from './asyncImageCanvas';
import { isOffscreenCanvas } from '../utils/canvasTypeGuards';

const MASKED_THUMBNAIL_SIZE = 256;

const maskedThumbnailCache = createMaskedThumbnailCache();

type Canvas2DContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function getCanvasContext(canvas: ImageCacheCanvas): Canvas2DContext | null {
  return isOffscreenCanvas(canvas) ? canvas.getContext('2d') : canvas.getContext('2d');
}

const fileIdentities = new WeakMap<File, number>();
let nextFileIdentity = 0;
function getFileCacheKey(file: File): number {
  let identity = fileIdentities.get(file);
  if (identity === undefined) { identity = ++nextFileIdentity; fileIdentities.set(file, identity); }
  return identity;
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
  try {
    const { width, height } = getResizedImageDimensions(imageBitmap, maxSize);
    const imageCanvas = createCanvas(width, height);
    const maskCanvas = createCanvas(width, height);
    const imageCtx = getCanvasContext(imageCanvas);
    const maskCtx = getCanvasContext(maskCanvas);
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

async function canvasToPngBlob(canvas: ImageCacheCanvas): Promise<Blob | null> {
  const blob = isOffscreenCanvas(canvas)
    ? await canvas.convertToBlob({ type: 'image/png' })
    : await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  return blob;
}

export async function loadMaskedThumbnail(imageFile: File, maskFile: File, inverseMask: boolean): Promise<Blob | null> {
  const results = await Promise.allSettled([imageFile, maskFile].map(file =>
    Promise.resolve().then(() => createImageBitmap(file))));
  if (results[0].status !== 'fulfilled' || results[1].status !== 'fulfilled') {
    for (const result of results) if (result.status === 'fulfilled') result.value.close();
    return null;
  }
  const canvas = createMaskedThumbnailCanvas(results[0].value, results[1].value, inverseMask);
  if (!canvas) return null;
  try { return await canvasToPngBlob(canvas); } catch { return null; }
}

export function clearMaskedThumbnailCache(): void {
  maskedThumbnailCache.clear();
}

export function getMaskedThumbnailCacheStats() {
  return maskedThumbnailCache.getStats();
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
  const [state, setState] = useState<{ cacheKey: string; lease: MaskedThumbnailLease } | null>(null);

  useEffect(() => {
    if (!enabled || !imageFile || !maskFile || !cacheKey) return;
    const lease = maskedThumbnailCache.acquire(cacheKey,
      () => loadMaskedThumbnail(imageFile, maskFile, inverseMask));
    let cancelled = false;
    lease.ready.then(() => {
      if (!cancelled) setState({ cacheKey, lease });
    });
    return () => {
      cancelled = true;
      lease.release();
    };
  }, [cacheKey, enabled, imageFile, maskFile, inverseMask]);

  // A changed/disabled resource renders no old URL before its effect releases the
  // lease. Re-enabling cannot expose a URL from an already released lease either.
  return enabled && state?.cacheKey === cacheKey ? state.lease.getUrl() : null;
}
