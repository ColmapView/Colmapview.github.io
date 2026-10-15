import { describe, expect, it } from 'vitest';
import { hasControlCharacters, replaceControlCharacters } from './controlCharacters';

describe('control characters', () => {
  it('detects C0 controls and DEL, and nothing else', () => {
    expect(hasControlCharacters('scene.zip')).toBe(false);
    expect(hasControlCharacters('😀   é')).toBe(false);
    for (const code of [0, 9, 10, 13, 31, 127]) expect(hasControlCharacters(`a${String.fromCharCode(code)}b`)).toBe(true);
  });

  it('replaces controls, optionally keeping tabs and line breaks', () => {
    const text = 'a\u0000b\tc\nd\re\u007f😀';
    expect(replaceControlCharacters(text, ' ')).toBe('a b c d e 😀');
    expect(replaceControlCharacters(text, '')).toBe('abcde😀');
    expect(replaceControlCharacters(text, '', { keepLineBreaks: true, keepTabs: true })).toBe('ab\tc\nd\re😀');
    expect(replaceControlCharacters(text, '', { keepLineBreaks: true })).toBe('abc\nd\re😀');
    expect(replaceControlCharacters('clean', '')).toBe('clean');
  });
});
