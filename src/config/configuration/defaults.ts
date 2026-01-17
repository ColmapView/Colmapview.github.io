import type { AppConfiguration } from './types';
import { CONFIG_VERSION } from './types';

export function getDefaultConfiguration(): AppConfiguration {
  return {
    version: CONFIG_VERSION,
    pointCloud: {
      pointSize: 2,
      colorMode: 'rgb',
      minTrackLength: 2,
      maxReprojectionError: null, // null = Infinity
    },
    camera: {
      displayMode: 'frustum',
      scale: 0.25,
      frustumColorMode: 'byCamera',
      unselectedOpacity: 0.5,
      mode: 'orbit',
      projection: 'perspective',
      fov: 60,
      horizonLock: false,
      flySpeed: 2.5,
      pointerLock: true,
      selectionColorMode: 'rainbow',
      selectionAnimationSpeed: 2,
      imagePlaneOpacity: 0.9,
    },
    ui: {
      showPoints2D: false,
      showPoints3D: false,
      backgroundColor: '#ffffff',
      autoRotate: false,
      matchesDisplayMode: 'off',
      matchesOpacity: 0.75,
      maskOverlay: false,
      maskOpacity: 0.7,
      axesDisplayMode: 'both',
      axesCoordinateSystem: 'colmap',
      axesScale: 1,
      imageLoadMode: 'lazy',
      gizmoMode: 'off',
    },
    export: {
      screenshotSize: 'current',
      screenshotFormat: 'jpeg',
      screenshotHideLogo: false,
      modelFormat: 'binary',
    },
  };
}
