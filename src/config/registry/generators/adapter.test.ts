import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PartialAppConfiguration } from '../../configuration/types';
import {
  applyConfigurationToStores,
  extractConfigurationFromStores,
  resetToDefaults,
} from './adapter';
import { useCameraStore } from '../../../store/stores/cameraStore';
import { useExportStore } from '../../../store/stores/exportStore';
import { usePointCloudStore } from '../../../store/stores/pointCloudStore';
import { useRigStore } from '../../../store/stores/rigStore';
import { useUIStore } from '../../../store/stores/uiStore';

describe('configuration store adapter', () => {
  beforeEach(() => {
    resetToDefaults();
  });

  afterEach(() => {
    resetToDefaults();
  });

  it('extracts config keys from their backing store keys', () => {
    usePointCloudStore.getState().setPointSize(6);
    usePointCloudStore.getState().setColorMode('splats');
    usePointCloudStore.getState().setMaxReprojectionError(Infinity);
    useCameraStore.getState().setCameraDisplayMode('arrow');
    useCameraStore.getState().setCameraScale(1.25);
    useUIStore.getState().setShowMaskOverlay(true);
    useExportStore.getState().setExportFormat('ply');
    useRigStore.getState().setShowRig(false);

    const config = extractConfigurationFromStores();

    expect(config.pointCloud.pointSize).toBe(6);
    expect(config.pointCloud.colorMode).toBe('splats');
    expect(config.pointCloud.maxReprojectionError).toBeNull();
    expect(config.camera.displayMode).toBe('arrow');
    expect(config.camera.scale).toBe(1.25);
    expect(config.ui.maskOverlay).toBe(true);
    expect(config.export.modelFormat).toBe('ply');
    expect(config.rig.showRig).toBe(false);
  });

  it('applies partial config values through store setters', () => {
    const importedConfig = {
      pointCloud: {
        pointSize: 4,
        colorMode: 'splats',
        maxReprojectionError: null,
      },
      camera: {
        displayMode: 'imageplane',
        scale: 0.75,
      },
      ui: {
        maskOverlay: true,
        galleryCollapsed: true,
      },
      export: {
        modelFormat: 'zip',
      },
      rig: {
        showRig: false,
        rigLineOpacity: 0.25,
      },
    } satisfies PartialAppConfiguration;

    applyConfigurationToStores(importedConfig);

    expect(usePointCloudStore.getState().pointSize).toBe(4);
    expect(usePointCloudStore.getState().colorMode).toBe('splats');
    expect(usePointCloudStore.getState().maxReprojectionError).toBe(Infinity);
    expect(useCameraStore.getState().cameraDisplayMode).toBe('imageplane');
    expect(useCameraStore.getState().cameraScale).toBe(0.75);
    expect(useUIStore.getState().showMaskOverlay).toBe(true);
    expect(useUIStore.getState().galleryCollapsed).toBe(true);
    expect(useExportStore.getState().exportFormat).toBe('zip');
    expect(useRigStore.getState().showRig).toBe(false);
    expect(useRigStore.getState().rigLineOpacity).toBe(0.25);
  });

  it('resets persisted store settings to registry defaults', () => {
    applyConfigurationToStores({
      pointCloud: {
        pointSize: 8,
        colorMode: 'splats',
        maxReprojectionError: 1.5,
      },
      camera: {
        displayMode: 'arrow',
        scale: 2,
      },
      ui: {
        maskOverlay: true,
      },
      export: {
        modelFormat: 'ply',
      },
      rig: {
        showRig: false,
      },
    });

    resetToDefaults();

    expect(usePointCloudStore.getState().pointSize).toBe(2);
    expect(usePointCloudStore.getState().showSplats).toBe(false);
    expect(usePointCloudStore.getState().colorMode).toBe('rgb');
    expect(usePointCloudStore.getState().maxReprojectionError).toBe(Infinity);
    expect(useCameraStore.getState().cameraDisplayMode).toBe('frustum');
    expect(useCameraStore.getState().cameraScale).toBe(0.25);
    expect(useUIStore.getState().showMaskOverlay).toBe(false);
    expect(useExportStore.getState().exportFormat).toBe('binary');
    expect(useRigStore.getState().showRig).toBe(true);
  });
});
