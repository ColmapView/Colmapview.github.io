import type { ColmapManifest } from './types/manifest';
import type { DecodedShareData, ShareConfig } from './utils/shareDataCodec';

export const APP_EMBED_MODE_LOG_MESSAGE = '[App] Embed mode enabled';
export const APP_SHARED_CONFIG_LOG_MESSAGE = '[App] Applying shared config';
export const APP_TOUCH_AUTO_LOG_MESSAGE = '[App] Touch mode enabled (auto-detected)';

export interface TouchModeStartupAction {
  enabled: boolean;
  source: 'url' | 'auto';
  logMessage: string;
}

interface AppStartupLoadPlanBase {
  config: ShareConfig | null;
  selectedImageId: number | null;
}

export type AppStartupLoadPlan =
  | (AppStartupLoadPlanBase & {
    kind: 'inline-manifest';
    manifest: ColmapManifest;
    logMessage: string;
  })
  | (AppStartupLoadPlanBase & {
    kind: 'manifest-url';
    manifestUrl: string;
    logMessage: string;
  })
  | (AppStartupLoadPlanBase & {
    kind: 'legacy-url';
    manifestUrl: string;
    logMessage: string;
  })
  | {
    kind: 'none';
    config: ShareConfig | null;
    selectedImageId: null;
    logMessage: null;
  };

export interface AppStartupLoadPlanOptions {
  shareData: DecodedShareData | null;
  legacyManifestUrl: string | null;
}

function isEnabledQueryFlag(value: string | null): boolean {
  return value === '1' || value === 'true';
}

export function shouldEnableEmbedModeFromSearch(search: string): boolean {
  return isEnabledQueryFlag(new URLSearchParams(search).get('embed'));
}

export function getTouchModeUrlActionFromSearch(search: string): TouchModeStartupAction | null {
  const touchParam = new URLSearchParams(search).get('touch');
  if (touchParam === null) return null;

  const enabled = isEnabledQueryFlag(touchParam);
  return {
    enabled,
    source: 'url',
    logMessage: `[App] Touch mode ${enabled ? 'enabled' : 'disabled'} (URL override)`,
  };
}

export function getTouchModeAutoAction(isTouchDevice: boolean): TouchModeStartupAction | null {
  if (!isTouchDevice) return null;

  return {
    enabled: true,
    source: 'auto',
    logMessage: APP_TOUCH_AUTO_LOG_MESSAGE,
  };
}

export function getShareSelectedImageId(config: ShareConfig | null | undefined): number | null {
  const selectedImageId = config?.camera?.selectedImageId;
  return typeof selectedImageId === 'number' ? selectedImageId : null;
}

export function getAppStartupLoadPlan({
  shareData,
  legacyManifestUrl,
}: AppStartupLoadPlanOptions): AppStartupLoadPlan {
  const config = shareData?.config ?? null;

  if (shareData?.manifest) {
    return {
      kind: 'inline-manifest',
      manifest: shareData.manifest,
      config,
      selectedImageId: getShareSelectedImageId(config),
      logMessage: `[App] Loading from inline manifest in URL hash: ${shareData.manifest.name || 'unnamed'}`,
    };
  }

  if (shareData?.manifestUrl) {
    return {
      kind: 'manifest-url',
      manifestUrl: shareData.manifestUrl,
      config,
      selectedImageId: getShareSelectedImageId(config),
      logMessage: `[App] Loading from combined URL hash: ${shareData.manifestUrl}`,
    };
  }

  if (legacyManifestUrl) {
    return {
      kind: 'legacy-url',
      manifestUrl: legacyManifestUrl,
      config,
      selectedImageId: null,
      logMessage: `[App] Loading from URL parameter: ${legacyManifestUrl}`,
    };
  }

  return {
    kind: 'none',
    config,
    selectedImageId: null,
    logMessage: null,
  };
}
