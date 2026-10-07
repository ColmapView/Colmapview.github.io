import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ColmapManifest } from './types/manifest';
import type { DecodedShareData, ShareConfig } from './utils/shareDataCodec';
import { createIdentityEuler } from './utils/sim3dTransforms';
import { applyShareConfig } from './hooks/useUrlState';
import { useReconstructionStore, useTransformStore } from './store';
import {
  APP_TOUCH_AUTO_LOG_MESSAGE,
  APP_TOUCH_PHONE_WIDTH_LOG_MESSAGE,
  getAppStartupLoadPlan,
  getShareSelectedImageId,
  getTouchModeAutoAction,
  getTouchModeUrlActionFromSearch,
  shouldEnableEmbedModeFromSearch,
} from './appStartupPolicy';

const manifest: ColmapManifest = {
  version: 1,
  name: 'Startup Dataset',
  baseUrl: 'https://example.com/dataset/',
  files: {
    cameras: 'sparse/0/cameras.bin',
    images: 'sparse/0/images.bin',
    points3D: 'sparse/0/points3D.bin',
  },
  imagesPath: 'images/',
};

const shareConfig: ShareConfig = {
  camera: {
    selectedImageId: 12,
  },
  ui: {
    showGallery: false,
  },
};

function buildShareData(overrides: Partial<DecodedShareData>): DecodedShareData {
  return {
    manifestUrl: null,
    manifest: null,
    viewState: null,
    config: null,
    ...overrides,
  };
}

describe('app startup policy', () => {
  it('detects enabled embed query flags only', () => {
    expect(shouldEnableEmbedModeFromSearch('?embed=1')).toBe(true);
    expect(shouldEnableEmbedModeFromSearch('?embed=true')).toBe(true);
    expect(shouldEnableEmbedModeFromSearch('?embed=0')).toBe(false);
    expect(shouldEnableEmbedModeFromSearch('?embed=false')).toBe(false);
    expect(shouldEnableEmbedModeFromSearch('')).toBe(false);
  });

  it('builds touch mode actions from URL override flags', () => {
    expect(getTouchModeUrlActionFromSearch('?touch=1')).toEqual({
      enabled: true,
      source: 'url',
      logMessage: '[App] Touch mode enabled (URL override)',
    });

    expect(getTouchModeUrlActionFromSearch('?touch=false')).toEqual({
      enabled: false,
      source: 'url',
      logMessage: '[App] Touch mode disabled (URL override)',
    });

    expect(getTouchModeUrlActionFromSearch('')).toBeNull();
  });

  it('builds auto touch mode actions only when touch is detected', () => {
    expect(getTouchModeAutoAction(true, false)).toEqual({
      enabled: true,
      source: 'auto',
      logMessage: APP_TOUCH_AUTO_LOG_MESSAGE,
    });
    expect(getTouchModeAutoAction(false, false)).toBeNull();
  });

  it('prioritizes inline manifests over other startup load sources', () => {
    const plan = getAppStartupLoadPlan({
      shareData: buildShareData({
        manifest,
        manifestUrl: 'https://example.com/manifest.json',
        config: shareConfig,
      }),
      legacyManifestUrl: 'https://legacy.example.com/manifest.json',
    });

    expect(plan).toEqual({
      kind: 'inline-manifest',
      manifest,
      config: shareConfig,
      selectedImageId: 12,
      logMessage: '[App] Loading from inline manifest in URL hash: Startup Dataset',
    });
  });

  it('uses combined manifest URLs before legacy query URLs', () => {
    const plan = getAppStartupLoadPlan({
      shareData: buildShareData({
        manifestUrl: 'https://example.com/manifest.json',
        config: shareConfig,
      }),
      legacyManifestUrl: 'https://legacy.example.com/manifest.json',
    });

    expect(plan).toEqual({
      kind: 'manifest-url',
      manifestUrl: 'https://example.com/manifest.json',
      config: shareConfig,
      selectedImageId: 12,
      logMessage: '[App] Loading from combined URL hash: https://example.com/manifest.json',
    });
  });

  it('falls back to legacy query URLs when no share source exists', () => {
    const plan = getAppStartupLoadPlan({
      shareData: null,
      legacyManifestUrl: 'https://legacy.example.com/manifest.json',
    });

    expect(plan).toEqual({
      kind: 'legacy-url',
      manifestUrl: 'https://legacy.example.com/manifest.json',
      config: null,
      selectedImageId: null,
      logMessage: '[App] Loading from URL parameter: https://legacy.example.com/manifest.json',
    });
  });

  it('keeps shared config even when there is no load source', () => {
    const plan = getAppStartupLoadPlan({
      shareData: buildShareData({ config: shareConfig }),
      legacyManifestUrl: null,
    });

    expect(plan).toEqual({
      kind: 'none',
      config: shareConfig,
      selectedImageId: null,
      logMessage: null,
    });
  });

  it("leaves a link's alignment to the scene its load commits", () => {
    const alignment = { ...createIdentityEuler(), rotationY: 0.5, translationX: 2 };
    const plan = getAppStartupLoadPlan({
      shareData: buildShareData({ manifestUrl: 'https://example.com/scene.zip',
        config: { ...shareConfig, transform: alignment, splat: { activeSourceId: 'a.spz', transform: alignment } } }),
      legacyManifestUrl: null,
    });

    // Display settings and the requested splat apply before the load; the alignment waits for the scene.
    expect(plan.config).toEqual({ ...shareConfig, splat: { activeSourceId: 'a.spz' } });
  });

  it('ignores malformed selected image ids from shared config', () => {
    expect(getShareSelectedImageId({ camera: { selectedImageId: '12' } })).toBeNull();
    expect(getShareSelectedImageId({ camera: { selectedImageId: 0 } })).toBe(0);
    expect(getShareSelectedImageId(null)).toBeNull();
  });
});

describe('a startup link cancelled before its scene loads', () => {
  const resetStores = () => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useTransformStore.setState(useTransformStore.getInitialState(), true);
  };
  beforeEach(resetStores);
  afterEach(() => {
    resetStores();
    window.history.replaceState(null, '', '/');
  });

  it('leaves no alignment behind for the next dataset', () => {
    const alignment = { ...createIdentityEuler(), scale: 2 };
    const plan = getAppStartupLoadPlan({
      shareData: buildShareData({ manifestUrl: 'https://example.com/scene.zip',
        config: { transform: alignment, splat: { transform: alignment } } }),
      legacyManifestUrl: null,
    });
    useReconstructionStore.setState({ urlLoading: true, urlProgress: { percent: 0, message: 'Initializing...' } });

    // What App does before it starts the load, which the visitor then cancels.
    if (plan.config) applyShareConfig(plan.config);
    useReconstructionStore.getState().cancelLoading();

    expect(useTransformStore.getState()).toMatchObject({ transform: createIdentityEuler(), splatTransform: createIdentityEuler() });
  });
});

describe('getTouchModeAutoAction', () => {
  it('enables touch mode for touch devices', () => {
    expect(getTouchModeAutoAction(true, false)).toEqual({
      enabled: true,
      source: 'auto',
      logMessage: APP_TOUCH_AUTO_LOG_MESSAGE,
    });
  });

  it('enables touch mode for phone-width viewports on non-touch devices', () => {
    expect(getTouchModeAutoAction(false, true)).toEqual({
      enabled: true,
      source: 'auto',
      logMessage: APP_TOUCH_PHONE_WIDTH_LOG_MESSAGE,
    });
  });

  it('returns null for wide non-touch environments', () => {
    expect(getTouchModeAutoAction(false, false)).toBeNull();
  });
});
