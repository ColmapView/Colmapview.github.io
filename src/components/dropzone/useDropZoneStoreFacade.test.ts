import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useReconstructionStore } from '../../store/reconstructionStore';
import { useUIStore } from '../../store/stores/uiStore';
import { buildReconstruction } from '../../test/builders/colmapBuilders';
import { useDropZoneStoreFacade } from './useDropZoneStoreFacade';

describe('useDropZoneStoreFacade', () => {
  beforeEach(() => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('collects drop-zone dependencies from owning stores', () => {
    const reconstruction = buildReconstruction();

    useReconstructionStore.setState({
      error: 'Failed to load data',
      reconstruction,
    });
    useUIStore.setState({ touchMode: true });

    const { result } = renderHook(() => useDropZoneStoreFacade());

    expect(result.current.data).toMatchObject({
      error: 'Failed to load data',
      reconstruction,
      touchMode: true,
    });
    expect(result.current.data.hasUrlLoadRequest).toBe(false);
  });

  it('routes error updates back to the reconstruction store', () => {
    useReconstructionStore.setState({ error: 'Old error' });

    const { result } = renderHook(() => useDropZoneStoreFacade());

    act(() => {
      result.current.actions.setError(null);
    });

    expect(useReconstructionStore.getState().error).toBeNull();
  });
});
