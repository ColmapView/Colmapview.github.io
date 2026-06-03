interface ParseSafeIntegerStringOptions {
  allowSign?: boolean;
  max?: number;
  min?: number;
}

const FINITE_NUMBER_STRING_PATTERN = /^[+-]?(?:(?:\d+\.?\d*)|(?:\.\d+))(?:[eE][+-]?\d+)?$/;

export function parseSafeIntegerString(
  value: string,
  options: ParseSafeIntegerStringOptions = {}
): number | null {
  const trimmedValue = value.trim();
  const pattern = options.allowSign === true ? /^-?\d+$/ : /^\d+$/;

  if (!pattern.test(trimmedValue)) return null;

  const parsed = Number(trimmedValue);
  if (!Number.isSafeInteger(parsed)) return null;
  if (options.min !== undefined && parsed < options.min) return null;
  if (options.max !== undefined && parsed > options.max) return null;

  return parsed;
}

export function parseFiniteNumberString(value: string): number | null {
  const trimmedValue = value.trim();
  if (!FINITE_NUMBER_STRING_PATTERN.test(trimmedValue)) return null;

  const parsed = Number(trimmedValue);
  return Number.isFinite(parsed) ? parsed : null;
}
