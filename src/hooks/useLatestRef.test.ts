import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useLatestRef } from './useLatestRef';

describe('useLatestRef', () => {
  it('keeps a stable ref object with the latest rendered value', () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: number }) => useLatestRef(value),
      { initialProps: { value: 1 } }
    );
    const firstRef = result.current;

    expect(result.current.current).toBe(1);

    rerender({ value: 2 });

    expect(result.current).toBe(firstRef);
    expect(result.current.current).toBe(2);
  });
});
