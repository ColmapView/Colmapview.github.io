import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useReconstructionStore } from '../../store';
import { buildReconstruction } from '../../test/builders/colmapBuilders';
import { useCameraMatchesStoreFacade } from './useCameraMatchesStoreFacade';

describe('useCameraMatchesStoreFacade', () => {
  beforeEach(() => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
  });

  it('collects reconstruction state for camera match rendering', () => {
    const reconstruction = buildReconstruction();
    useReconstructionStore.setState({ reconstruction });

    const { result } = renderHook(() => useCameraMatchesStoreFacade());

    expect(result.current.reconstruction).toBe(reconstruction);
  });
});
