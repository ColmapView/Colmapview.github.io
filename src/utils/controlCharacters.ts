/** C0 control characters and DEL. Astral characters never match: their UTF-16 units are surrogates. */
const isControlCode = (code: number) => code < 32 || code === 127;

/** Whether the text holds a C0 control character or DEL. */
export function hasControlCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    if (isControlCode(value.charCodeAt(index))) return true;
  }
  return false;
}

/**
 * Replaces each C0 control character and DEL with `replacement`. `keepTabs` keeps tabs, and
 * `keepLineBreaks` keeps line feeds and carriage returns.
 */
export function replaceControlCharacters(value: string, replacement: string,
  { keepLineBreaks = false, keepTabs = false }: { keepLineBreaks?: boolean; keepTabs?: boolean } = {}): string {
  let text = '';
  let start = 0;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (!isControlCode(code) || (keepTabs && code === 9) || (keepLineBreaks && (code === 10 || code === 13))) continue;
    text += value.slice(start, index) + replacement;
    start = index + 1;
  }
  return start ? text + value.slice(start) : value;
}
