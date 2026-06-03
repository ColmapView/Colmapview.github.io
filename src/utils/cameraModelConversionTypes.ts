export const DEFAULT_CONVERSION_THRESHOLD = 1e-6;
export const ASPECT_RATIO_THRESHOLD = 0.01;

export type ConversionResult =
  | { type: 'exact'; params: number[] }
  | { type: 'approximate'; params: number[]; maxError: number; warning: string }
  | { type: 'incompatible'; reason: string };
