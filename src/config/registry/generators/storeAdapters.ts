import {
  AUTO_ROTATE_MODES,
  AXES_COORDINATE_SYSTEMS,
  AXIS_LABEL_MODES,
  CAMERA_DISPLAY_MODES,
  CAMERA_MODES,
  CAMERA_PROJECTIONS,
  CAMERA_SCALE_FACTORS,
  COLOR_MODES,
  FRUSTUM_COLOR_MODES,
  HORIZON_LOCK_MODES,
  MATCHES_DISPLAY_MODES,
  RIG_COLOR_MODES,
  RIG_DISPLAY_MODES,
  SCREENSHOT_FORMATS,
  SCREENSHOT_SIZES,
  SELECTION_COLOR_MODES,
  UNDISTORTION_MODES,
} from '../../../store/types';
import { useCameraStore } from '../../../store/stores/cameraStore';
import { useExportStore } from '../../../store/stores/exportStore';
import { usePointCloudStore } from '../../../store/stores/pointCloudStore';
import { useRigStore } from '../../../store/stores/rigStore';
import { useUIStore } from '../../../store/stores/uiStore';
import {
  GALLERY_BORDER_COLOR_MODE_SETTINGS,
  GALLERY_SORT_DIRECTIONS,
  GALLERY_SORT_FIELDS,
  GALLERY_THUMBNAIL_DISPLAY_MODES,
  GALLERY_VIEW_MODE_SETTINGS,
} from '../../../types/gallery';
import type { StoreHook } from '../types';

const MODEL_EXPORT_FORMATS = ['text', 'binary', 'ply', 'zip'] as const;

export interface StoreConfigAdapter {
  read: (storeKey: string) => unknown;
  write: (storeKey: string, value: unknown) => void;
}

function isEnumValue<T extends readonly string[]>(value: unknown, values: T): value is T[number] {
  return typeof value === 'string' && values.some((candidate) => candidate === value);
}

function requireBoolean(storeKey: string, value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Configuration value for ${storeKey} must be a boolean`);
  }
  return value;
}

function requireNumber(storeKey: string, value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`Configuration value for ${storeKey} must be a number`);
  }
  return value;
}

function requireString(storeKey: string, value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error(`Configuration value for ${storeKey} must be a string`);
  }
  return value;
}

function requireEnum<T extends readonly string[]>(storeKey: string, value: unknown, values: T): T[number] {
  if (!isEnumValue(value, values)) {
    throw new Error(`Configuration value for ${storeKey} is not supported`);
  }
  return value;
}

function unsupportedStoreKey(storeHook: StoreHook, storeKey: string): never {
  throw new Error(`No configuration adapter for ${storeHook}.${storeKey}`);
}

const pointCloudAdapter: StoreConfigAdapter = {
  read: (storeKey) => {
      const state = usePointCloudStore.getState();
      switch (storeKey) {
      case 'showPointCloud': return state.showPointCloud;
      case 'pointSize': return state.pointSize;
      case 'pointOpacity': return state.pointOpacity;
      case 'colorMode': return state.colorMode;
      case 'minTrackLength': return state.minTrackLength;
      case 'maxReprojectionError': return state.maxReprojectionError;
      case 'thinning': return state.thinning;
      default: return unsupportedStoreKey('usePointCloudStore', storeKey);
    }
  },
  write: (storeKey, value) => {
    const state = usePointCloudStore.getState();
    switch (storeKey) {
      case 'showPointCloud':
        state.setShowPointCloud(requireBoolean(storeKey, value));
        return;
      case 'pointSize':
        state.setPointSize(requireNumber(storeKey, value));
        return;
      case 'pointOpacity':
        state.setPointOpacity(requireNumber(storeKey, value));
        return;
      case 'colorMode':
        state.setColorMode(requireEnum(storeKey, value, COLOR_MODES));
        return;
      case 'minTrackLength':
        state.setMinTrackLength(requireNumber(storeKey, value));
        return;
      case 'maxReprojectionError':
        state.setMaxReprojectionError(requireNumber(storeKey, value));
        return;
      case 'thinning':
        state.setThinning(requireNumber(storeKey, value));
        return;
      default:
        return unsupportedStoreKey('usePointCloudStore', storeKey);
    }
  },
};

const cameraAdapter: StoreConfigAdapter = {
  read: (storeKey) => {
    const state = useCameraStore.getState();
    switch (storeKey) {
      case 'showCameras': return state.showCameras;
      case 'cameraDisplayMode': return state.cameraDisplayMode;
      case 'cameraScaleFactor': return state.cameraScaleFactor;
      case 'cameraScale': return state.cameraScale;
      case 'frustumColorMode': return state.frustumColorMode;
      case 'frustumSingleColor': return state.frustumSingleColor;
      case 'frustumStandbyOpacity': return state.frustumStandbyOpacity;
      case 'frustumLineWidth': return state.frustumLineWidth;
      case 'unselectedCameraOpacity': return state.unselectedCameraOpacity;
      case 'cameraMode': return state.cameraMode;
      case 'cameraProjection': return state.cameraProjection;
      case 'cameraFov': return state.cameraFov;
      case 'horizonLock': return state.horizonLock;
      case 'autoRotateMode': return state.autoRotateMode;
      case 'autoRotateSpeed': return state.autoRotateSpeed;
      case 'flySpeed': return state.flySpeed;
      case 'flyTransitionDuration': return state.flyTransitionDuration;
      case 'pointerLock': return state.pointerLock;
      case 'showSelectionHighlight': return state.showSelectionHighlight;
      case 'selectionColorMode': return state.selectionColorMode;
      case 'selectionColor': return state.selectionColor;
      case 'selectionAnimationSpeed': return state.selectionAnimationSpeed;
      case 'selectionPlaneOpacity': return state.selectionPlaneOpacity;
      case 'undistortionEnabled': return state.undistortionEnabled;
      case 'undistortionMode': return state.undistortionMode;
      case 'autoFovEnabled': return state.autoFovEnabled;
      default: return unsupportedStoreKey('useCameraStore', storeKey);
    }
  },
  write: (storeKey, value) => {
    const state = useCameraStore.getState();
    switch (storeKey) {
      case 'showCameras':
        state.setShowCameras(requireBoolean(storeKey, value));
        return;
      case 'cameraDisplayMode':
        state.setCameraDisplayMode(requireEnum(storeKey, value, CAMERA_DISPLAY_MODES));
        return;
      case 'cameraScaleFactor':
        state.setCameraScaleFactor(requireEnum(storeKey, value, CAMERA_SCALE_FACTORS));
        return;
      case 'cameraScale':
        state.setCameraScale(requireNumber(storeKey, value));
        return;
      case 'frustumColorMode':
        state.setFrustumColorMode(requireEnum(storeKey, value, FRUSTUM_COLOR_MODES));
        return;
      case 'frustumSingleColor':
        state.setFrustumSingleColor(requireString(storeKey, value));
        return;
      case 'frustumStandbyOpacity':
        state.setFrustumStandbyOpacity(requireNumber(storeKey, value));
        return;
      case 'frustumLineWidth':
        state.setFrustumLineWidth(requireNumber(storeKey, value));
        return;
      case 'unselectedCameraOpacity':
        state.setUnselectedCameraOpacity(requireNumber(storeKey, value));
        return;
      case 'cameraMode':
        state.setCameraMode(requireEnum(storeKey, value, CAMERA_MODES));
        return;
      case 'cameraProjection':
        state.setCameraProjection(requireEnum(storeKey, value, CAMERA_PROJECTIONS));
        return;
      case 'cameraFov':
        state.setCameraFov(requireNumber(storeKey, value));
        return;
      case 'horizonLock':
        state.setHorizonLock(requireEnum(storeKey, value, HORIZON_LOCK_MODES));
        return;
      case 'autoRotateMode':
        state.setAutoRotateMode(requireEnum(storeKey, value, AUTO_ROTATE_MODES));
        return;
      case 'autoRotateSpeed':
        state.setAutoRotateSpeed(requireNumber(storeKey, value));
        return;
      case 'flySpeed':
        state.setFlySpeed(requireNumber(storeKey, value));
        return;
      case 'flyTransitionDuration':
        state.setFlyTransitionDuration(requireNumber(storeKey, value));
        return;
      case 'pointerLock':
        state.setPointerLock(requireBoolean(storeKey, value));
        return;
      case 'showSelectionHighlight':
        state.setShowSelectionHighlight(requireBoolean(storeKey, value));
        return;
      case 'selectionColorMode':
        state.setSelectionColorMode(requireEnum(storeKey, value, SELECTION_COLOR_MODES));
        return;
      case 'selectionColor':
        state.setSelectionColor(requireString(storeKey, value));
        return;
      case 'selectionAnimationSpeed':
        state.setSelectionAnimationSpeed(requireNumber(storeKey, value));
        return;
      case 'selectionPlaneOpacity':
        state.setSelectionPlaneOpacity(requireNumber(storeKey, value));
        return;
      case 'undistortionEnabled':
        state.setUndistortionEnabled(requireBoolean(storeKey, value));
        return;
      case 'undistortionMode':
        state.setUndistortionMode(requireEnum(storeKey, value, UNDISTORTION_MODES));
        return;
      case 'autoFovEnabled':
        state.setAutoFovEnabled(requireBoolean(storeKey, value));
        return;
      default:
        return unsupportedStoreKey('useCameraStore', storeKey);
    }
  },
};

const uiAdapter: StoreConfigAdapter = {
  read: (storeKey) => {
    const state = useUIStore.getState();
    switch (storeKey) {
      case 'showPoints2D': return state.showPoints2D;
      case 'showPoints3D': return state.showPoints3D;
      case 'backgroundColor': return state.backgroundColor;
      case 'showMatches': return state.showMatches;
      case 'matchesDisplayMode': return state.matchesDisplayMode;
      case 'matchesOpacity': return state.matchesOpacity;
      case 'matchesColor': return state.matchesColor;
      case 'matchesLineWidth': return state.matchesLineWidth;
      case 'showMaskOverlay': return state.showMaskOverlay;
      case 'maskOpacity': return state.maskOpacity;
      case 'showAxes': return state.showAxes;
      case 'showGrid': return state.showGrid;
      case 'axesCoordinateSystem': return state.axesCoordinateSystem;
      case 'axesScale': return state.axesScale;
      case 'gridScale': return state.gridScale;
      case 'axisLabelMode': return state.axisLabelMode;
      case 'showGizmo': return state.showGizmo;
      case 'galleryCollapsed': return state.galleryCollapsed;
      case 'galleryViewMode': return state.galleryViewMode;
      case 'galleryColumns': return state.galleryColumns;
      case 'galleryCameraFilter': return state.galleryCameraFilter;
      case 'gallerySortField': return state.gallerySortField;
      case 'gallerySortDirection': return state.gallerySortDirection;
      case 'galleryBorderColorMode': return state.galleryBorderColorMode;
      case 'galleryThumbnailDisplayMode': return state.galleryThumbnailDisplayMode;
      default: return unsupportedStoreKey('useUIStore', storeKey);
    }
  },
  write: (storeKey, value) => {
    const state = useUIStore.getState();
    switch (storeKey) {
      case 'showPoints2D':
        state.setShowPoints2D(requireBoolean(storeKey, value));
        return;
      case 'showPoints3D':
        state.setShowPoints3D(requireBoolean(storeKey, value));
        return;
      case 'backgroundColor':
        state.setBackgroundColor(requireString(storeKey, value));
        return;
      case 'showMatches':
        state.setShowMatches(requireBoolean(storeKey, value));
        return;
      case 'matchesDisplayMode':
        state.setMatchesDisplayMode(requireEnum(storeKey, value, MATCHES_DISPLAY_MODES));
        return;
      case 'matchesOpacity':
        state.setMatchesOpacity(requireNumber(storeKey, value));
        return;
      case 'matchesColor':
        state.setMatchesColor(requireString(storeKey, value));
        return;
      case 'matchesLineWidth':
        state.setMatchesLineWidth(requireNumber(storeKey, value));
        return;
      case 'showMaskOverlay':
        state.setShowMaskOverlay(requireBoolean(storeKey, value));
        return;
      case 'maskOpacity':
        state.setMaskOpacity(requireNumber(storeKey, value));
        return;
      case 'showAxes':
        state.setShowAxes(requireBoolean(storeKey, value));
        return;
      case 'showGrid':
        state.setShowGrid(requireBoolean(storeKey, value));
        return;
      case 'axesCoordinateSystem':
        state.setAxesCoordinateSystem(requireEnum(storeKey, value, AXES_COORDINATE_SYSTEMS));
        return;
      case 'axesScale':
        state.setAxesScale(requireNumber(storeKey, value));
        return;
      case 'gridScale':
        state.setGridScale(requireNumber(storeKey, value));
        return;
      case 'axisLabelMode':
        state.setAxisLabelMode(requireEnum(storeKey, value, AXIS_LABEL_MODES));
        return;
      case 'showGizmo':
        state.setShowGizmo(requireBoolean(storeKey, value));
        return;
      case 'galleryCollapsed':
        state.setGalleryCollapsed(requireBoolean(storeKey, value));
        return;
      case 'galleryViewMode':
        state.setGalleryViewMode(requireEnum(storeKey, value, GALLERY_VIEW_MODE_SETTINGS));
        return;
      case 'galleryColumns':
        state.setGalleryColumns(requireNumber(storeKey, value));
        return;
      case 'galleryCameraFilter':
        state.setGalleryCameraFilter(requireString(storeKey, value));
        return;
      case 'gallerySortField':
        state.setGallerySortField(requireEnum(storeKey, value, GALLERY_SORT_FIELDS));
        return;
      case 'gallerySortDirection':
        state.setGallerySortDirection(requireEnum(storeKey, value, GALLERY_SORT_DIRECTIONS));
        return;
      case 'galleryBorderColorMode':
        state.setGalleryBorderColorMode(requireEnum(storeKey, value, GALLERY_BORDER_COLOR_MODE_SETTINGS));
        return;
      case 'galleryThumbnailDisplayMode':
        state.setGalleryThumbnailDisplayMode(requireEnum(storeKey, value, GALLERY_THUMBNAIL_DISPLAY_MODES));
        return;
      default:
        return unsupportedStoreKey('useUIStore', storeKey);
    }
  },
};

const exportAdapter: StoreConfigAdapter = {
  read: (storeKey) => {
    const state = useExportStore.getState();
    switch (storeKey) {
      case 'screenshotSize': return state.screenshotSize;
      case 'screenshotFormat': return state.screenshotFormat;
      case 'screenshotHideLogo': return state.screenshotHideLogo;
      case 'exportFormat': return state.exportFormat;
      default: return unsupportedStoreKey('useExportStore', storeKey);
    }
  },
  write: (storeKey, value) => {
    const state = useExportStore.getState();
    switch (storeKey) {
      case 'screenshotSize':
        state.setScreenshotSize(requireEnum(storeKey, value, SCREENSHOT_SIZES));
        return;
      case 'screenshotFormat':
        state.setScreenshotFormat(requireEnum(storeKey, value, SCREENSHOT_FORMATS));
        return;
      case 'screenshotHideLogo':
        state.setScreenshotHideLogo(requireBoolean(storeKey, value));
        return;
      case 'exportFormat':
        state.setExportFormat(requireEnum(storeKey, value, MODEL_EXPORT_FORMATS));
        return;
      default:
        return unsupportedStoreKey('useExportStore', storeKey);
    }
  },
};

const rigAdapter: StoreConfigAdapter = {
  read: (storeKey) => {
    const state = useRigStore.getState();
    switch (storeKey) {
      case 'showRig': return state.showRig;
      case 'rigDisplayMode': return state.rigDisplayMode;
      case 'rigColorMode': return state.rigColorMode;
      case 'rigLineColor': return state.rigLineColor;
      case 'rigLineOpacity': return state.rigLineOpacity;
      case 'rigLineWidth': return state.rigLineWidth;
      default: return unsupportedStoreKey('useRigStore', storeKey);
    }
  },
  write: (storeKey, value) => {
    const state = useRigStore.getState();
    switch (storeKey) {
      case 'showRig':
        state.setShowRig(requireBoolean(storeKey, value));
        return;
      case 'rigDisplayMode':
        state.setRigDisplayMode(requireEnum(storeKey, value, RIG_DISPLAY_MODES));
        return;
      case 'rigColorMode':
        state.setRigColorMode(requireEnum(storeKey, value, RIG_COLOR_MODES));
        return;
      case 'rigLineColor':
        state.setRigLineColor(requireString(storeKey, value));
        return;
      case 'rigLineOpacity':
        state.setRigLineOpacity(requireNumber(storeKey, value));
        return;
      case 'rigLineWidth':
        state.setRigLineWidth(requireNumber(storeKey, value));
        return;
      default:
        return unsupportedStoreKey('useRigStore', storeKey);
    }
  },
};

const storeConfigAdapters = {
  usePointCloudStore: pointCloudAdapter,
  useCameraStore: cameraAdapter,
  useUIStore: uiAdapter,
  useExportStore: exportAdapter,
  useRigStore: rigAdapter,
} satisfies Record<StoreHook, StoreConfigAdapter>;

export function getStoreConfigAdapter(storeHook: StoreHook): StoreConfigAdapter {
  return storeConfigAdapters[storeHook];
}
