import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { NavigationNodeActions, SelectionNodeActions } from '../../nodes';
import type { CameraViewState, NavigationHistoryEntry } from '../../store/types';
import { buildCamera, buildFile, buildImage } from '../../test/builders';
import { CAMERA_FRUSTUM_CURSOR_OWNER } from './cameraFrustumConstants';
import type { CameraFrustumItem } from './cameraFrustumViewModel';
import { useCameraFrustumNavigationHandlers } from './useCameraFrustumNavigationHandlers';

function createNavigationActions(): NavigationNodeActions {
  return {
    setMode: vi.fn(),
    setProjection: vi.fn(),
    setFov: vi.fn(),
    setHorizonLock: vi.fn(),
    setAutoRotateMode: vi.fn(),
    setAutoRotateSpeed: vi.fn(),
    setFlySpeed: vi.fn(),
    setFlyTransitionDuration: vi.fn(),
    setPointerLock: vi.fn(),
    setAutoFovEnabled: vi.fn(),
    flyToImage: vi.fn(),
    flyToState: vi.fn(),
    clearFlyTo: vi.fn(),
    clearFlyToViewState: vi.fn(),
    setCurrentViewState: vi.fn(),
    pushNavigationHistory: vi.fn(),
    popNavigationHistory: vi.fn(),
    peekNavigationHistory: vi.fn(),
    clearNavigationHistory: vi.fn(),
  };
}

function createSelectionActions(): SelectionNodeActions {
  return {
    setVisible: vi.fn(),
    setColorMode: vi.fn(),
    setColor: vi.fn(),
    setAnimationSpeed: vi.fn(),
    setPlaneOpacity: vi.fn(),
    setUnselectedOpacity: vi.fn(),
    setSelectedImageId: vi.fn(),
    toggleSelectedImageId: vi.fn(),
    toggleVisible: vi.fn(),
  };
}

function buildViewState(offset: number): CameraViewState {
  return {
    position: [offset, 0, 0],
    quaternion: [1, 0, 0, 0],
    target: [0, 0, 0],
    distance: 1,
  };
}

function buildFrustum(imageId: number, imageFile?: File): CameraFrustumItem {
  const camera = buildCamera({
    width: 800,
    height: 400,
    params: [200, 200, 400, 200],
  });
  const image = buildImage({ imageId, cameraId: camera.cameraId, name: `image-${imageId}.jpg` });

  return {
    image,
    camera,
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    imageFile,
    cameraIndex: 0,
    numPoints3D: 0,
  };
}

function createOptions(overrides: Partial<Parameters<typeof useCameraFrustumNavigationHandlers>[0]> = {}) {
  const navActions = createNavigationActions();
  const selectionActions = createSelectionActions();
  const targetFile = buildFile('image-20.jpg');
  const targetFrustum = buildFrustum(20, targetFile);

  return {
    options: {
      frustums: [targetFrustum],
      selectedImageId: 10,
      matchedImageIds: new Set<number>(),
      controls: { getCurrentViewState: vi.fn(() => buildViewState(0)) },
      viewportSize: { width: 1000, height: 500 },
      cameraFov: 150,
      cameraScale: 2,
      autoFovEnabled: true,
      navActions,
      selectionActions,
      openImageDetail: vi.fn(),
      setMatchedImageId: vi.fn(),
      setShowMatchesInModal: vi.fn(),
      setHoveredImageId: vi.fn(),
      requestHoverRefresh: vi.fn(),
      clearCursor: vi.fn(),
      prioritizeTexture: vi.fn(),
      showUndistortionTip: vi.fn(),
      defer: (callback: () => void) => callback(),
      ...overrides,
    },
    navActions,
    selectionActions,
    targetFile,
    targetFrustum,
  };
}

describe('useCameraFrustumNavigationHandlers', () => {
  it('opens the selected image detail on click and selects unselected images', () => {
    const { options, selectionActions } = createOptions();
    const { result } = renderHook(() => useCameraFrustumNavigationHandlers(options));

    act(() => result.current.handleArrowClick(10));
    act(() => result.current.handleArrowClick(20));

    expect(options.openImageDetail).toHaveBeenCalledWith(10);
    expect(selectionActions.setSelectedImageId).toHaveBeenCalledWith(20);
  });

  it('opens matched-image detail instead of navigating', () => {
    const { options, navActions } = createOptions({
      matchedImageIds: new Set([20]),
    });
    const { result } = renderHook(() => useCameraFrustumNavigationHandlers(options));

    act(() => result.current.handleArrowContextMenu(20));

    expect(options.setShowMatchesInModal).toHaveBeenCalledWith(true);
    expect(options.setMatchedImageId).toHaveBeenNthCalledWith(1, 20);
    expect(options.openImageDetail).toHaveBeenCalledWith(10);
    expect(options.setMatchedImageId).toHaveBeenNthCalledWith(2, 20);
    expect(navActions.flyToImage).not.toHaveBeenCalled();
  });

  it('goes back through navigation history for the current target', () => {
    const historyEntry: NavigationHistoryEntry = {
      fromState: buildViewState(5),
      fromImageId: 10,
      toImageId: 20,
    };
    const { options, navActions, selectionActions } = createOptions({
      selectedImageId: 20,
    });
    vi.mocked(navActions.peekNavigationHistory).mockReturnValue(historyEntry);
    vi.mocked(navActions.popNavigationHistory).mockReturnValue(historyEntry);
    const { result } = renderHook(() => useCameraFrustumNavigationHandlers(options));

    act(() => result.current.handleArrowContextMenu(20));

    expect(options.setHoveredImageId).toHaveBeenCalledWith(null);
    expect(options.clearCursor).toHaveBeenCalledWith(CAMERA_FRUSTUM_CURSOR_OWNER);
    expect(options.requestHoverRefresh).toHaveBeenCalledOnce();
    expect(navActions.flyToState).toHaveBeenCalledWith(historyEntry.fromState);
    expect(selectionActions.setSelectedImageId).toHaveBeenCalledWith(10);
    expect(navActions.flyToImage).not.toHaveBeenCalled();
  });

  it('pushes history, prioritizes texture, adjusts FOV, and flies to a new target', () => {
    const currentViewState = buildViewState(2);
    const { options, navActions, selectionActions, targetFile, targetFrustum } = createOptions({
      controls: { getCurrentViewState: vi.fn(() => currentViewState) },
    });
    const { result } = renderHook(() => useCameraFrustumNavigationHandlers(options));

    act(() => result.current.handleArrowContextMenu(20));

    expect(options.prioritizeTexture).toHaveBeenCalledWith(targetFile, targetFrustum.image.name);
    expect(navActions.pushNavigationHistory).toHaveBeenCalledWith({
      fromState: currentViewState,
      fromImageId: 10,
      toImageId: 20,
    });
    expect(options.setHoveredImageId).toHaveBeenCalledWith(null);
    expect(options.clearCursor).toHaveBeenCalledWith(CAMERA_FRUSTUM_CURSOR_OWNER);
    expect(navActions.setFov).toHaveBeenCalledWith(expect.closeTo(102.68, 2));
    expect(selectionActions.setSelectedImageId).toHaveBeenCalledWith(20);
    expect(navActions.flyToImage).toHaveBeenCalledWith(20);
    expect(options.showUndistortionTip).toHaveBeenCalledWith(targetFrustum.camera);
  });

  it('executes explicit context-menu goto with history and closes the menu', () => {
    const currentViewState = buildViewState(4);
    const { options, navActions } = createOptions({
      controls: { getCurrentViewState: vi.fn(() => currentViewState) },
    });
    const { result } = renderHook(() => useCameraFrustumNavigationHandlers(options));

    act(() => {
      result.current.setContextMenu({
        imageId: 20,
        position: new THREE.Vector3(),
        quaternion: new THREE.Quaternion(),
        planeDepth: 1,
        planeWidth: 1,
        planeHeight: 1,
      });
    });
    act(() => result.current.handleContextMenuGoto());

    expect(navActions.pushNavigationHistory).toHaveBeenCalledWith({
      fromState: currentViewState,
      fromImageId: 10,
      toImageId: 20,
    });
    expect(navActions.flyToImage).toHaveBeenCalledWith(20);
    expect(result.current.contextMenu).toBeNull();
  });
});
