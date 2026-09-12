import { useLayoutEffect } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { create } from 'zustand';
import { PerspectiveCamera } from 'three';
import {
  useCameraStore, useExportStore, useFloorPlaneStore, useReconstructionStore,
  useRigStore, useUIStore,
} from '../../store';
import { buildFile, buildLoadedFiles, buildReconstruction } from '../../test/builders';
import { SceneRenderWakeups } from './SceneRenderWakeups';

const fiber = vi.hoisted(() => ({ useThree: vi.fn() }));
vi.mock('@react-three/fiber', () => ({ useThree: fiber.useThree }));

type Frameloop = 'always' | 'demand' | 'never';

function createSceneState() {
  return create(() => ({
    gl: { domElement: document.createElement('canvas') },
    camera: new PerspectiveCamera(),
    size: { width: 800, height: 600 },
    viewport: { dpr: 1 },
    frameloop: 'demand' as Frameloop,
    setFrameloop: vi.fn<(mode: Frameloop) => void>(),
    invalidate: vi.fn(),
  }));
}

let scene = createSceneState();

beforeEach(() => {
  useCameraStore.setState(useCameraStore.getInitialState(), true);
  useExportStore.setState(useExportStore.getInitialState(), true);
  useFloorPlaneStore.setState(useFloorPlaneStore.getInitialState(), true);
  useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
  useRigStore.setState(useRigStore.getInitialState(), true);
  useUIStore.setState(useUIStore.getInitialState(), true);
  scene = createSceneState();
  scene.getState().setFrameloop.mockImplementation((frameloop) => scene.setState({ frameloop }));
  fiber.useThree.mockImplementation(scene);
});

afterEach(cleanup);

describe('scene frame mode inside the canvas', () => {
  it('switches selection animation without rerendering the canvas owner or resetting an unchanged mode', () => {
    useCameraStore.setState({ selectionColorMode: 'static' });
    useReconstructionStore.setState({ reconstruction: buildReconstruction() });
    const ownerRender = vi.fn();
    function CanvasOwner() {
      ownerRender();
      return <SceneRenderWakeups />;
    }
    render(<CanvasOwner />);
    const { setFrameloop, invalidate } = scene.getState();
    expect(setFrameloop).not.toHaveBeenCalled();
    invalidate.mockClear();

    act(() => useCameraStore.setState({ selectedImageId: 1, selectionColorMode: 'rainbow' }));
    expect(scene.getState().frameloop).toBe('always');
    expect(setFrameloop).toHaveBeenCalledExactlyOnceWith('always');
    expect(invalidate).toHaveBeenCalled();

    act(() => useCameraStore.setState({ selectedImageId: 2 }));
    expect(setFrameloop).toHaveBeenCalledTimes(1);
    act(() => useCameraStore.setState({ selectionColorMode: 'static' }));
    expect(scene.getState().frameloop).toBe('demand');
    expect(setFrameloop).toHaveBeenLastCalledWith('demand');
    expect(setFrameloop).toHaveBeenCalledTimes(2);
    expect(ownerRender).toHaveBeenCalledOnce();
  });

  it('keeps the configured animation loop running through first selection and deselection', () => {
    useCameraStore.setState({ selectionColorMode: 'rainbow' });
    useReconstructionStore.setState({ reconstruction: buildReconstruction() });
    render(<SceneRenderWakeups />);
    const { setFrameloop } = scene.getState();
    expect(scene.getState().frameloop).toBe('always');
    expect(setFrameloop).toHaveBeenCalledExactlyOnceWith('always');

    act(() => useCameraStore.setState({ selectedImageId: 1 }));
    act(() => useCameraStore.setState({ selectedImageId: null }));
    expect(scene.getState().frameloop).toBe('always');
    expect(setFrameloop).toHaveBeenCalledTimes(1);
  });

  it('starts loaded splats continuously before sibling layout work and restores the mode after Canvas reconfiguration', () => {
    useReconstructionStore.setState({ loadedFiles: buildLoadedFiles({ splatFile: buildFile('scene.ply') }) });
    let siblingMode: Frameloop | undefined;
    function SiblingLayoutObserver() {
      useLayoutEffect(() => { siblingMode = scene.getState().frameloop; }, []);
      return null;
    }
    render(<><SceneRenderWakeups /><SiblingLayoutObserver /></>);
    const { setFrameloop, invalidate } = scene.getState();
    expect(siblingMode).toBe('always');
    expect(setFrameloop).toHaveBeenCalledExactlyOnceWith('always');
    invalidate.mockClear();

    // Canvas.configure can restore its initial demand prop on an unrelated update.
    act(() => scene.setState({ frameloop: 'demand' }));
    expect(scene.getState().frameloop).toBe('always');
    expect(setFrameloop).toHaveBeenCalledTimes(2);
    expect(invalidate).toHaveBeenCalledOnce();

    act(() => useReconstructionStore.setState({ loadedFiles: null }));
    expect(scene.getState().frameloop).toBe('demand');
  });

  it('keeps recording continuous when selection animation is disabled and settles only after recording ends', () => {
    useCameraStore.setState({ selectionColorMode: 'static' });
    useReconstructionStore.setState({ reconstruction: buildReconstruction() });
    render(<SceneRenderWakeups />);
    act(() => useCameraStore.setState({ selectedImageId: 1, selectionColorMode: 'blink' }));
    act(() => useExportStore.setState({ isRecordingGif: true }));
    act(() => useCameraStore.setState({ selectedImageId: null, selectionColorMode: 'static' }));
    expect(scene.getState().frameloop).toBe('always');
    expect(scene.getState().setFrameloop).toHaveBeenCalledExactlyOnceWith('always');

    act(() => useExportStore.setState({ isRecordingGif: false }));
    expect(scene.getState().frameloop).toBe('demand');
    expect(scene.getState().setFrameloop).toHaveBeenCalledTimes(2);
  });
});
