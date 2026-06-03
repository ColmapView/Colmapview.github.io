import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useResetKeyedState } from './useResetKeyedState';

describe('useResetKeyedState', () => {
  it('preserves local state while the reset key is stable', () => {
    const { result, rerender } = renderHook(
      ({ resetKey }) => useResetKeyedState(resetKey, 0),
      { initialProps: { resetKey: 'same' } }
    );

    act(() => result.current[1](3));

    expect(result.current[0]).toBe(3);

    rerender({ resetKey: 'same' });

    expect(result.current[0]).toBe(3);
  });

  it('returns the initial value immediately when the reset key changes', () => {
    const { result, rerender } = renderHook(
      ({ resetKey }) => useResetKeyedState(resetKey, 0),
      { initialProps: { resetKey: 'first' } }
    );

    act(() => result.current[1](4));
    rerender({ resetKey: 'second' });

    expect(result.current[0]).toBe(0);

    act(() => result.current[1]((previous) => previous + 2));

    expect(result.current[0]).toBe(2);
  });

  it('does not revive stale state when a previous reset key appears again', () => {
    const { result, rerender } = renderHook(
      ({ resetKey }) => useResetKeyedState(resetKey, 0),
      { initialProps: { resetKey: 'first' } }
    );

    act(() => result.current[1](4));
    rerender({ resetKey: 'second' });
    rerender({ resetKey: 'first' });

    expect(result.current[0]).toBe(0);
  });

  it('does not reset when only the initial value changes under the same key', () => {
    const { result, rerender } = renderHook(
      ({ initialValue }) => useResetKeyedState('stable', initialValue),
      { initialProps: { initialValue: 'first' } }
    );

    act(() => result.current[1]('edited'));
    rerender({ initialValue: 'next' });

    expect(result.current[0]).toBe('edited');
  });

  it('uses the current reset key even when a previous setter reference is called', () => {
    const { result, rerender } = renderHook(
      ({ resetKey }) => useResetKeyedState(resetKey, 0),
      { initialProps: { resetKey: 'first' } }
    );
    const setValue = result.current[1];

    act(() => setValue(4));
    rerender({ resetKey: 'second' });
    act(() => setValue((previous) => previous + 1));

    expect(result.current[0]).toBe(1);
  });
});
