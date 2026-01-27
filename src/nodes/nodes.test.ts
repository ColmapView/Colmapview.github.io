import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Hooks
import { usePointsNode } from './hooks/usePointsNode';
import { useCamerasNode } from './hooks/useCamerasNode';
import { useSelectionNode } from './hooks/useSelectionNode';
import { useNavigationNode } from './hooks/useNavigationNode';
import { useMatchesNode } from './hooks/useMatchesNode';
import { useRigNode } from './hooks/useRigNode';
import { useAxesNode } from './hooks/useAxesNode';
import { useGridNode } from './hooks/useGridNode';
import { useGizmoNode } from './hooks/useGizmoNode';

// Actions
import { usePointsNodeActions } from './actions/pointsActions';
import { useCamerasNodeActions } from './actions/camerasActions';
import { useSelectionNodeActions } from './actions/selectionActions';
import { useNavigationNodeActions } from './actions/navigationActions';
import { useMatchesNodeActions } from './actions/matchesActions';
import { useRigNodeActions } from './actions/rigActions';
import { useAxesNodeActions } from './actions/axesActions';
import { useGridNodeActions } from './actions/gridActions';
import { useGizmoNodeActions } from './actions/gizmoActions';

// Stores (for reset)
import { usePointCloudStore } from '../store/stores/pointCloudStore';
import { useCameraStore } from '../store/stores/cameraStore';
import { useUIStore } from '../store/stores/uiStore';
import { useRigStore } from '../store/stores/rigStore';

// Type guards
import { isVisibleNode, isVisualNode } from './types/base';

describe('Node Hooks', () => {
  beforeEach(() => {
    // Reset stores to default state
    usePointCloudStore.setState(usePointCloudStore.getInitialState());
    useCameraStore.setState(useCameraStore.getInitialState());
    useUIStore.setState(useUIStore.getInitialState());
    useRigStore.setState(useRigStore.getInitialState());
  });

  describe('usePointsNode', () => {
    it('returns correct nodeType', () => {
      const { result } = renderHook(() => usePointsNode());
      expect(result.current.nodeType).toBe('points');
    });

    it('implements VisualNode (has visible and opacity)', () => {
      const { result } = renderHook(() => usePointsNode());
      expect(isVisualNode(result.current)).toBe(true);
      expect(typeof result.current.visible).toBe('boolean');
      expect(typeof result.current.opacity).toBe('number');
    });

    it('returns all expected properties', () => {
      const { result } = renderHook(() => usePointsNode());
      expect(result.current).toHaveProperty('size');
      expect(result.current).toHaveProperty('colorMode');
      expect(result.current).toHaveProperty('minTrackLength');
      expect(result.current).toHaveProperty('maxReprojectionError');
      expect(result.current).toHaveProperty('thinning');
      expect(result.current).toHaveProperty('selectedPointId');
    });

    it('converts Infinity to null for maxReprojectionError', () => {
      usePointCloudStore.setState({ maxReprojectionError: Infinity });
      const { result } = renderHook(() => usePointsNode());
      expect(result.current.maxReprojectionError).toBeNull();
    });

    it('preserves finite maxReprojectionError values', () => {
      usePointCloudStore.setState({ maxReprojectionError: 2.5 });
      const { result } = renderHook(() => usePointsNode());
      expect(result.current.maxReprojectionError).toBe(2.5);
    });
  });

  describe('useCamerasNode', () => {
    it('returns correct nodeType', () => {
      const { result } = renderHook(() => useCamerasNode());
      expect(result.current.nodeType).toBe('cameras');
    });

    it('implements VisibleNode but not VisualNode', () => {
      const { result } = renderHook(() => useCamerasNode());
      expect(isVisibleNode(result.current)).toBe(true);
      expect(isVisualNode(result.current)).toBe(false);
    });

    it('has domain-specific standbyOpacity instead of opacity', () => {
      const { result } = renderHook(() => useCamerasNode());
      expect(result.current).toHaveProperty('standbyOpacity');
      expect(result.current).not.toHaveProperty('opacity');
    });

    it('returns all expected properties', () => {
      const { result } = renderHook(() => useCamerasNode());
      expect(result.current).toHaveProperty('displayMode');
      expect(result.current).toHaveProperty('scale');
      expect(result.current).toHaveProperty('scaleFactor');
      expect(result.current).toHaveProperty('colorMode');
      expect(result.current).toHaveProperty('singleColor');
      expect(result.current).toHaveProperty('undistortionEnabled');
      expect(result.current).toHaveProperty('undistortionMode');
    });
  });

  describe('useSelectionNode', () => {
    it('returns correct nodeType', () => {
      const { result } = renderHook(() => useSelectionNode());
      expect(result.current.nodeType).toBe('selection');
    });

    it('implements VisibleNode but not VisualNode', () => {
      const { result } = renderHook(() => useSelectionNode());
      expect(isVisibleNode(result.current)).toBe(true);
      expect(isVisualNode(result.current)).toBe(false);
    });

    it('has domain-specific opacity properties', () => {
      const { result } = renderHook(() => useSelectionNode());
      expect(result.current).toHaveProperty('planeOpacity');
      expect(result.current).toHaveProperty('unselectedOpacity');
      expect(result.current).not.toHaveProperty('opacity');
    });

    it('returns all expected properties', () => {
      const { result } = renderHook(() => useSelectionNode());
      expect(result.current).toHaveProperty('colorMode');
      expect(result.current).toHaveProperty('color');
      expect(result.current).toHaveProperty('animationSpeed');
      expect(result.current).toHaveProperty('selectedImageId');
    });
  });

  describe('useNavigationNode', () => {
    it('returns correct nodeType', () => {
      const { result } = renderHook(() => useNavigationNode());
      expect(result.current.nodeType).toBe('navigation');
    });

    it('does not implement VisibleNode (non-visual node)', () => {
      const { result } = renderHook(() => useNavigationNode());
      expect(isVisibleNode(result.current)).toBe(false);
      expect(isVisualNode(result.current)).toBe(false);
    });

    it('returns all expected properties', () => {
      const { result } = renderHook(() => useNavigationNode());
      expect(result.current).toHaveProperty('mode');
      expect(result.current).toHaveProperty('projection');
      expect(result.current).toHaveProperty('fov');
      expect(result.current).toHaveProperty('horizonLock');
      expect(result.current).toHaveProperty('autoRotateMode');
      expect(result.current).toHaveProperty('autoRotateSpeed');
      expect(result.current).toHaveProperty('flySpeed');
      expect(result.current).toHaveProperty('flyTransitionDuration');
      expect(result.current).toHaveProperty('pointerLock');
      expect(result.current).toHaveProperty('autoFovEnabled');
    });
  });

  describe('useMatchesNode', () => {
    it('returns correct nodeType', () => {
      const { result } = renderHook(() => useMatchesNode());
      expect(result.current.nodeType).toBe('matches');
    });

    it('implements VisualNode', () => {
      const { result } = renderHook(() => useMatchesNode());
      expect(isVisualNode(result.current)).toBe(true);
    });

    it('returns all expected properties', () => {
      const { result } = renderHook(() => useMatchesNode());
      expect(result.current).toHaveProperty('displayMode');
      expect(result.current).toHaveProperty('color');
    });
  });

  describe('useRigNode', () => {
    it('returns correct nodeType', () => {
      const { result } = renderHook(() => useRigNode());
      expect(result.current.nodeType).toBe('rig');
    });

    it('implements VisualNode', () => {
      const { result } = renderHook(() => useRigNode());
      expect(isVisualNode(result.current)).toBe(true);
    });

    it('returns all expected properties', () => {
      const { result } = renderHook(() => useRigNode());
      expect(result.current).toHaveProperty('displayMode');
      expect(result.current).toHaveProperty('colorMode');
      expect(result.current).toHaveProperty('color');
    });
  });

  describe('useAxesNode', () => {
    it('returns correct nodeType', () => {
      const { result } = renderHook(() => useAxesNode());
      expect(result.current.nodeType).toBe('axes');
    });

    it('implements VisibleNode but not VisualNode', () => {
      const { result } = renderHook(() => useAxesNode());
      expect(isVisibleNode(result.current)).toBe(true);
      expect(isVisualNode(result.current)).toBe(false);
    });

    it('returns all expected properties', () => {
      const { result } = renderHook(() => useAxesNode());
      expect(result.current).toHaveProperty('coordinateSystem');
      expect(result.current).toHaveProperty('scale');
      expect(result.current).toHaveProperty('labelMode');
    });
  });

  describe('useGridNode', () => {
    it('returns correct nodeType', () => {
      const { result } = renderHook(() => useGridNode());
      expect(result.current.nodeType).toBe('grid');
    });

    it('implements VisibleNode but not VisualNode', () => {
      const { result } = renderHook(() => useGridNode());
      expect(isVisibleNode(result.current)).toBe(true);
      expect(isVisualNode(result.current)).toBe(false);
    });

    it('returns all expected properties', () => {
      const { result } = renderHook(() => useGridNode());
      expect(result.current).toHaveProperty('scale');
    });
  });

  describe('useGizmoNode', () => {
    it('returns correct nodeType', () => {
      const { result } = renderHook(() => useGizmoNode());
      expect(result.current.nodeType).toBe('gizmo');
    });

    it('implements VisibleNode but not VisualNode', () => {
      const { result } = renderHook(() => useGizmoNode());
      expect(isVisibleNode(result.current)).toBe(true);
      expect(isVisualNode(result.current)).toBe(false);
    });
  });
});

describe('Node Actions', () => {
  beforeEach(() => {
    // Reset stores to default state
    usePointCloudStore.setState(usePointCloudStore.getInitialState());
    useCameraStore.setState(useCameraStore.getInitialState());
    useUIStore.setState(useUIStore.getInitialState());
    useRigStore.setState(useRigStore.getInitialState());
  });

  describe('usePointsNodeActions', () => {
    it('setVisible updates store', () => {
      const { result } = renderHook(() => usePointsNodeActions());
      act(() => result.current.setVisible(false));
      expect(usePointCloudStore.getState().showPointCloud).toBe(false);
    });

    it('setOpacity updates store', () => {
      const { result } = renderHook(() => usePointsNodeActions());
      act(() => result.current.setOpacity(0.5));
      expect(usePointCloudStore.getState().pointOpacity).toBe(0.5);
    });

    it('setSize updates store', () => {
      const { result } = renderHook(() => usePointsNodeActions());
      act(() => result.current.setSize(5));
      expect(usePointCloudStore.getState().pointSize).toBe(5);
    });

    it('setColorMode updates store', () => {
      const { result } = renderHook(() => usePointsNodeActions());
      act(() => result.current.setColorMode('height'));
      expect(usePointCloudStore.getState().colorMode).toBe('height');
    });

    it('setMinTrackLength updates store', () => {
      const { result } = renderHook(() => usePointsNodeActions());
      act(() => result.current.setMinTrackLength(5));
      expect(usePointCloudStore.getState().minTrackLength).toBe(5);
    });

    it('setMaxReprojectionError updates store with finite value', () => {
      const { result } = renderHook(() => usePointsNodeActions());
      act(() => result.current.setMaxReprojectionError(2.5));
      expect(usePointCloudStore.getState().maxReprojectionError).toBe(2.5);
    });

    it('setMaxReprojectionError converts null to Infinity', () => {
      const { result } = renderHook(() => usePointsNodeActions());
      act(() => result.current.setMaxReprojectionError(null));
      expect(usePointCloudStore.getState().maxReprojectionError).toBe(Infinity);
    });

    it('setThinning updates store', () => {
      const { result } = renderHook(() => usePointsNodeActions());
      act(() => result.current.setThinning(4));
      expect(usePointCloudStore.getState().thinning).toBe(4);
    });

    it('setSelectedPointId updates store', () => {
      const { result } = renderHook(() => usePointsNodeActions());
      act(() => result.current.setSelectedPointId(BigInt(123)));
      expect(usePointCloudStore.getState().selectedPointId).toBe(BigInt(123));
    });

    it('setSelectedPointId accepts null', () => {
      const { result } = renderHook(() => usePointsNodeActions());
      act(() => result.current.setSelectedPointId(BigInt(123)));
      act(() => result.current.setSelectedPointId(null));
      expect(usePointCloudStore.getState().selectedPointId).toBeNull();
    });

    it('toggleVisible toggles store value', () => {
      const initial = usePointCloudStore.getState().showPointCloud;
      const { result } = renderHook(() => usePointsNodeActions());
      act(() => result.current.toggleVisible());
      expect(usePointCloudStore.getState().showPointCloud).toBe(!initial);
    });
  });

  describe('useCamerasNodeActions', () => {
    it('setVisible updates store', () => {
      const { result } = renderHook(() => useCamerasNodeActions());
      act(() => result.current.setVisible(false));
      expect(useCameraStore.getState().showCameras).toBe(false);
    });

    it('setDisplayMode updates store', () => {
      const { result } = renderHook(() => useCamerasNodeActions());
      act(() => result.current.setDisplayMode('image'));
      expect(useCameraStore.getState().cameraDisplayMode).toBe('image');
    });

    it('setScale updates store', () => {
      const { result } = renderHook(() => useCamerasNodeActions());
      act(() => result.current.setScale(0.5));
      expect(useCameraStore.getState().cameraScale).toBe(0.5);
    });

    it('setScaleFactor updates store', () => {
      const { result } = renderHook(() => useCamerasNodeActions());
      act(() => result.current.setScaleFactor('focal'));
      expect(useCameraStore.getState().cameraScaleFactor).toBe('focal');
    });

    it('setColorMode updates store', () => {
      const { result } = renderHook(() => useCamerasNodeActions());
      act(() => result.current.setColorMode('single'));
      expect(useCameraStore.getState().frustumColorMode).toBe('single');
    });

    it('setSingleColor updates store', () => {
      const { result } = renderHook(() => useCamerasNodeActions());
      act(() => result.current.setSingleColor('#ff0000'));
      expect(useCameraStore.getState().frustumSingleColor).toBe('#ff0000');
    });

    it('setStandbyOpacity updates store', () => {
      const { result } = renderHook(() => useCamerasNodeActions());
      act(() => result.current.setStandbyOpacity(0.3));
      expect(useCameraStore.getState().frustumStandbyOpacity).toBe(0.3);
    });

    it('setUndistortionEnabled updates store', () => {
      const { result } = renderHook(() => useCamerasNodeActions());
      act(() => result.current.setUndistortionEnabled(true));
      expect(useCameraStore.getState().undistortionEnabled).toBe(true);
    });

    it('setUndistortionMode updates store', () => {
      const { result } = renderHook(() => useCamerasNodeActions());
      act(() => result.current.setUndistortionMode('iterative'));
      expect(useCameraStore.getState().undistortionMode).toBe('iterative');
    });

    it('toggleVisible toggles store value', () => {
      const initial = useCameraStore.getState().showCameras;
      const { result } = renderHook(() => useCamerasNodeActions());
      act(() => result.current.toggleVisible());
      expect(useCameraStore.getState().showCameras).toBe(!initial);
    });
  });

  describe('useSelectionNodeActions', () => {
    it('setVisible updates store', () => {
      const { result } = renderHook(() => useSelectionNodeActions());
      act(() => result.current.setVisible(false));
      expect(useCameraStore.getState().showSelectionHighlight).toBe(false);
    });

    it('setColorMode updates store', () => {
      const { result } = renderHook(() => useSelectionNodeActions());
      act(() => result.current.setColorMode('custom'));
      expect(useCameraStore.getState().selectionColorMode).toBe('custom');
    });

    it('setColor updates store', () => {
      const { result } = renderHook(() => useSelectionNodeActions());
      act(() => result.current.setColor('#00ff00'));
      expect(useCameraStore.getState().selectionColor).toBe('#00ff00');
    });

    it('setAnimationSpeed updates store', () => {
      const { result } = renderHook(() => useSelectionNodeActions());
      act(() => result.current.setAnimationSpeed(2.5));
      expect(useCameraStore.getState().selectionAnimationSpeed).toBe(2.5);
    });

    it('setPlaneOpacity updates store', () => {
      const { result } = renderHook(() => useSelectionNodeActions());
      act(() => result.current.setPlaneOpacity(0.4));
      expect(useCameraStore.getState().selectionPlaneOpacity).toBe(0.4);
    });

    it('setUnselectedOpacity updates store', () => {
      const { result } = renderHook(() => useSelectionNodeActions());
      act(() => result.current.setUnselectedOpacity(0.2));
      expect(useCameraStore.getState().unselectedCameraOpacity).toBe(0.2);
    });

    it('setSelectedImageId updates store', () => {
      const { result } = renderHook(() => useSelectionNodeActions());
      act(() => result.current.setSelectedImageId(42));
      expect(useCameraStore.getState().selectedImageId).toBe(42);
    });

    it('setSelectedImageId accepts null to deselect', () => {
      const { result } = renderHook(() => useSelectionNodeActions());
      act(() => result.current.setSelectedImageId(42));
      act(() => result.current.setSelectedImageId(null));
      expect(useCameraStore.getState().selectedImageId).toBeNull();
    });

    it('toggleSelectedImageId selects when not selected', () => {
      const { result } = renderHook(() => useSelectionNodeActions());
      act(() => result.current.setSelectedImageId(null));
      act(() => result.current.toggleSelectedImageId(5));
      expect(useCameraStore.getState().selectedImageId).toBe(5);
    });

    it('toggleSelectedImageId deselects when already selected', () => {
      const { result } = renderHook(() => useSelectionNodeActions());
      act(() => result.current.setSelectedImageId(5));
      act(() => result.current.toggleSelectedImageId(5));
      expect(useCameraStore.getState().selectedImageId).toBeNull();
    });

    it('toggleVisible toggles store value', () => {
      const initial = useCameraStore.getState().showSelectionHighlight;
      const { result } = renderHook(() => useSelectionNodeActions());
      act(() => result.current.toggleVisible());
      expect(useCameraStore.getState().showSelectionHighlight).toBe(!initial);
    });
  });

  describe('useNavigationNodeActions', () => {
    it('setMode updates store', () => {
      const { result } = renderHook(() => useNavigationNodeActions());
      act(() => result.current.setMode('fly'));
      expect(useCameraStore.getState().cameraMode).toBe('fly');
    });

    it('setProjection updates store', () => {
      const { result } = renderHook(() => useNavigationNodeActions());
      act(() => result.current.setProjection('orthographic'));
      expect(useCameraStore.getState().cameraProjection).toBe('orthographic');
    });

    it('setFov updates store', () => {
      const { result } = renderHook(() => useNavigationNodeActions());
      act(() => result.current.setFov(75));
      expect(useCameraStore.getState().cameraFov).toBe(75);
    });

    it('setHorizonLock updates store', () => {
      const { result } = renderHook(() => useNavigationNodeActions());
      act(() => result.current.setHorizonLock('soft'));
      expect(useCameraStore.getState().horizonLock).toBe('soft');
    });

    it('setAutoRotateMode updates store', () => {
      const { result } = renderHook(() => useNavigationNodeActions());
      act(() => result.current.setAutoRotateMode('clockwise'));
      expect(useCameraStore.getState().autoRotateMode).toBe('clockwise');
    });

    it('setAutoRotateSpeed updates store', () => {
      const { result } = renderHook(() => useNavigationNodeActions());
      act(() => result.current.setAutoRotateSpeed(2.0));
      expect(useCameraStore.getState().autoRotateSpeed).toBe(2.0);
    });

    it('setFlySpeed updates store', () => {
      const { result } = renderHook(() => useNavigationNodeActions());
      act(() => result.current.setFlySpeed(15));
      expect(useCameraStore.getState().flySpeed).toBe(15);
    });

    it('setFlyTransitionDuration updates store', () => {
      const { result } = renderHook(() => useNavigationNodeActions());
      act(() => result.current.setFlyTransitionDuration(500));
      expect(useCameraStore.getState().flyTransitionDuration).toBe(500);
    });

    it('setPointerLock updates store', () => {
      const { result } = renderHook(() => useNavigationNodeActions());
      act(() => result.current.setPointerLock(true));
      expect(useCameraStore.getState().pointerLock).toBe(true);
    });

    it('setAutoFovEnabled updates store', () => {
      const { result } = renderHook(() => useNavigationNodeActions());
      act(() => result.current.setAutoFovEnabled(false));
      expect(useCameraStore.getState().autoFovEnabled).toBe(false);
    });

    it('flyToImage sets flyToImageId', () => {
      const { result } = renderHook(() => useNavigationNodeActions());
      act(() => result.current.flyToImage(123));
      expect(useCameraStore.getState().flyToImageId).toBe(123);
    });

    it('clearFlyTo clears flyToImageId', () => {
      const { result } = renderHook(() => useNavigationNodeActions());
      act(() => result.current.flyToImage(123));
      act(() => result.current.clearFlyTo());
      expect(useCameraStore.getState().flyToImageId).toBeNull();
    });

    it('flyToState sets flyToViewState', () => {
      const { result } = renderHook(() => useNavigationNodeActions());
      const viewState = { position: [1, 2, 3], target: [0, 0, 0], up: [0, 1, 0] };
      act(() => result.current.flyToState(viewState as any));
      expect(useCameraStore.getState().flyToViewState).toEqual(viewState);
    });

    it('clearFlyToViewState clears flyToViewState', () => {
      const { result } = renderHook(() => useNavigationNodeActions());
      const viewState = { position: [1, 2, 3], target: [0, 0, 0], up: [0, 1, 0] };
      act(() => result.current.flyToState(viewState as any));
      act(() => result.current.clearFlyToViewState());
      expect(useCameraStore.getState().flyToViewState).toBeNull();
    });

    it('setCurrentViewState updates store', () => {
      const { result } = renderHook(() => useNavigationNodeActions());
      const viewState = { position: [4, 5, 6], target: [1, 1, 1], up: [0, 1, 0] };
      act(() => result.current.setCurrentViewState(viewState as any));
      expect(useCameraStore.getState().currentViewState).toEqual(viewState);
    });

    it('navigation history push/pop/peek work correctly', () => {
      const { result } = renderHook(() => useNavigationNodeActions());
      const entry1 = { position: [1, 2, 3], target: [0, 0, 0], up: [0, 1, 0], timestamp: Date.now() };
      const entry2 = { position: [4, 5, 6], target: [1, 1, 1], up: [0, 1, 0], timestamp: Date.now() };

      // Push entries
      act(() => result.current.pushNavigationHistory(entry1 as any));
      act(() => result.current.pushNavigationHistory(entry2 as any));
      expect(useCameraStore.getState().navigationHistory).toHaveLength(2);

      // Peek should return last entry without removing
      let peeked: any;
      act(() => {
        peeked = result.current.peekNavigationHistory();
      });
      expect(peeked).toEqual(entry2);
      expect(useCameraStore.getState().navigationHistory).toHaveLength(2);

      // Pop should return and remove last entry
      let popped: any;
      act(() => {
        popped = result.current.popNavigationHistory();
      });
      expect(popped).toEqual(entry2);
      expect(useCameraStore.getState().navigationHistory).toHaveLength(1);
    });

    it('clearNavigationHistory empties history', () => {
      const { result } = renderHook(() => useNavigationNodeActions());
      const entry = { position: [1, 2, 3], target: [0, 0, 0], up: [0, 1, 0], timestamp: Date.now() };
      act(() => result.current.pushNavigationHistory(entry as any));
      act(() => result.current.clearNavigationHistory());
      expect(useCameraStore.getState().navigationHistory).toHaveLength(0);
    });
  });

  describe('useMatchesNodeActions', () => {
    it('setVisible updates store', () => {
      const { result } = renderHook(() => useMatchesNodeActions());
      act(() => result.current.setVisible(false));
      expect(useUIStore.getState().showMatches).toBe(false);
    });

    it('setDisplayMode updates store', () => {
      const { result } = renderHook(() => useMatchesNodeActions());
      act(() => result.current.setDisplayMode('lines'));
      expect(useUIStore.getState().matchesDisplayMode).toBe('lines');
    });

    it('setOpacity updates store', () => {
      const { result } = renderHook(() => useMatchesNodeActions());
      act(() => result.current.setOpacity(0.7));
      expect(useUIStore.getState().matchesOpacity).toBe(0.7);
    });

    it('setColor updates store', () => {
      const { result } = renderHook(() => useMatchesNodeActions());
      act(() => result.current.setColor('#ff00ff'));
      expect(useUIStore.getState().matchesColor).toBe('#ff00ff');
    });

    it('toggleVisible toggles store value', () => {
      const initial = useUIStore.getState().showMatches;
      const { result } = renderHook(() => useMatchesNodeActions());
      act(() => result.current.toggleVisible());
      expect(useUIStore.getState().showMatches).toBe(!initial);
    });
  });

  describe('useRigNodeActions', () => {
    it('setVisible updates store', () => {
      const { result } = renderHook(() => useRigNodeActions());
      act(() => result.current.setVisible(false));
      expect(useRigStore.getState().showRig).toBe(false);
    });

    it('setDisplayMode updates store', () => {
      const { result } = renderHook(() => useRigNodeActions());
      act(() => result.current.setDisplayMode('lines'));
      expect(useRigStore.getState().rigDisplayMode).toBe('lines');
    });

    it('setColorMode updates store', () => {
      const { result } = renderHook(() => useRigNodeActions());
      act(() => result.current.setColorMode('single'));
      expect(useRigStore.getState().rigColorMode).toBe('single');
    });

    it('setColor updates store', () => {
      const { result } = renderHook(() => useRigNodeActions());
      act(() => result.current.setColor('#00ffff'));
      expect(useRigStore.getState().rigLineColor).toBe('#00ffff');
    });

    it('setOpacity updates store', () => {
      const { result } = renderHook(() => useRigNodeActions());
      act(() => result.current.setOpacity(0.6));
      expect(useRigStore.getState().rigLineOpacity).toBe(0.6);
    });

    it('toggleVisible toggles store value', () => {
      const initial = useRigStore.getState().showRig;
      const { result } = renderHook(() => useRigNodeActions());
      act(() => result.current.toggleVisible());
      expect(useRigStore.getState().showRig).toBe(!initial);
    });
  });

  describe('useAxesNodeActions', () => {
    it('setVisible updates store', () => {
      const { result } = renderHook(() => useAxesNodeActions());
      act(() => result.current.setVisible(false));
      expect(useUIStore.getState().showAxes).toBe(false);
    });

    it('setCoordinateSystem updates store', () => {
      const { result } = renderHook(() => useAxesNodeActions());
      act(() => result.current.setCoordinateSystem('z-up'));
      expect(useUIStore.getState().axesCoordinateSystem).toBe('z-up');
    });

    it('setScale updates store', () => {
      const { result } = renderHook(() => useAxesNodeActions());
      act(() => result.current.setScale(2));
      expect(useUIStore.getState().axesScale).toBe(2);
    });

    it('setLabelMode updates store', () => {
      const { result } = renderHook(() => useAxesNodeActions());
      act(() => result.current.setLabelMode('none'));
      expect(useUIStore.getState().axisLabelMode).toBe('none');
    });

    it('toggleVisible toggles store value', () => {
      const initial = useUIStore.getState().showAxes;
      const { result } = renderHook(() => useAxesNodeActions());
      act(() => result.current.toggleVisible());
      expect(useUIStore.getState().showAxes).toBe(!initial);
    });
  });

  describe('useGridNodeActions', () => {
    it('setVisible updates store', () => {
      const { result } = renderHook(() => useGridNodeActions());
      act(() => result.current.setVisible(false));
      expect(useUIStore.getState().showGrid).toBe(false);
    });

    it('setScale updates store', () => {
      const { result } = renderHook(() => useGridNodeActions());
      act(() => result.current.setScale(5));
      expect(useUIStore.getState().gridScale).toBe(5);
    });

    it('toggleVisible toggles store value', () => {
      const initial = useUIStore.getState().showGrid;
      const { result } = renderHook(() => useGridNodeActions());
      act(() => result.current.toggleVisible());
      expect(useUIStore.getState().showGrid).toBe(!initial);
    });
  });

  describe('useGizmoNodeActions', () => {
    it('setVisible updates store', () => {
      const { result } = renderHook(() => useGizmoNodeActions());
      act(() => result.current.setVisible(false));
      expect(useUIStore.getState().showGizmo).toBe(false);
    });

    it('toggleVisible toggles store value', () => {
      const initial = useUIStore.getState().showGizmo;
      const { result } = renderHook(() => useGizmoNodeActions());
      act(() => result.current.toggleVisible());
      expect(useUIStore.getState().showGizmo).toBe(!initial);
    });
  });
});

describe('Hook Stability', () => {
  beforeEach(() => {
    usePointCloudStore.setState(usePointCloudStore.getInitialState());
  });

  it('node hooks return memoized objects', () => {
    const { result, rerender } = renderHook(() => usePointsNode());
    const first = result.current;
    rerender();
    const second = result.current;
    // Same reference if no state changed
    expect(first).toBe(second);
  });

  it('node hooks return new object when state changes', () => {
    const { result, rerender } = renderHook(() => usePointsNode());
    const first = result.current;
    act(() => usePointCloudStore.setState({ pointSize: 10 }));
    rerender();
    const second = result.current;
    // New reference when state changed
    expect(first).not.toBe(second);
    expect(second.size).toBe(10);
  });

  it('action hooks return stable references', () => {
    const { result, rerender } = renderHook(() => usePointsNodeActions());
    const first = result.current;
    rerender();
    const second = result.current;
    // Actions should be stable
    expect(first).toBe(second);
  });

  it('actions remain stable even when state changes', () => {
    const { result, rerender } = renderHook(() => usePointsNodeActions());
    const first = result.current;
    act(() => usePointCloudStore.setState({ pointSize: 15 }));
    rerender();
    const second = result.current;
    // Actions should remain stable
    expect(first).toBe(second);
  });
});

describe('Node/Action Integration', () => {
  beforeEach(() => {
    usePointCloudStore.setState(usePointCloudStore.getInitialState());
    useCameraStore.setState(useCameraStore.getInitialState());
    useUIStore.setState(useUIStore.getInitialState());
    useRigStore.setState(useRigStore.getInitialState());
  });

  it('actions update values read by hooks', () => {
    const { result: nodeResult, rerender } = renderHook(() => usePointsNode());
    const { result: actionsResult } = renderHook(() => usePointsNodeActions());

    expect(nodeResult.current.size).toBe(2); // default

    act(() => actionsResult.current.setSize(8));
    rerender();

    expect(nodeResult.current.size).toBe(8);
  });

  it('toggle actions properly flip boolean state', () => {
    const { result: nodeResult, rerender } = renderHook(() => usePointsNode());
    const { result: actionsResult } = renderHook(() => usePointsNodeActions());

    const initial = nodeResult.current.visible;

    act(() => actionsResult.current.toggleVisible());
    rerender();
    expect(nodeResult.current.visible).toBe(!initial);

    act(() => actionsResult.current.toggleVisible());
    rerender();
    expect(nodeResult.current.visible).toBe(initial);
  });

  it('cameras node/actions integration', () => {
    const { result: node, rerender } = renderHook(() => useCamerasNode());
    const { result: actions } = renderHook(() => useCamerasNodeActions());

    act(() => actions.current.setScale(0.75));
    act(() => actions.current.setStandbyOpacity(0.5));
    act(() => actions.current.setDisplayMode('image'));
    rerender();

    expect(node.current.scale).toBe(0.75);
    expect(node.current.standbyOpacity).toBe(0.5);
    expect(node.current.displayMode).toBe('image');
  });

  it('selection node/actions integration', () => {
    const { result: node, rerender } = renderHook(() => useSelectionNode());
    const { result: actions } = renderHook(() => useSelectionNodeActions());

    act(() => actions.current.setSelectedImageId(10));
    act(() => actions.current.setPlaneOpacity(0.8));
    rerender();

    expect(node.current.selectedImageId).toBe(10);
    expect(node.current.planeOpacity).toBe(0.8);
  });

  it('matches node/actions integration', () => {
    const { result: node, rerender } = renderHook(() => useMatchesNode());
    const { result: actions } = renderHook(() => useMatchesNodeActions());

    act(() => actions.current.setOpacity(0.9));
    act(() => actions.current.setColor('#123456'));
    rerender();

    expect(node.current.opacity).toBe(0.9);
    expect(node.current.color).toBe('#123456');
  });

  it('rig node/actions integration', () => {
    const { result: node, rerender } = renderHook(() => useRigNode());
    const { result: actions } = renderHook(() => useRigNodeActions());

    act(() => actions.current.setOpacity(0.4));
    act(() => actions.current.setColorMode('single'));
    rerender();

    expect(node.current.opacity).toBe(0.4);
    expect(node.current.colorMode).toBe('single');
  });

  it('navigation node/actions integration', () => {
    const { result: node, rerender } = renderHook(() => useNavigationNode());
    const { result: actions } = renderHook(() => useNavigationNodeActions());

    act(() => actions.current.setMode('fly'));
    act(() => actions.current.setFov(90));
    act(() => actions.current.setProjection('orthographic'));
    rerender();

    expect(node.current.mode).toBe('fly');
    expect(node.current.fov).toBe(90);
    expect(node.current.projection).toBe('orthographic');
  });

  it('axes node/actions integration', () => {
    const { result: node, rerender } = renderHook(() => useAxesNode());
    const { result: actions } = renderHook(() => useAxesNodeActions());

    act(() => actions.current.setScale(3));
    act(() => actions.current.setCoordinateSystem('z-up'));
    act(() => actions.current.setLabelMode('arrows'));
    rerender();

    expect(node.current.scale).toBe(3);
    expect(node.current.coordinateSystem).toBe('z-up');
    expect(node.current.labelMode).toBe('arrows');
  });
});

describe('Edge Cases', () => {
  beforeEach(() => {
    usePointCloudStore.setState(usePointCloudStore.getInitialState());
    useCameraStore.setState(useCameraStore.getInitialState());
    useUIStore.setState(useUIStore.getInitialState());
  });

  it('handles zero opacity', () => {
    const { result } = renderHook(() => usePointsNodeActions());
    act(() => result.current.setOpacity(0));
    expect(usePointCloudStore.getState().pointOpacity).toBe(0);

    const { result: node } = renderHook(() => usePointsNode());
    expect(node.current.opacity).toBe(0);
  });

  it('handles maximum opacity', () => {
    const { result } = renderHook(() => usePointsNodeActions());
    act(() => result.current.setOpacity(1));
    expect(usePointCloudStore.getState().pointOpacity).toBe(1);
  });

  it('handles zero scale', () => {
    const { result } = renderHook(() => useCamerasNodeActions());
    act(() => result.current.setScale(0));
    expect(useCameraStore.getState().cameraScale).toBe(0);
  });

  it('handles negative values where allowed', () => {
    // FOV can theoretically be any value
    const { result } = renderHook(() => useNavigationNodeActions());
    act(() => result.current.setFov(-10));
    expect(useCameraStore.getState().cameraFov).toBe(-10);
  });

  it('handles empty color strings', () => {
    const { result } = renderHook(() => useMatchesNodeActions());
    act(() => result.current.setColor(''));
    expect(useUIStore.getState().matchesColor).toBe('');
  });

  it('multiple rapid state changes', () => {
    const { result, rerender } = renderHook(() => usePointsNode());
    const { result: actions } = renderHook(() => usePointsNodeActions());

    act(() => {
      actions.current.setSize(1);
      actions.current.setSize(2);
      actions.current.setSize(3);
      actions.current.setSize(4);
      actions.current.setSize(5);
    });
    rerender();

    expect(result.current.size).toBe(5);
  });

  it('bigint point ID handling', () => {
    const { result } = renderHook(() => usePointsNodeActions());
    const largeId = BigInt('9007199254740993'); // Larger than Number.MAX_SAFE_INTEGER
    act(() => result.current.setSelectedPointId(largeId));
    expect(usePointCloudStore.getState().selectedPointId).toBe(largeId);
  });

  it('selection toggle with same ID twice', () => {
    const { result } = renderHook(() => useSelectionNodeActions());

    // Toggle on
    act(() => result.current.toggleSelectedImageId(42));
    expect(useCameraStore.getState().selectedImageId).toBe(42);

    // Toggle off
    act(() => result.current.toggleSelectedImageId(42));
    expect(useCameraStore.getState().selectedImageId).toBeNull();

    // Toggle on again
    act(() => result.current.toggleSelectedImageId(42));
    expect(useCameraStore.getState().selectedImageId).toBe(42);
  });

  it('navigation history handles empty pop', () => {
    const { result } = renderHook(() => useNavigationNodeActions());
    act(() => result.current.clearNavigationHistory());

    let poppedValue: any;
    act(() => {
      poppedValue = result.current.popNavigationHistory();
    });
    expect(poppedValue).toBeUndefined();
  });

  it('navigation history handles empty peek', () => {
    const { result } = renderHook(() => useNavigationNodeActions());
    act(() => result.current.clearNavigationHistory());

    let peekedValue: any;
    act(() => {
      peekedValue = result.current.peekNavigationHistory();
    });
    expect(peekedValue).toBeUndefined();
  });
});

describe('Cross-Node Consistency', () => {
  beforeEach(() => {
    usePointCloudStore.setState(usePointCloudStore.getInitialState());
    useCameraStore.setState(useCameraStore.getInitialState());
    useUIStore.setState(useUIStore.getInitialState());
    useRigStore.setState(useRigStore.getInitialState());
  });

  it('all visual nodes have consistent visible/opacity interface', () => {
    const { result: points } = renderHook(() => usePointsNode());
    const { result: matches } = renderHook(() => useMatchesNode());
    const { result: rig } = renderHook(() => useRigNode());

    // All should be VisualNodes
    expect(isVisualNode(points.current)).toBe(true);
    expect(isVisualNode(matches.current)).toBe(true);
    expect(isVisualNode(rig.current)).toBe(true);

    // All should have visible and opacity
    expect(typeof points.current.visible).toBe('boolean');
    expect(typeof points.current.opacity).toBe('number');
    expect(typeof matches.current.visible).toBe('boolean');
    expect(typeof matches.current.opacity).toBe('number');
    expect(typeof rig.current.visible).toBe('boolean');
    expect(typeof rig.current.opacity).toBe('number');
  });

  it('all visible-only nodes have consistent interface', () => {
    const { result: cameras } = renderHook(() => useCamerasNode());
    const { result: selection } = renderHook(() => useSelectionNode());
    const { result: axes } = renderHook(() => useAxesNode());
    const { result: grid } = renderHook(() => useGridNode());
    const { result: gizmo } = renderHook(() => useGizmoNode());

    // All should be VisibleNodes but not VisualNodes
    expect(isVisibleNode(cameras.current)).toBe(true);
    expect(isVisualNode(cameras.current)).toBe(false);
    expect(isVisibleNode(selection.current)).toBe(true);
    expect(isVisualNode(selection.current)).toBe(false);
    expect(isVisibleNode(axes.current)).toBe(true);
    expect(isVisualNode(axes.current)).toBe(false);
    expect(isVisibleNode(grid.current)).toBe(true);
    expect(isVisualNode(grid.current)).toBe(false);
    expect(isVisibleNode(gizmo.current)).toBe(true);
    expect(isVisualNode(gizmo.current)).toBe(false);
  });

  it('navigation node is non-visual', () => {
    const { result: navigation } = renderHook(() => useNavigationNode());
    expect(isVisibleNode(navigation.current)).toBe(false);
    expect(isVisualNode(navigation.current)).toBe(false);
  });

  it('all nodes have unique nodeType', () => {
    const { result: points } = renderHook(() => usePointsNode());
    const { result: cameras } = renderHook(() => useCamerasNode());
    const { result: selection } = renderHook(() => useSelectionNode());
    const { result: navigation } = renderHook(() => useNavigationNode());
    const { result: matches } = renderHook(() => useMatchesNode());
    const { result: rig } = renderHook(() => useRigNode());
    const { result: axes } = renderHook(() => useAxesNode());
    const { result: grid } = renderHook(() => useGridNode());
    const { result: gizmo } = renderHook(() => useGizmoNode());

    const nodeTypes = [
      points.current.nodeType,
      cameras.current.nodeType,
      selection.current.nodeType,
      navigation.current.nodeType,
      matches.current.nodeType,
      rig.current.nodeType,
      axes.current.nodeType,
      grid.current.nodeType,
      gizmo.current.nodeType,
    ];

    // All should be unique
    const uniqueTypes = new Set(nodeTypes);
    expect(uniqueTypes.size).toBe(nodeTypes.length);
  });
});
