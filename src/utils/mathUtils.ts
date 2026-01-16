/**
 * Mathematical utility functions for statistical calculations.
 */

/**
 * Calculate the p-th percentile of a sorted array.
 * Uses linear interpolation between adjacent values.
 * @param sorted - Array of numbers, must be pre-sorted in ascending order
 * @param p - Percentile value (0-100)
 * @returns The p-th percentile value, or 0 if array is empty
 */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] * (upper - idx) + sorted[upper] * (idx - lower);
}

/**
 * Calculate the median of an array.
 * @param arr - Array of numbers (does not need to be sorted)
 * @returns The median value, or 0 if array is empty
 */
export function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return percentile(sorted, 50);
}
