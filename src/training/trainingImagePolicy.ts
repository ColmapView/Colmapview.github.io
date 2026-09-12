/** Shared by the main-thread fallback and dedicated image workers. */
export const TRAINING_JPEG_QUALITY = 0.9;
export const TRAINING_JPEG_DECODE_OPTIONS: ImageBitmapOptions = {
  imageOrientation: 'none', premultiplyAlpha: 'none',
};
export const TRAINING_MASK_DECODE_OPTIONS: ImageBitmapOptions = {
  imageOrientation: 'none', premultiplyAlpha: 'none', colorSpaceConversion: 'none',
};

export type TrainingImageOperation = 'jpeg-q90' | 'mask-png';
export type TrainingImageRequest = {
  type: 'encode'; attemptId: string; taskId: string; source: Blob; operation: TrainingImageOperation;
};
export type TrainingImageResponse =
  | { type: 'ready' }
  | { type: 'unavailable' }
  | { type: 'encoded'; attemptId: string; taskId: string; blob: Blob; width: number; height: number; elapsedMs: number }
  | { type: 'error'; attemptId: string; taskId: string; message: string };
