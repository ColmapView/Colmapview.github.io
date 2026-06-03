import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { usePointCloudStore, useReconstructionStore } from '../../../store';
import { buildFile, buildLoadedFiles } from '../../../test/builders';
import { useSplatLayerStoreFacade } from './SplatLayerStoreFacade';

describe('useSplatLayerStoreFacade', () => {
  beforeEach(() => {
    usePointCloudStore.setState(usePointCloudStore.getInitialState());
    useReconstructionStore.setState({
      loadedFiles: null,
    });
  });

  it('exposes splat visibility and the resolved dataset PLY file', () => {
    const splatFile = buildFile('scene.ply', 'splat');
    usePointCloudStore.setState({ showPointCloud: true, colorMode: 'splats' });
    useReconstructionStore.setState({
      loadedFiles: buildLoadedFiles({ splatFile }),
    });

    const { result } = renderHook(() => useSplatLayerStoreFacade());

    expect(result.current.data).toEqual({
      showSplats: true,
      splatFile,
    });
  });
});
