import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useReconstructionStore } from '../../store';
import { buildCamera, buildReconstruction } from '../../test/builders';
import { useFrustumHoverCardStoreFacade } from './useFrustumHoverCardStoreFacade';

describe('useFrustumHoverCardStoreFacade', () => {
  beforeEach(() => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
  });

  it('reports whether frustum hover metadata should include camera ids', () => {
    useReconstructionStore.setState({
      reconstruction: buildReconstruction({
        cameras: [
          buildCamera({ cameraId: 1 }),
          buildCamera({ cameraId: 2 }),
        ],
      }),
    });

    const { result } = renderHook(() => useFrustumHoverCardStoreFacade());

    expect(result.current.multiCamera).toBe(true);
  });

  it('keeps single-camera reconstructions compact', () => {
    useReconstructionStore.setState({
      reconstruction: buildReconstruction({
        cameras: [buildCamera({ cameraId: 1 })],
      }),
    });

    const { result } = renderHook(() => useFrustumHoverCardStoreFacade());

    expect(result.current.multiCamera).toBe(false);
  });
});
