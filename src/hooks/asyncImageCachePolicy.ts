export interface ImageDimensions {
  width: number;
  height: number;
}

export function getResizedImageDimensions(
  dimensions: ImageDimensions,
  maxSize: number
): ImageDimensions {
  const scale = Math.min(
    maxSize / dimensions.width,
    maxSize / dimensions.height,
    1
  );

  return {
    width: Math.round(dimensions.width * scale),
    height: Math.round(dimensions.height * scale),
  };
}

export function getPrefetchChunkSize(maxConcurrentLoads: number, multiplier = 4): number {
  return Math.max(1, Math.floor(maxConcurrentLoads) * multiplier);
}

export function getPrefetchProgress(completed: number, total: number): number {
  if (total <= 0) {
    return 1;
  }
  return completed / total;
}

export function shouldReportPrefetchProgress(
  completed: number,
  total: number,
  lastReportedProgress: number,
  reportStep = 0.05
): boolean {
  if (total <= 0) {
    return true;
  }

  const progress = getPrefetchProgress(completed, total);
  return progress - lastReportedProgress >= reportStep || completed === total;
}
