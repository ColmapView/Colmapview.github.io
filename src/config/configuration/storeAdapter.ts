import { usePointCloudStore } from '../../store/stores/pointCloudStore';
import { useCameraStore } from '../../store/stores/cameraStore';
import { useUIStore } from '../../store/stores/uiStore';
import { useExportStore } from '../../store/stores/exportStore';
import type { AppConfiguration, PartialAppConfiguration } from './types';
import { CONFIG_VERSION } from './types';

export function extractConfigurationFromStores(): AppConfiguration {
  const pointCloud = usePointCloudStore.getState();
  const camera = useCameraStore.getState();
  const ui = useUIStore.getState();
  const exportState = useExportStore.getState();

  return {
    version: CONFIG_VERSION,
    pointCloud: {
      pointSize: pointCloud.pointSize,
      colorMode: pointCloud.colorMode,
      minTrackLength: pointCloud.minTrackLength,
      maxReprojectionError: pointCloud.maxReprojectionError === Infinity ? null : pointCloud.maxReprojectionError,
    },
    camera: {
      displayMode: camera.cameraDisplayMode,
      scale: camera.cameraScale,
      frustumColorMode: camera.frustumColorMode,
      unselectedOpacity: camera.unselectedCameraOpacity,
      mode: camera.cameraMode,
      projection: camera.cameraProjection,
      fov: camera.cameraFov,
      horizonLock: camera.horizonLock,
      flySpeed: camera.flySpeed,
      pointerLock: camera.pointerLock,
      selectionColorMode: camera.selectionColorMode,
      selectionAnimationSpeed: camera.selectionAnimationSpeed,
      imagePlaneOpacity: camera.imagePlaneOpacity,
    },
    ui: {
      showPoints2D: ui.showPoints2D,
      showPoints3D: ui.showPoints3D,
      backgroundColor: ui.backgroundColor,
      autoRotate: ui.autoRotate,
      matchesDisplayMode: ui.matchesDisplayMode,
      matchesOpacity: ui.matchesOpacity,
      maskOverlay: ui.showMaskOverlay,
      maskOpacity: ui.maskOpacity,
      axesDisplayMode: ui.axesDisplayMode,
      axesCoordinateSystem: ui.axesCoordinateSystem,
      axesScale: ui.axesScale,
      imageLoadMode: ui.imageLoadMode,
      gizmoMode: ui.gizmoMode,
    },
    export: {
      screenshotSize: exportState.screenshotSize,
      screenshotFormat: exportState.screenshotFormat,
      screenshotHideLogo: exportState.screenshotHideLogo,
      modelFormat: exportState.exportFormat,
    },
  };
}

export function applyConfigurationToStores(config: PartialAppConfiguration): void {
  // Point cloud store
  if (config.pointCloud) {
    const pc = config.pointCloud;
    const store = usePointCloudStore.getState();

    if (pc.pointSize !== undefined) store.setPointSize(pc.pointSize);
    if (pc.colorMode !== undefined) store.setColorMode(pc.colorMode);
    if (pc.minTrackLength !== undefined) store.setMinTrackLength(pc.minTrackLength);
    if (pc.maxReprojectionError !== undefined) {
      store.setMaxReprojectionError(pc.maxReprojectionError ?? Infinity);
    }
  }

  // Camera store
  if (config.camera) {
    const cam = config.camera;
    const store = useCameraStore.getState();

    if (cam.displayMode !== undefined) store.setCameraDisplayMode(cam.displayMode);
    if (cam.scale !== undefined) store.setCameraScale(cam.scale);
    if (cam.frustumColorMode !== undefined) store.setFrustumColorMode(cam.frustumColorMode);
    if (cam.unselectedOpacity !== undefined) store.setUnselectedCameraOpacity(cam.unselectedOpacity);
    if (cam.mode !== undefined) store.setCameraMode(cam.mode);
    if (cam.projection !== undefined) store.setCameraProjection(cam.projection);
    if (cam.fov !== undefined) store.setCameraFov(cam.fov);
    if (cam.horizonLock !== undefined) store.setHorizonLock(cam.horizonLock);
    if (cam.flySpeed !== undefined) store.setFlySpeed(cam.flySpeed);
    if (cam.pointerLock !== undefined) store.setPointerLock(cam.pointerLock);
    if (cam.selectionColorMode !== undefined) store.setSelectionColorMode(cam.selectionColorMode);
    if (cam.selectionAnimationSpeed !== undefined) store.setSelectionAnimationSpeed(cam.selectionAnimationSpeed);
    if (cam.imagePlaneOpacity !== undefined) store.setImagePlaneOpacity(cam.imagePlaneOpacity);
  }

  // UI store
  if (config.ui) {
    const ui = config.ui;
    const store = useUIStore.getState();

    if (ui.showPoints2D !== undefined) store.setShowPoints2D(ui.showPoints2D);
    if (ui.showPoints3D !== undefined) store.setShowPoints3D(ui.showPoints3D);
    if (ui.backgroundColor !== undefined) store.setBackgroundColor(ui.backgroundColor);
    if (ui.autoRotate !== undefined) store.setAutoRotate(ui.autoRotate);
    if (ui.matchesDisplayMode !== undefined) store.setMatchesDisplayMode(ui.matchesDisplayMode);
    if (ui.matchesOpacity !== undefined) store.setMatchesOpacity(ui.matchesOpacity);
    if (ui.maskOverlay !== undefined) store.setShowMaskOverlay(ui.maskOverlay);
    if (ui.maskOpacity !== undefined) store.setMaskOpacity(ui.maskOpacity);
    if (ui.axesDisplayMode !== undefined) store.setAxesDisplayMode(ui.axesDisplayMode);
    if (ui.axesCoordinateSystem !== undefined) store.setAxesCoordinateSystem(ui.axesCoordinateSystem);
    if (ui.axesScale !== undefined) store.setAxesScale(ui.axesScale);
    if (ui.imageLoadMode !== undefined) store.setImageLoadMode(ui.imageLoadMode);
    if (ui.gizmoMode !== undefined) store.setGizmoMode(ui.gizmoMode);
  }

  // Export store
  if (config.export) {
    const exp = config.export;
    const store = useExportStore.getState();

    if (exp.screenshotSize !== undefined) store.setScreenshotSize(exp.screenshotSize);
    if (exp.screenshotFormat !== undefined) store.setScreenshotFormat(exp.screenshotFormat);
    if (exp.screenshotHideLogo !== undefined) store.setScreenshotHideLogo(exp.screenshotHideLogo);
    if (exp.modelFormat !== undefined) store.setExportFormat(exp.modelFormat);
  }
}

export function resetToDefaults(): void {
  const pointCloudStore = usePointCloudStore.getState();
  pointCloudStore.setPointSize(2);
  pointCloudStore.setColorMode('rgb');
  pointCloudStore.setMinTrackLength(2);
  pointCloudStore.setMaxReprojectionError(Infinity);

  const cameraStore = useCameraStore.getState();
  cameraStore.setCameraDisplayMode('frustum');
  cameraStore.setCameraScale(0.25);
  cameraStore.setFrustumColorMode('byCamera');
  cameraStore.setUnselectedCameraOpacity(0.5);
  cameraStore.setCameraMode('orbit');
  cameraStore.setCameraProjection('perspective');
  cameraStore.setCameraFov(60);
  cameraStore.setHorizonLock(false);
  cameraStore.setFlySpeed(2.5);
  cameraStore.setPointerLock(true);
  cameraStore.setSelectionColorMode('rainbow');
  cameraStore.setSelectionAnimationSpeed(2);
  cameraStore.setImagePlaneOpacity(0.9);

  const uiStore = useUIStore.getState();
  uiStore.setShowPoints2D(false);
  uiStore.setShowPoints3D(false);
  uiStore.setBackgroundColor('#ffffff');
  uiStore.setAutoRotate(false);
  uiStore.setMatchesDisplayMode('off');
  uiStore.setMatchesOpacity(0.75);
  uiStore.setShowMaskOverlay(false);
  uiStore.setMaskOpacity(0.7);
  uiStore.setAxesDisplayMode('both');
  uiStore.setAxesCoordinateSystem('colmap');
  uiStore.setAxesScale(1);
  uiStore.setImageLoadMode('lazy');
  uiStore.setGizmoMode('off');

  const exportStore = useExportStore.getState();
  exportStore.setScreenshotSize('current');
  exportStore.setScreenshotFormat('jpeg');
  exportStore.setScreenshotHideLogo(false);
  exportStore.setExportFormat('binary');
}
