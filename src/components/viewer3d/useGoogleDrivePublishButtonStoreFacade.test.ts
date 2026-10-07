import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useReconstructionStore } from '../../store';
import type { ColmapManifest } from '../../types/manifest';
import { useGoogleDrivePublishButtonStoreFacade } from './useGoogleDrivePublishButtonStoreFacade';

describe('useGoogleDrivePublishButtonStoreFacade', () => {
  beforeEach(() => useReconstructionStore.setState(useReconstructionStore.getInitialState(), true));

  it('offers only a remote source for the Drive hand-off', () => {
    const { result } = renderHook(() => useGoogleDrivePublishButtonStoreFacade());
    expect(result.current.handoffSource).toBeNull();
    act(() => useReconstructionStore.setState({ sourceUrl: 'https://example.test/scene/' }));
    expect(result.current.handoffSource).toBe('https://example.test/scene/');
    const manifest = { version: 1, baseUrl: 'https://example.test/scene/', files: { cameras: 'c.bin', images: 'i.bin', points3D: 'p.bin' } } as ColmapManifest;
    act(() => useReconstructionStore.setState({ sourceUrl: null, sourceManifest: manifest }));
    expect(result.current.handoffSource).toBe(manifest);
  });
});
