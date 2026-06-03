import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useReconstructionStore } from '../../store/reconstructionStore';
import { buildFile, buildLoadedFiles, buildReconstruction } from '../../test/builders/colmapBuilders';
import { useCacheStatsIndicatorStoreFacade } from './useCacheStatsIndicatorStoreFacade';

describe('useCacheStatsIndicatorStoreFacade', () => {
  beforeEach(() => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
  });

  it('collects cache stats reconstruction state from the reconstruction store', () => {
    const reconstruction = buildReconstruction();
    useReconstructionStore.setState({
      reconstruction,
      loadedFiles: buildLoadedFiles({ splatFile: buildFile('scene.ply') }),
    });

    const { result } = renderHook(() => useCacheStatsIndicatorStoreFacade());

    expect(result.current.reconstruction).toBe(reconstruction);
    expect(result.current.hasSplatFile).toBe(true);
  });
});
