import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  useNotificationStore,
  useReconstructionStore,
} from '../../store';
import { buildReconstruction } from '../../test/builders';
import { useCameraConversionStoreFacade } from './useCameraConversionStoreFacade';

describe('useCameraConversionStoreFacade', () => {
  beforeEach(() => {
    useNotificationStore.setState(useNotificationStore.getInitialState(), true);
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
  });

  it('collects camera-conversion dependencies from owning stores', () => {
    const reconstruction = buildReconstruction();
    useReconstructionStore.setState({ reconstruction });

    const { result } = renderHook(() => useCameraConversionStoreFacade());

    expect(result.current.data.reconstruction).toBe(reconstruction);
    expect(typeof result.current.actions.setReconstruction).toBe('function');
    expect(typeof result.current.actions.addNotification).toBe('function');
  });

  it('routes camera-conversion actions back to owning stores', () => {
    const reconstruction = buildReconstruction();
    const { result } = renderHook(() => useCameraConversionStoreFacade());

    act(() => {
      result.current.actions.setReconstruction(reconstruction);
      result.current.actions.addNotification('info', 'Converted cameras', 2500);
    });

    expect(useReconstructionStore.getState().reconstruction).toBe(reconstruction);
    expect(useNotificationStore.getState().notifications).toMatchObject([
      {
        type: 'info',
        message: 'Converted cameras',
        duration: 2500,
      },
    ]);
  });
});
