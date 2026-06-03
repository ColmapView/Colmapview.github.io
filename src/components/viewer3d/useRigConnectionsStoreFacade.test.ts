import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useReconstructionStore } from '../../store';
import { buildReconstruction } from '../../test/builders/colmapBuilders';
import { useRigConnectionsStoreFacade } from './useRigConnectionsStoreFacade';

describe('useRigConnectionsStoreFacade', () => {
  beforeEach(() => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
  });

  it('collects reconstruction state for rig connection rendering', () => {
    const reconstruction = buildReconstruction();
    useReconstructionStore.setState({ reconstruction });

    const { result } = renderHook(() => useRigConnectionsStoreFacade());

    expect(result.current.reconstruction).toBe(reconstruction);
  });
});
