import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useReconstructionStore } from '../../store';
import { buildReconstruction } from '../../test/builders/colmapBuilders';
import { useDataPanelStoreFacade } from './useDataPanelStoreFacade';

describe('useDataPanelStoreFacade', () => {
  beforeEach(() => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
  });

  it('collects the active reconstruction for database panels', () => {
    const reconstruction = buildReconstruction();
    useReconstructionStore.setState({ reconstruction });

    const { result } = renderHook(() => useDataPanelStoreFacade());

    expect(result.current.reconstruction).toBe(reconstruction);
  });
});
