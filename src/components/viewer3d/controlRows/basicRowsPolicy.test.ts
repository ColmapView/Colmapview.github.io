import { describe, expect, it } from 'vitest';
import {
  getNextSelectRowValue,
  getSelectRowOptionValue,
  getToggledRowValue,
  type SelectRowOption,
} from './basicRowsPolicy';

const options: SelectRowOption[] = [
  { value: 'orbit', label: 'Orbit' },
  { value: 'fly', label: 'Fly' },
  { value: 'fps', label: 'FPS' },
];

describe('basic rows policy', () => {
  it('toggles boolean row values', () => {
    expect(getToggledRowValue(true)).toBe(false);
    expect(getToggledRowValue(false)).toBe(true);
  });

  it('advances select rows on positive wheel deltas', () => {
    expect(getNextSelectRowValue(options, 'orbit', 1)).toBe('fly');
    expect(getNextSelectRowValue(options, 'fly', 1)).toBe('fps');
  });

  it('moves select rows backward on zero or negative wheel deltas', () => {
    expect(getNextSelectRowValue(options, 'fps', -1)).toBe('fly');
    expect(getNextSelectRowValue(options, 'fly', 0)).toBe('orbit');
  });

  it('clamps select row wheel movement to available options', () => {
    expect(getNextSelectRowValue(options, 'fps', 1)).toBe('fps');
    expect(getNextSelectRowValue(options, 'orbit', -1)).toBe('orbit');
  });

  it('falls back to the first option when the current value is unknown', () => {
    expect(getNextSelectRowValue(options, 'unknown', 1)).toBe('orbit');
    expect(getNextSelectRowValue(options, 'unknown', -1)).toBe('orbit');
  });

  it('returns null when no select options are available', () => {
    expect(getNextSelectRowValue([], 'orbit', 1)).toBeNull();
    expect(getNextSelectRowValue([], 'orbit', -1)).toBeNull();
  });

  it('narrows DOM select values to known option values', () => {
    expect(getSelectRowOptionValue(options, 'fly')).toBe('fly');
    expect(getSelectRowOptionValue(options, 'unknown')).toBeNull();
  });
});
