type TimerId = ReturnType<typeof setTimeout>;

export type ImageBitmapDecoder = (file: File) => Promise<ImageBitmap>;
export type ImageBitmapResizeDecoder = (
  image: ImageBitmap,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  options?: ImageBitmapOptions
) => Promise<ImageBitmap>;

export interface ImageBitmapTimeoutOptions {
  decode?: ImageBitmapDecoder;
  setTimer?: (handler: () => void, timeout: number) => TimerId;
  clearTimer?: (timerId: TimerId) => void;
}

export interface ImageBitmapResizeOptions {
  resize?: ImageBitmapResizeDecoder;
  setTimer?: (handler: () => void, timeout: number) => TimerId;
  clearTimer?: (timerId: TimerId) => void;
}

const failedImages = new Set<string>();

export function hasImageFailed(cacheKey: string): boolean {
  return failedImages.has(cacheKey);
}

export function getFailedImageCount(): number {
  return failedImages.size;
}

export function markImageFailed(cacheKey: string): number {
  failedImages.add(cacheKey);
  return failedImages.size;
}

export function clearFailedImages(): void {
  failedImages.clear();
}

export function shouldLogDecodeFailure(failedImageCount: number): boolean {
  return failedImageCount <= 20;
}

export function shouldLogDecodeFailureSuppression(failedImageCount: number): boolean {
  return failedImageCount === 21;
}

/**
 * Runs an ImageBitmap-producing operation with a timeout to prevent hanging.
 */
function runImageBitmapOperationWithTimeout(
  operation: () => Promise<ImageBitmap>,
  timeout: number,
  setTimer: (handler: () => void, timeout: number) => TimerId = setTimeout,
  clearTimer: (timerId: TimerId) => void = clearTimeout
): Promise<ImageBitmap> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const timer = setTimer(() => {
      if (!settled) {
        settled = true;
        reject(new Error(`Image decode timed out after ${timeout}ms`));
      }
    }, timeout);

    operation()
      .then((bitmap) => {
        if (!settled) {
          settled = true;
          clearTimer(timer);
          resolve(bitmap);
        } else {
          bitmap.close();
        }
      })
      .catch((err) => {
        if (!settled) {
          settled = true;
          clearTimer(timer);
          reject(err);
        }
      });
  });
}

/**
 * createImageBitmap with timeout to prevent hanging.
 */
export async function createImageBitmapWithTimeout(
  file: File,
  timeout: number,
  options: ImageBitmapTimeoutOptions = {}
): Promise<ImageBitmap> {
  const decode = options.decode ?? createImageBitmap;
  const setTimer = options.setTimer ?? setTimeout;
  const clearTimer = options.clearTimer ?? clearTimeout;

  return runImageBitmapOperationWithTimeout(
    () => decode(file),
    timeout,
    setTimer,
    clearTimer
  );
}

export function getBitmapResizeDimensions(
  bitmap: Pick<ImageBitmap, 'width' | 'height'>,
  maxSize: number
): { width: number; height: number } {
  const scale = Math.min(maxSize / bitmap.width, maxSize / bitmap.height, 1);
  return {
    width: Math.max(1, Math.round(bitmap.width * scale)),
    height: Math.max(1, Math.round(bitmap.height * scale)),
  };
}

export function shouldResizeImageBitmap(
  bitmap: Pick<ImageBitmap, 'width' | 'height'>,
  maxSize: number
): boolean {
  return bitmap.width > maxSize || bitmap.height > maxSize;
}

export async function resizeImageBitmapToMaxSizeWithTimeout(
  bitmap: ImageBitmap,
  maxSize: number,
  timeout: number,
  options: ImageBitmapResizeOptions = {}
): Promise<ImageBitmap> {
  if (!shouldResizeImageBitmap(bitmap, maxSize)) {
    return bitmap;
  }

  const { width, height } = getBitmapResizeDimensions(bitmap, maxSize);
  const resize = options.resize ?? (
    (image, sx, sy, sw, sh, resizeOptions) => createImageBitmap(image, sx, sy, sw, sh, resizeOptions)
  );
  const setTimer = options.setTimer ?? setTimeout;
  const clearTimer = options.clearTimer ?? clearTimeout;

  try {
    const resized = await runImageBitmapOperationWithTimeout(
      () => resize(bitmap, 0, 0, bitmap.width, bitmap.height, {
        resizeWidth: width,
        resizeHeight: height,
        resizeQuality: 'high',
      }),
      timeout,
      setTimer,
      clearTimer
    );
    bitmap.close();
    return resized;
  } catch {
    return bitmap;
  }
}
