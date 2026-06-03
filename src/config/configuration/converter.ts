type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function camelToSnake(obj: unknown): JsonValue {
  if (obj === null || obj === undefined) {
    return null;
  }

  if (Array.isArray(obj)) {
    return obj.map(camelToSnake);
  }

  if (isRecord(obj)) {
    const result: { [key: string]: JsonValue } = {};
    for (const [key, value] of Object.entries(obj)) {
      result[toSnakeCase(key)] = camelToSnake(value);
    }
    return result;
  }

  if (typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'boolean') {
    return obj;
  }

  return null;
}

export function snakeToCamel(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return null;
  }

  if (Array.isArray(obj)) {
    return obj.map(snakeToCamel);
  }

  if (isRecord(obj)) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[toCamelCase(key)] = snakeToCamel(value);
    }
    return result;
  }

  return obj;
}
