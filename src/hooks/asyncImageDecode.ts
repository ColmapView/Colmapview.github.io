type TimerId = ReturnType<typeof setTimeout>;

export type ImageBitmapDecoder = (file: File) => Promise<ImageBitmap>;

export interface ImageBitmapTimeoutOptions {
  decode?: ImageBitmapDecoder;
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

  return new Promise((resolve, reject) => {
    let settled = false;

    const timer = setTimer(() => {
      if (!settled) {
        settled = true;
        reject(new Error(`Image decode timed out after ${timeout}ms`));
      }
    }, timeout);

    decode(file)
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
