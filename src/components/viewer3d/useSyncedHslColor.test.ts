import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSyncedHslColor } from './useSyncedHslColor';

describe('useSyncedHslColor', () => {
  it('updates editable HSL state and emits matching hex values', () => {
    const setHexColor = vi.fn();
    const { result } = renderHook(() => useSyncedHslColor('#000000', setHexColor));

    expect(result.current.hsl).toEqual({ h: 0, s: 0, l: 0 });

    act(() => result.current.handleLightnessChange(100));
    expect(result.current.hsl).toEqual({ h: 0, s: 0, l: 100 });
    expect(setHexColor).toHaveBeenLastCalledWith('#ffffff');

    act(() => result.current.handleColorPickerChange('#ff0000'));
    expect(result.current.hsl).toEqual({ h: 0, s: 100, l: 50 });
    expect(setHexColor).toHaveBeenLastCalledWith('#ff0000');
  });

  it('syncs from external hex changes without discarding equivalent local HSL', () => {
    const setHexColor = vi.fn();
    const { result, rerender } = renderHook(
      ({ hexColor }) => useSyncedHslColor(hexColor, setHexColor),
      { initialProps: { hexColor: '#ffffff' } }
    );

    const initialHsl = result.current.hsl;

    rerender({ hexColor: '#ffffff' });
    expect(result.current.hsl).toBe(initialHsl);

    rerender({ hexColor: '#0000ff' });
    expect(result.current.hsl).toEqual({ h: 240, s: 100, l: 50 });
  });

  it('preserves local edits until the owning hex prop changes', () => {
    const setHexColor = vi.fn();
    const { result, rerender } = renderHook(
      ({ hexColor }) => useSyncedHslColor(hexColor, setHexColor),
      { initialProps: { hexColor: '#000000' } }
    );

    act(() => result.current.handleLightnessChange(100));

    expect(result.current.hsl).toEqual({ h: 0, s: 0, l: 100 });
    expect(setHexColor).toHaveBeenLastCalledWith('#ffffff');

    rerender({ hexColor: '#000000' });

    expect(result.current.hsl).toEqual({ h: 0, s: 0, l: 100 });

    rerender({ hexColor: '#ff0000' });

    expect(result.current.hsl).toEqual({ h: 0, s: 100, l: 50 });
  });
});
