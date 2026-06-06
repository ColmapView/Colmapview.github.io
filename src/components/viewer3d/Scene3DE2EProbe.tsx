import { useCallback, useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useDataset } from '../../dataset';
import { useUrlLoader } from '../../hooks/useUrlLoader';
import type { CameraDisplayMode } from '../../store/types';
import type { ColmapManifest } from '../../types/manifest';
import { resetSession } from '../../store/actions';
import { createSim3dFromEuler, isIdentityEuler, sim3dToMatrix4 } from '../../utils/sim3dTransforms';
import { useIsAlignmentMode } from '../../hooks/useAlignmentMode';
import type {
  SplatBackendAvailability,
  SplatBackendPreference,
  SplatBackendResolution,
  SplatMetricCapability,
} from '../../utils/splatBackendPolicy';
import {
  getWebGpuSplatDebugCounters,
  type WebGpuSplatDebugCounters,
} from '../../splat/webgpu/webGpuSplatDebugCounters';
import {
  buildCameraFrustumItems,
  buildCameraIdToIndex,
  getCameraScaleValue,
  getFrustumPlaneSize,
  type CameraFrustumItem,
} from './cameraFrustumViewModel';
import { getSceneLayerVisibility } from './scene3dViewModel';
import { useScene3DE2EProbeStoreFacade } from './useScene3DE2EProbeStoreFacade';

type SceneObjectTargetName =
  | 'camera-frustum-plane'
  | 'camera-arrow-cone';

interface SceneObjectTarget {
  name: SceneObjectTargetName;
  imageId: number;
  displayMode: CameraDisplayMode;
  selectedImageId: number | null;
  x: number;
  y: number;
}

interface ColmapWebViewE2EApi {
  clearSelectedImage: () => void;
  getImageIds: () => number[];
  getSceneObjectTarget: (name: SceneObjectTargetName) => SceneObjectTarget | null;
  getSelectedImageId: () => number | null;
  getSplatBackendState: () => {
    requestedBackend: SplatBackendPreference;
    availability: SplatBackendAvailability;
    resolution: SplatBackendResolution;
    metricCapability: SplatMetricCapability;
  };
  getSplatPsnrState: (imageId?: number | null) => {
    frameReady: boolean;
    computing: boolean;
    readyCount: number;
    status: string | null;
    error: string | null;
    metric: {
      psnr: number;
      mse: number;
      validPixelCount: number;
      width: number;
      height: number;
      computedAt: number;
    } | null;
  };
  getWebGpuSplatDebugCounters: () => Promise<WebGpuSplatDebugCounters>;
  loadManifest: (manifest: ColmapManifest) => Promise<boolean>;
  requestSplatPsnrCompute: (scope: 'selected' | 'all', selectedImageId?: number | null) => void;
  resetSession: () => void;
  setCameraDisplayMode: (mode: CameraDisplayMode) => void;
  setCameraScale: (scale: number) => void;
  setSelectedImageId: (imageId: number | null) => void;
  waitForRenderFrames: (count?: number) => Promise<void>;
}

declare global {
  interface Window {
    __COLMAP_WEBVIEW_E2E__?: ColmapWebViewE2EApi;
  }
}

const vector = new THREE.Vector3();
const cameraWorldPosition = new THREE.Vector3();
const cameraWorldDirection = new THREE.Vector3();

function projectWorldPoint(
  worldPoint: THREE.Vector3,
  camera: THREE.Camera,
  canvas: HTMLCanvasElement
): { x: number; y: number } | null {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;

  camera.updateMatrixWorld();
  if (camera instanceof THREE.PerspectiveCamera || camera instanceof THREE.OrthographicCamera) {
    camera.updateProjectionMatrix();
  }

  vector.copy(worldPoint).project(camera);
  if (
    !Number.isFinite(vector.x) ||
    !Number.isFinite(vector.y) ||
    !Number.isFinite(vector.z)
  ) {
    return null;
  }

  camera.getWorldPosition(cameraWorldPosition);
  camera.getWorldDirection(cameraWorldDirection);
  if (worldPoint.clone().sub(cameraWorldPosition).dot(cameraWorldDirection) <= 0) {
    return null;
  }

  const x = rect.left + ((vector.x + 1) / 2) * rect.width;
  const y = rect.top + ((1 - vector.y) / 2) * rect.height;

  if (
    x < rect.left ||
    x > rect.right ||
    y < rect.top ||
    y > rect.bottom
  ) {
    return null;
  }

  return { x, y };
}

function getFirstInteractiveFrustum(
  frustums: CameraFrustumItem[],
  selectedImageId: number | null
): CameraFrustumItem | null {
  return frustums.find((frustum) => frustum.image.imageId !== selectedImageId) ?? frustums[0] ?? null;
}

function getFrustumTargetWorldPoint(
  targetName: SceneObjectTargetName,
  frustum: CameraFrustumItem,
  cameraScale: number
): THREE.Vector3 {
  if (targetName === 'camera-arrow-cone') {
    const shaftLength = cameraScale * 0.8;
    const coneLength = cameraScale * 0.2;
    return new THREE.Vector3(0, 0, shaftLength + coneLength / 2)
      .applyQuaternion(frustum.quaternion)
      .add(frustum.position);
  }

  const planeSize = getFrustumPlaneSize(frustum.camera, cameraScale);
  return new THREE.Vector3(planeSize.offsetX, planeSize.offsetY, planeSize.depth)
    .applyQuaternion(frustum.quaternion)
    .add(frustum.position);
}

export function Scene3DE2EProbe() {
  const { camera, gl } = useThree();
  const dataset = useDataset();
  const { loadFromManifest } = useUrlLoader();
  const {
    data: {
      reconstruction,
      pendingDeletions,
      showCameras,
      cameraDisplayMode,
      cameraScale: cameraScaleBase,
      cameraScaleFactor,
      selectedImageId,
      transform,
      isIdle,
      showAutoHideEditor,
      autoHideElements,
    },
    actions: {
      clearSelectedImage,
      getImageIds,
      getSplatBackendState,
      getSplatPsnrState,
      getSelectedImageId,
      requestSplatPsnrCompute,
      setCameraDisplayMode,
      setCameraScale,
      setSelectedImageId,
    },
  } = useScene3DE2EProbeStoreFacade();
  const isAlignmentMode = useIsAlignmentMode();

  const cameraScale = getCameraScaleValue(cameraScaleBase, cameraScaleFactor);
  const transformMatrix = useMemo(() => {
    return isIdentityEuler(transform) ? null : sim3dToMatrix4(createSim3dFromEuler(transform));
  }, [transform]);
  const camerasVisible = getSceneLayerVisibility({
    isAlignmentMode,
    hasReconstruction: reconstruction !== null,
    camerasVisible: showCameras,
    axesVisible: false,
    gridVisible: false,
    gizmoVisible: false,
    isIdle,
    showAutoHideEditor,
    autoHideElements,
  }).cameras;
  const frustums = useMemo(() => {
    return buildCameraFrustumItems({
      reconstruction,
      imageSource: dataset,
      cameraIdToIndex: buildCameraIdToIndex(reconstruction),
      pendingDeletions,
    });
  }, [dataset, pendingDeletions, reconstruction]);

  const getSceneObjectTarget = useCallback((name: SceneObjectTargetName): SceneObjectTarget | null => {
    if (!camerasVisible) return null;
    if (name === 'camera-arrow-cone' && cameraDisplayMode !== 'arrow') return null;
    if (
      name === 'camera-frustum-plane' &&
      cameraDisplayMode !== 'frustum' &&
      cameraDisplayMode !== 'imageplane'
    ) {
      return null;
    }

    const frustum = getFirstInteractiveFrustum(frustums, selectedImageId);
    if (!frustum) return null;

    const worldPoint = getFrustumTargetWorldPoint(name, frustum, cameraScale);
    if (transformMatrix) {
      worldPoint.applyMatrix4(transformMatrix);
    }
    const projected = projectWorldPoint(worldPoint, camera, gl.domElement);
    if (!projected) return null;

    return {
      name,
      imageId: frustum.image.imageId,
      displayMode: cameraDisplayMode,
      selectedImageId,
      ...projected,
    };
  }, [camera, cameraDisplayMode, cameraScale, camerasVisible, frustums, gl.domElement, selectedImageId, transformMatrix]);

  const api = useMemo<ColmapWebViewE2EApi>(() => ({
    clearSelectedImage,
    getImageIds,
    getSplatBackendState,
    getSceneObjectTarget,
    getSelectedImageId,
    getSplatPsnrState,
    getWebGpuSplatDebugCounters: async () => getWebGpuSplatDebugCounters(),
    loadManifest: loadFromManifest,
    requestSplatPsnrCompute,
    resetSession,
    setCameraDisplayMode,
    setCameraScale,
    setSelectedImageId,
    waitForRenderFrames: (count = 2) => new Promise((resolve) => {
      let remaining = Math.max(1, count);
      const tick = () => {
        remaining -= 1;
        if (remaining <= 0) {
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }),
  }), [
    clearSelectedImage,
    getImageIds,
    getSceneObjectTarget,
    getSelectedImageId,
    getSplatBackendState,
    getSplatPsnrState,
    loadFromManifest,
    requestSplatPsnrCompute,
    setCameraDisplayMode,
    setCameraScale,
    setSelectedImageId,
  ]);

  useEffect(() => {
    window.__COLMAP_WEBVIEW_E2E__ = api;

    return () => {
      if (window.__COLMAP_WEBVIEW_E2E__ === api) {
        delete window.__COLMAP_WEBVIEW_E2E__;
      }
    };
  }, [api]);

  return null;
}
