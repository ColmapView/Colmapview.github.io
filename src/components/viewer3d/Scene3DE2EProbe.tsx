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
import { getFrustumTextureCacheStats } from '../../hooks/useFrustumTexture';
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

interface FrustumPlaneTextureSample {
  ok: boolean;
  width: number | null;
  height: number | null;
  averageR: number | null;
  averageG: number | null;
  averageB: number | null;
  averageA: number | null;
  error: string | null;
}

interface FrustumPlaneTextureDebug {
  objectUuid: string;
  imageId: number | null;
  imageName: string | null;
  isSelectedPlane: boolean;
  viewAngleOk: boolean | null;
  shouldShowTexture: boolean | null;
  textureHiddenByViewAngle: boolean | null;
  hasDisplayTexture: boolean | null;
  displayTextureUuid: string | null;
  objectVisible: boolean;
  materialType: string | null;
  materialVisible: boolean | null;
  materialColor: string | null;
  materialOpacity: number | null;
  materialTransparent: boolean | null;
  materialDepthTest: boolean | null;
  materialDepthWrite: boolean | null;
  hasTexture: boolean;
  textureUuid: string | null;
  textureVersion: number | null;
  textureNeedsUpdate: boolean | null;
  textureColorSpace: string | null;
  textureFlipY: boolean | null;
  textureImageType: string | null;
  textureImageWidth: number | null;
  textureImageHeight: number | null;
  textureSourceWidth: number | null;
  textureSourceHeight: number | null;
  textureSample: FrustumPlaneTextureSample | null;
}

interface FrustumPlaneDebugSummary {
  cacheStats: ReturnType<typeof getFrustumTextureCacheStats>;
  planes: FrustumPlaneTextureDebug[];
}

interface ColmapWebViewE2EApi {
  clearSelectedImage: () => void;
  getFrustumPlaneDebug: () => FrustumPlaneDebugSummary;
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
      ssim?: number;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getRecordNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function getRecordString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' ? value : null;
}

function getObjectTag(value: unknown): string | null {
  if (!value) return null;
  const constructorName = isRecord(value) && typeof value.constructor === 'function'
    ? value.constructor.name
    : '';
  return constructorName || Object.prototype.toString.call(value);
}

function getMaterial(object: THREE.Object3D): THREE.Material | null {
  if (!(object instanceof THREE.Mesh)) return null;
  const material = object.material;
  return Array.isArray(material) ? (material[0] ?? null) : material;
}

function getTextureFromMaterial(material: THREE.Material | null): THREE.Texture | null {
  if (!material) return null;
  if (material instanceof THREE.MeshBasicMaterial) {
    return material.map;
  }
  if (material instanceof THREE.ShaderMaterial) {
    const mapUniform = material.uniforms.map;
    return mapUniform?.value instanceof THREE.Texture ? mapUniform.value : null;
  }
  const maybeMaterial = material as THREE.Material & { map?: unknown };
  return maybeMaterial.map instanceof THREE.Texture ? maybeMaterial.map : null;
}

function getTextureImage(texture: THREE.Texture | null): unknown {
  return texture?.image ?? null;
}

function getTextureSourceData(texture: THREE.Texture | null): unknown {
  return texture?.source?.data ?? null;
}

function getImageDimension(image: unknown, key: 'width' | 'height'): number | null {
  if (!isRecord(image)) return null;
  return getRecordNumber(image, key);
}

function sampleTextureImage(image: unknown): FrustumPlaneTextureSample | null {
  if (!image) return null;
  const width = getImageDimension(image, 'width');
  const height = getImageDimension(image, 'height');
  if (!width || !height) {
    return {
      ok: false,
      width,
      height,
      averageR: null,
      averageG: null,
      averageB: null,
      averageA: null,
      error: 'missing image dimensions',
    };
  }

  try {
    const canvas = document.createElement('canvas');
    const sampleWidth = Math.min(8, Math.max(1, width));
    const sampleHeight = Math.min(8, Math.max(1, height));
    canvas.width = sampleWidth;
    canvas.height = sampleHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      return {
        ok: false,
        width,
        height,
        averageR: null,
        averageG: null,
        averageB: null,
        averageA: null,
        error: '2d canvas unavailable',
      };
    }

    context.drawImage(image as CanvasImageSource, 0, 0, sampleWidth, sampleHeight);
    const data = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    const pixelCount = sampleWidth * sampleHeight;
    for (let index = 0; index < data.length; index += 4) {
      r += data[index];
      g += data[index + 1];
      b += data[index + 2];
      a += data[index + 3];
    }

    return {
      ok: true,
      width,
      height,
      averageR: r / pixelCount,
      averageG: g / pixelCount,
      averageB: b / pixelCount,
      averageA: a / pixelCount,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      width,
      height,
      averageR: null,
      averageG: null,
      averageB: null,
      averageA: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function getMaterialColor(material: THREE.Material | null): string | null {
  if (!material) return null;
  const maybeMaterial = material as THREE.Material & { color?: unknown };
  return maybeMaterial.color instanceof THREE.Color
    ? `#${maybeMaterial.color.getHexString()}`
    : null;
}

function getFrustumPlaneTextureDebug(object: THREE.Object3D): FrustumPlaneTextureDebug | null {
  if (object.userData.isFrustumPlane !== true) return null;

  const material = getMaterial(object);
  const texture = getTextureFromMaterial(material);
  const image = getTextureImage(texture);
  const sourceData = getTextureSourceData(texture);
  const userData = object.userData;

  return {
    objectUuid: object.uuid,
    imageId: getRecordNumber(userData, 'imageId'),
    imageName: getRecordString(userData, 'imageName'),
    isSelectedPlane: userData.isSelectedPlane === true,
    viewAngleOk: typeof userData.viewAngleOk === 'boolean' ? userData.viewAngleOk : null,
    shouldShowTexture: typeof userData.shouldShowTexture === 'boolean' ? userData.shouldShowTexture : null,
    textureHiddenByViewAngle: typeof userData.textureHiddenByViewAngle === 'boolean'
      ? userData.textureHiddenByViewAngle
      : null,
    hasDisplayTexture: typeof userData.hasDisplayTexture === 'boolean' ? userData.hasDisplayTexture : null,
    displayTextureUuid: getRecordString(userData, 'displayTextureUuid'),
    objectVisible: object.visible,
    materialType: material?.type ?? null,
    materialVisible: material?.visible ?? null,
    materialColor: getMaterialColor(material),
    materialOpacity: material?.opacity ?? null,
    materialTransparent: material?.transparent ?? null,
    materialDepthTest: material?.depthTest ?? null,
    materialDepthWrite: material?.depthWrite ?? null,
    hasTexture: texture !== null,
    textureUuid: texture?.uuid ?? null,
    textureVersion: texture?.version ?? null,
    textureNeedsUpdate: texture?.needsUpdate ?? null,
    textureColorSpace: texture?.colorSpace ?? null,
    textureFlipY: texture?.flipY ?? null,
    textureImageType: getObjectTag(image),
    textureImageWidth: getImageDimension(image, 'width'),
    textureImageHeight: getImageDimension(image, 'height'),
    textureSourceWidth: getImageDimension(sourceData, 'width'),
    textureSourceHeight: getImageDimension(sourceData, 'height'),
    textureSample: sampleTextureImage(image),
  };
}

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
  const { camera, gl, scene } = useThree();
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

  const getFrustumPlaneDebug = useCallback((): FrustumPlaneDebugSummary => {
    const planes: FrustumPlaneTextureDebug[] = [];
    scene.traverse((object) => {
      const entry = getFrustumPlaneTextureDebug(object);
      if (entry) {
        planes.push(entry);
      }
    });

    return {
      cacheStats: getFrustumTextureCacheStats(),
      planes,
    };
  }, [scene]);

  const api = useMemo<ColmapWebViewE2EApi>(() => ({
    clearSelectedImage,
    getFrustumPlaneDebug,
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
    getFrustumPlaneDebug,
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
