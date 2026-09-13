import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCameraStore, useExportStore, useFloorPlaneStore, usePointCloudStore, useReconstructionStore, useRigStore, useUIStore } from '../../store';
import { buildFile, buildLoadedFiles, buildPoint3D, buildReconstruction } from '../../test/builders';
import { subscribeSceneRenderStores, useSceneRenderStoreFacade } from './useSceneRenderStoreFacade';

beforeEach(() => {
  useCameraStore.setState(useCameraStore.getInitialState(), true);
  useExportStore.setState(useExportStore.getInitialState(), true);
  useFloorPlaneStore.setState(useFloorPlaneStore.getInitialState(), true);
  useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
  useRigStore.setState(useRigStore.getInitialState(), true);
  useUIStore.setState(useUIStore.getInitialState(), true);
});

describe('scene render store facade', () => {
  it.each(['rainbow', 'blink'] as const)('keeps configured %s continuous before first selection and after deselection', (selectionColorMode) => {
    useCameraStore.setState({ selectionColorMode });
    const { result } = renderHook(useSceneRenderStoreFacade);
    expect(result.current.frameloop).toBe('demand');
    act(() => useReconstructionStore.setState({ reconstruction: buildReconstruction() }));
    expect(useCameraStore.getState().selectedImageId).toBeNull();
    expect(result.current.frameloop).toBe('always');
    act(() => useCameraStore.setState({ selectedImageId: 1 }));
    expect(result.current.frameloop).toBe('always');
    act(() => useCameraStore.setState({ selectedImageId: null }));
    expect(result.current.frameloop).toBe('always');
    act(() => useCameraStore.setState({ selectionColorMode: 'static' }));
    expect(result.current.frameloop).toBe('demand');
  });

  it('keeps pure point clouds demand-eligible and reevaluates when selectable images are installed or cleared', () => {
    useCameraStore.setState({ selectionColorMode: 'rainbow' });
    useReconstructionStore.setState({ reconstruction: buildReconstruction({ images: [], points3D: [buildPoint3D()] }) });
    const { result } = renderHook(useSceneRenderStoreFacade);
    expect(result.current.frameloop).toBe('demand');
    act(() => useReconstructionStore.setState({ reconstruction: buildReconstruction() }));
    expect(result.current.frameloop).toBe('always');
    act(() => useReconstructionStore.setState({ reconstruction: null }));
    expect(result.current.frameloop).toBe('demand');
  });

  it('keeps static image selection demand-eligible while recording still requires continuous frames', () => {
    useCameraStore.setState({ selectionColorMode: 'static' });
    useReconstructionStore.setState({ reconstruction: buildReconstruction() });
    const { result } = renderHook(useSceneRenderStoreFacade);
    act(() => useCameraStore.setState({ selectedImageId: 1 }));
    expect(result.current.frameloop).toBe('demand');
    act(() => useExportStore.setState({ isRecordingGif: true }));
    expect(result.current.frameloop).toBe('always');
    act(() => useExportStore.setState({ isRecordingGif: false }));
    expect(result.current.frameloop).toBe('demand');
  });

  it('keeps all loaded splat backends continuous even when the layer is hidden', () => {
    const { result } = renderHook(useSceneRenderStoreFacade);
    act(() => useReconstructionStore.setState({ loadedFiles: buildLoadedFiles({ splatFile: buildFile('test.ply') }) }));
    expect(result.current.frameloop).toBe('always');
    act(() => useReconstructionStore.setState({ loadedFiles: null }));
    expect(result.current.frameloop).toBe('demand');
  });

  it('wakes for display changes while FPS and camera reports cannot cause a frame loop', () => {
    const wake = vi.fn();
    const unsubscribe = subscribeSceneRenderStores(wake);
    useUIStore.getState().setFps(60);
    useCameraStore.setState({ currentViewState: { position: [1, 2, 3], quaternion: [0, 0, 0, 1], target: [0, 0, 0], distance: 5 } });
    expect(wake).not.toHaveBeenCalled();
    usePointCloudStore.getState().setPointSize(3);
    useCameraStore.getState().setSelectedImageId(2);
    expect(wake).toHaveBeenCalledTimes(2);
    unsubscribe();
    useCameraStore.getState().setSelectedImageId(null);
    expect(wake).toHaveBeenCalledTimes(2);
  });
});
