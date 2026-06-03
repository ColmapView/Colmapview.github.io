import { parseSafeIntegerString } from '../utils/numberParsing';

const COLMAP_NUMBER_TOKEN_PATTERN = /^[+-]?(?:(?:\d+\.?\d*)|(?:\.\d+))(?:[eE][+-]?\d+)?$/;
const COLMAP_BIGINT_TOKEN_PATTERN = /^[+-]?\d+$/;

interface ParseColmapIntegerTokenOptions {
  max?: number;
  min?: number;
}

export function parseColmapIntegerToken(
  token: string,
  options: ParseColmapIntegerTokenOptions = {}
): number | null {
  return parseSafeIntegerString(token, {
    allowSign: options.min === undefined || options.min < 0,
    max: options.max,
    min: options.min,
  });
}

export function parseColmapNumberToken(token: string): number | null {
  const trimmedToken = token.trim();
  if (!COLMAP_NUMBER_TOKEN_PATTERN.test(trimmedToken)) return null;

  const parsed = Number(trimmedToken);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseColmapNumberTokens(tokens: readonly string[]): number[] | null {
  const values: number[] = [];
  for (const token of tokens) {
    const value = parseColmapNumberToken(token);
    if (value === null) return null;
    values.push(value);
  }
  return values;
}

export function parseColmapBigIntToken(token: string): bigint | null {
  const trimmedToken = token.trim();
  return COLMAP_BIGINT_TOKEN_PATTERN.test(trimmedToken) ? BigInt(trimmedToken) : null;
}
