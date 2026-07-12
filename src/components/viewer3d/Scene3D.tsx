import { lazy, Suspense, useCallback, useMemo, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { PointCloud } from './PointCloud/PointCloud';
import { CameraFrustums, CameraMatches } from './CameraFrustums';
import { wasFrustumTapRecent } from './frustumTouchGuards';
import { RigConnections } from './RigConnections';
import { ViewerControls } from './ViewerControls';
import { TrackballControls } from './TrackballControls';
import { OriginAxes, OriginGrid } from './OriginVisualization';
import { TransformGizmo } from './TransformGizmo';
import { SelectedPointMarkers } from './SelectedPointMarkers';
import { FloorPlaneWidget } from './FloorPlaneWidget';
import { PickingCursor } from './PickingCursor';
import { ScreenshotCapture } from './ScreenshotCapture';
import { FpsTracker } from './FpsTracker';
import { FooterBranding } from './FooterBranding';
import { SplatPsnrEvaluator } from './SplatPsnrEvaluator';
import { SplatBackendStatusNotifier } from './SplatBackendStatusNotifier';
import {
  shouldClearUnavailableForcedWebGpuSplatLoading,
  shouldMountWebGpuSplatCanvas,
  shouldRenderWebGpuSplatCanvas,
  shouldSyncWebGpuSplatCanvasFrame,
} from './WebGpuSplatCanvasLayerPolicy';
import {
  WebGpuSplatCanvasBridge,
  WebGpuSplatCanvasLayer,
} from './WebGpuSplatCanvasLayer';
import { isWebGpuAdapterUnavailableReason } from '../../splat/webgpu/webGpuSplatDevice';
import { GlobalContextMenu } from './contextMenu/GlobalContextMenu';
import { Scene3DE2EProbe } from './Scene3DE2EProbe';
import { Scene3DErrorBoundary } from './Scene3DErrorBoundary';
import { DistanceInputModal } from '../modals/DistanceInputModal';
import { useAxesNode, useGridNode, useGizmoNode, useCamerasNode } from '../../nodes';

import { useIsAlignmentMode } from '../../hooks/useAlignmentMode';
import { useIdleTimer } from '../../hooks/useIdleTimer';
import { preloadSparkModule } from '../../utils/sparkSplatRuntime';
import { shouldPreloadSparkSplatRuntime } from '../../utils/splatBackendPolicy';
import { isSplatLoadingProgressForFile } from '../../utils/splatLoadingProgressPolicy';
import type { SplatBackendAvailability } from '../../utils/splatBackendPolicy';
import {
  composeSim3d,
  createSim3dFromEuler,
  sim3dToMatrix4,
  isIdentityEuler,
  transformPoint,
} from '../../utils/sim3dTransforms';
import { syncSceneBackgroundColor, syncSceneBackgroundTransparent } from '../../utils/threeObjectMutations';
import { CAMERA, VIZ_COLORS, OPACITY } from '../../theme';
import {
  buildSceneBounds,
  getInitialSceneCameraPosition,
  getSceneLayerVisibility,
  getSceneContainerStyle,
  getSceneTransformGroupMatrix,
  shouldDeselectCanvasPointerMiss,
} from './scene3dViewModel';
import { useSceneContextMenuController } from './useSceneContextMenuController';
import {
  useSceneContainerStoreFacade,
  useSceneContentStoreFacade,
} from './useScene3DStoreFacade';

const loadSplatLayer = () => import('./PointCloud/SplatLayer').then((module) => ({ default: module.SplatLayer }));

const LazySplatLayer = lazy(loadSplatLayer);

function SplatRuntimePreloader({
  requestedBackend,
  splatBackendAvailability,
  setSparkBackendAvailable,
  splatFile,
}: {
  requestedBackend: 'auto' | 'webgpu' | 'spark';
  splatBackendAvailability: SplatBackendAvailability;
  setSparkBackendAvailable: (spark: boolean) => void;
  splatFile?: File;
}) {
  useEffect(() => {
    if (
      !splatFile ||
      !shouldPreloadSparkSplatRuntime(requestedBackend, splatBackendAvailability)
    ) {
      return;
    }

    void loadSplatLayer().catch(() => undefined);
    void preloadSparkModule()
      .then(() => setSparkBackendAvailable(true))
      .catch(() => setSparkBackendAvailable(false));
  }, [requestedBackend, setSparkBackendAvailable, splatBackendAvailability, splatFile]);

  return null;
}

function SceneContent() {
  const {
    data: {
      reconstruction,
      wasmReconstruction,
      splatFile,
      isIdle,
      autoHideElements,
      showAutoHideEditor,
      viewResetTrigger,
      viewDirection,
      viewTrigger,
      transform,
      splatTransform,
      requestedSplatBackend,
      splatBackendAvailability,
      splatBackendResolution,
      splatsVisible,
      urlProgress,
    },
    actions: {
      setSparkBackendAvailable,
    },
  } = useSceneContentStoreFacade();
  // Use shared alignment mode (includes point picking AND floor detection)
  const isAlignmentMode = useIsAlignmentMode();

  const bounds = useMemo(() => {
    return buildSceneBounds(reconstruction, wasmReconstruction);
  }, [reconstruction, wasmReconstruction]);

  const cameras = useCamerasNode();
  const axes = useAxesNode();
  const grid = useGridNode();
  const gizmo = useGizmoNode();
  const webGpuSplatCanvasMounted = shouldMountWebGpuSplatCanvas(
    requestedSplatBackend,
    splatBackendAvailability,
    splatFile
  );
  const sparkSplatLayerNeeded = splatFile
    && shouldPreloadSparkSplatRuntime(requestedSplatBackend, splatBackendAvailability);

  // Compute transforms for visual preview. The active transform wraps COLMAP
  // content, while the splat transform is persisted after Apply because raw
  // splat geometry cannot be baked into the source file.
  const {
    transformMatrix,
    splatTransformMatrix,
    webGpuSplatModelMatrix,
    transformedCenter,
  } = useMemo(() => {
    const sim3d = isIdentityEuler(transform) ? null : createSim3dFromEuler(transform);
    const splatSim3d = isIdentityEuler(splatTransform) ? null : createSim3dFromEuler(splatTransform);
    const matrix = sim3d ? sim3dToMatrix4(sim3d) : null;
    const splatMatrix = splatSim3d ? sim3dToMatrix4(splatSim3d) : null;
    const webGpuMatrix = sim3d && splatSim3d
      ? sim3dToMatrix4(composeSim3d(sim3d, splatSim3d))
      : matrix ?? splatMatrix;
    const newCenter = sim3d ? transformPoint(sim3d, bounds.center) : bounds.center;
    return {
      transformMatrix: matrix,
      splatTransformMatrix: splatMatrix,
      webGpuSplatModelMatrix: webGpuMatrix,
      transformedCenter: newCenter as [number, number, number],
    };
  }, [transform, splatTransform, bounds.center]);

  const transformGroupMatrix = useMemo(
    () => getSceneTransformGroupMatrix(transformMatrix),
    [transformMatrix]
  );

  const visibleLayers = useMemo(() => getSceneLayerVisibility({
    isAlignmentMode,
    hasReconstruction: reconstruction !== null,
    camerasVisible: cameras.visible,
    axesVisible: axes.visible,
    gridVisible: grid.visible,
    gizmoVisible: gizmo.visible,
    isIdle,
    showAutoHideEditor,
    autoHideElements,
  }), [
    isAlignmentMode,
    reconstruction,
    cameras.visible,
    axes.visible,
    grid.visible,
    gizmo.visible,
    isIdle,
    showAutoHideEditor,
    autoHideElements,
  ]);

  const webGpuSplatBackendVisible = shouldRenderWebGpuSplatCanvas(
    splatBackendResolution,
    splatFile,
    splatsVisible
  );
  const webGpuSplatCanvasVisible = webGpuSplatBackendVisible && visibleLayers.points;
  const webGpuSplatCanvasLoading = isSplatLoadingProgressForFile(urlProgress, splatFile);
  const webGpuSplatCanvasBridgeEnabled = shouldSyncWebGpuSplatCanvasFrame(
    webGpuSplatCanvasMounted,
    webGpuSplatCanvasVisible,
    splatBackendResolution,
    webGpuSplatCanvasLoading
  );

  const transformableContent = (
    <>
      {visibleLayers.points && <PointCloud />}
      {sparkSplatLayerNeeded && (
        <Suspense fallback={null}>
          <LazySplatLayer modelMatrix={splatTransformMatrix} visible={visibleLayers.points} />
        </Suspense>
      )}
      {visibleLayers.cameras && <CameraFrustums />}
      {visibleLayers.matches && <CameraMatches />}
      {visibleLayers.rigs && <RigConnections />}
    </>
  );
  const e2eProbeEnabled = import.meta.env.DEV
    && new URLSearchParams(window.location.search).get('e2eProbe') === '1';

  return (
    <>
      <ambientLight intensity={OPACITY.light.ambient} />
      <directionalLight position={[10, 10, 5]} intensity={OPACITY.light.directional} />

      {/* Transformable content - ALWAYS wrapped in the group (identity matrix
          when no transform). Conditionally adding the group on the first
          non-identity transform re-parented — and therefore remounted — the
          whole point/frustum/splat subtree mid-session: a GPU re-upload spike
          concurrent with e.g. an in-flight PSNR run. */}
      {/* Hide frustums during alignment modes (point picking or floor detection) for cleaner visualization */}
      {/* Point content handles point/splat visibility internally; selection overlay
          stays visible when a camera is selected. */}
      <SplatRuntimePreloader
        requestedBackend={requestedSplatBackend}
        splatBackendAvailability={splatBackendAvailability}
        setSparkBackendAvailable={setSparkBackendAvailable}
        splatFile={splatFile}
      />
      <WebGpuSplatCanvasBridge enabled={webGpuSplatCanvasBridgeEnabled} modelMatrix={webGpuSplatModelMatrix} />
      <group matrixAutoUpdate={false} matrix={transformGroupMatrix}>
        {transformableContent}
      </group>

      {/* Axes/Grid stay in original coordinate system */}
      {/* Show axes automatically when in alignment mode for orientation reference */}
      <Suspense fallback={null}>
        {visibleLayers.axes && <OriginAxes size={bounds.radius * axes.scale} scale={axes.scale} coordinateSystem={axes.coordinateSystem} labelMode={axes.labelMode} />}
        {visibleLayers.grid && <OriginGrid size={bounds.radius} scale={grid.scale} />}
      </Suspense>

      {/* Transform gizmo follows the transformed data - hidden during alignment mode */}
      {visibleLayers.gizmo && <TransformGizmo center={transformedCenter} size={bounds.radius * transform.scale * axes.scale} />}

      {/* Point picking markers - rendered outside transform group for stable display */}
      <SelectedPointMarkers />

      {/* Floor plane widget - rendered outside transform group for stable display */}
      <FloorPlaneWidget boundsRadius={bounds.radius} />

      {e2eProbeEnabled && <Scene3DE2EProbe />}
      <SplatPsnrEvaluator />

      <TrackballControls target={bounds.center} radius={bounds.radius} resetTrigger={viewResetTrigger} viewDirection={viewDirection} viewTrigger={viewTrigger} />
    </>
  );
}

function LoadingFallback() {
  return (
    <mesh>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color={VIZ_COLORS.wireframe} wireframe />
    </mesh>
  );
}

function BackgroundColor({ color, transparent }: { color: string; transparent: boolean }) {
  const { gl, scene, invalidate } = useThree();

  useEffect(() => {
    if (transparent) {
      syncSceneBackgroundTransparent(scene);
      gl.setClearAlpha(0);
      invalidate();
      return;
    }

    gl.setClearAlpha(1);
    if (syncSceneBackgroundColor(scene, color)) {
      // Force frame invalidation to ensure render happens after background change
      invalidate();
    }
  }, [gl, scene, color, transparent, invalidate]);

  return null;
}

export function Scene3D() {
  const {
    data: {
      reconstruction,
      wasmReconstruction,
      backgroundColor,
      showAutoHideEditor,
      splatFile,
      requestedSplatBackend,
      splatBackendAvailability,
      splatBackendResolution,
      splatsVisible,
      pointsLayerVisible,
    },
    actions: {
      addNotification,
      removeNotification,
      setSelectedImageId,
      setWebGpuBackendState,
      setWebGpuMetricState,
      getUrlProgress,
      setUrlLoading,
      setUrlProgress,
    },
  } = useSceneContainerStoreFacade();
  const sceneContextMenu = useSceneContextMenuController();

  const idleRef = useIdleTimer();

  const cameraPosition = useMemo(() => {
    return getInitialSceneCameraPosition(reconstruction, wasmReconstruction);
  }, [reconstruction, wasmReconstruction]);
  const webGpuSplatCanvasMounted = shouldMountWebGpuSplatCanvas(
    requestedSplatBackend,
    splatBackendAvailability,
    splatFile
  );
  const webGpuSplatCanvasVisible = shouldRenderWebGpuSplatCanvas(
    splatBackendResolution,
    splatFile,
    splatsVisible
  ) && pointsLayerVisible;
  const webGpuSplatBackendSelected = splatBackendResolution.status === 'resolved'
    && splatBackendResolution.backend === 'webgpu';
  const webGpuSplatCanvasReportsLoading = requestedSplatBackend === 'webgpu'
    || webGpuSplatBackendSelected
    || (
      requestedSplatBackend === 'auto'
      && !splatBackendAvailability.spark
    );
  const handleWebGpuSplatRuntimeReady = useCallback(() => {
    setWebGpuBackendState('ready');
  }, [setWebGpuBackendState]);
  const handleWebGpuSplatMetricRuntimeReady = useCallback(() => {
    setWebGpuMetricState('ready');
  }, [setWebGpuMetricState]);
  const handleWebGpuSplatRuntimeFailed = useCallback((reason: string) => {
    if (isWebGpuAdapterRecoveryExhaustedReason(reason)) {
      setWebGpuBackendState('failed', reason);
      return;
    }

    if (isWebGpuAdapterUnavailableReason(reason)) {
      setWebGpuBackendState('unavailable', reason);
      return;
    }

    setWebGpuBackendState('failed', reason);
  }, [setWebGpuBackendState]);
  const handleWebGpuSplatAdapterUnavailable = useCallback((reason: string) => {
    setWebGpuBackendState('unavailable', reason);
    setWebGpuMetricState('failed', reason);
  }, [setWebGpuBackendState, setWebGpuMetricState]);

  useEffect(() => {
    if (shouldClearUnavailableForcedWebGpuSplatLoading(
      requestedSplatBackend,
      splatBackendResolution,
      splatFile,
      webGpuSplatCanvasMounted,
      getUrlProgress()
    )) {
      setUrlProgress(null);
      setUrlLoading(false);
    }
  }, [
    getUrlProgress,
    requestedSplatBackend,
    setUrlLoading,
    setUrlProgress,
    splatBackendResolution,
    splatFile,
    webGpuSplatCanvasMounted,
  ]);

  return (
    <div
      ref={idleRef}
      className="w-full h-full relative isolate scene-3d-container"
      data-testid="scene-3d"
      data-autohide-preview={showAutoHideEditor ? 'true' : undefined}
      style={getSceneContainerStyle(backgroundColor)}
      onContextMenu={sceneContextMenu.handleContextMenu}
      onPointerDown={sceneContextMenu.touchMode ? sceneContextMenu.handleTouchPointerDown : undefined}
      onPointerMove={sceneContextMenu.touchMode ? sceneContextMenu.handleTouchPointerMove : undefined}
      onPointerUp={sceneContextMenu.touchMode ? sceneContextMenu.handleTouchPointerUp : undefined}
      onPointerCancel={sceneContextMenu.touchMode ? sceneContextMenu.handleTouchPointerCancel : undefined}
      onMouseDown={sceneContextMenu.touchMode ? undefined : sceneContextMenu.handleMouseDown}
      onMouseUp={sceneContextMenu.touchMode ? undefined : sceneContextMenu.handleMouseUp}
    >
      <WebGpuSplatCanvasLayer
        mounted={webGpuSplatCanvasMounted}
        visible={webGpuSplatCanvasVisible}
        splatFile={splatFile}
        addNotification={addNotification}
        removeNotification={removeNotification}
        getUrlProgress={getUrlProgress}
        setUrlLoading={setUrlLoading}
        setUrlProgress={setUrlProgress}
        reportLoadingProgress={webGpuSplatCanvasReportsLoading}
        onRuntimeReady={handleWebGpuSplatRuntimeReady}
        onMetricRuntimeReady={handleWebGpuSplatMetricRuntimeReady}
        onRuntimeFailed={handleWebGpuSplatRuntimeFailed}
        onAdapterUnavailable={handleWebGpuSplatAdapterUnavailable}
      />
      <SplatBackendStatusNotifier
        addNotification={addNotification}
        requestedBackend={requestedSplatBackend}
        splatBackendResolution={splatBackendResolution}
        splatFile={splatFile}
        webGpuSplatCanvasMounted={webGpuSplatCanvasMounted}
      />
      <Scene3DErrorBoundary backgroundColor={backgroundColor}>
        <Canvas
          className="relative z-10"
          camera={{
            position: cameraPosition,
            fov: CAMERA.fov,
            near: CAMERA.nearPlane,
            far: CAMERA.farPlane,
          }}
          gl={{ antialias: false, alpha: true }}
          onPointerMissed={(e) => {
            // On mobile, skip if a frustum tap was just handled in onPointerUp
            // (R3F's click raycast may miss the mesh, triggering this falsely)
            const frustumTapRecent = e.button === 0 || e.button === 2
              ? wasFrustumTapRecent()
              : false;
            if (shouldDeselectCanvasPointerMiss(e.button, frustumTapRecent)) {
              setSelectedImageId(null);
            }
          }}
        >
          <BackgroundColor color={backgroundColor} transparent={webGpuSplatCanvasVisible} />
          <FpsTracker />
          <ScreenshotCapture />
          <Suspense fallback={<LoadingFallback />}>
            <SceneContent />
          </Suspense>
        </Canvas>
      </Scene3DErrorBoundary>
      <ViewerControls />
      <FooterBranding />
      <PickingCursor />
      <GlobalContextMenu />
      <DistanceInputModal />
    </div>
  );
}

function isWebGpuAdapterRecoveryExhaustedReason(reason: string): boolean {
  return /adapter recovery did not succeed/i.test(reason);
}
