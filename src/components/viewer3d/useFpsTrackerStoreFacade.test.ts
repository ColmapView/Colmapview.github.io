import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useUIStore } from '../../store';
import { useFpsTrackerStoreFacade } from './useFpsTrackerStoreFacade';

describe('useFpsTrackerStoreFacade', () => {
  beforeEach(() => {
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('routes FPS samples to the UI store', () => {
    const { result } = renderHook(() => useFpsTrackerStoreFacade());

    act(() => {
      result.current.setFps(59);
    });

    expect(useUIStore.getState().fps).toBe(59);
  });
});
