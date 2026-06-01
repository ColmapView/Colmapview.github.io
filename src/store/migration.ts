import { useNotificationStore } from './stores/notificationStore';
import { appLogger } from '../utils/logger';

// Declare global version constant injected by Vite
declare const __APP_VERSION__: string;

// Storage keys
export const STORAGE_KEYS = {
  legacy: 'colmap-viewer-settings',
  pointCloud: 'colmap-viewer-pointcloud',
  camera: 'colmap-viewer-camera',
  ui: 'colmap-viewer-ui',
  export: 'colmap-viewer-export',
  rig: 'colmap-viewer-rig',
  guide: 'colmap-viewer-guide',
  profiles: 'colmap-viewer-profiles',
  lastSeenVersion: 'colmap-viewer-last-seen-version',
} as const;

export function clearPersistedSettings(): void {
  Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
}

// Property mappings for migration
const POINT_CLOUD_PROPERTIES = [
  'pointSize',
  'colorMode',
  'minTrackLength',
] as const;

const CAMERA_PROPERTIES = [
  'showCameras',
  'cameraDisplayMode',
  'cameraScale',
  'cameraMode',
  'flySpeed',
  'frustumColorMode',
  'unselectedCameraOpacity',
  'selectionColorMode',
  'selectionAnimationSpeed',
  'showImagePlanes',
  'selectionPlaneOpacity',
] as const;

const UI_PROPERTIES = [
  'showPoints2D',
  'showPoints3D',
  'showMatches',
  'matchesDisplayMode',
  'matchesOpacity',
  'showMaskOverlay',
  'maskOpacity',
  'showAxes',
  'showGrid',
  'axesOpacity',
  'backgroundColor',
  'autoRotate',
] as const;

const EXPORT_PROPERTIES = [
  'screenshotSize',
  'screenshotFormat',
  'screenshotHideLogo',
  'exportFormat',
] as const;

// Track if migration has been attempted this session
let migrationAttempted = false;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseLegacyPersistedState(legacyData: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(legacyData);
    if (!isRecord(parsed)) return null;

    // Zustand persist wraps state in { state: {...}, version: number }.
    if ('state' in parsed) {
      return isRecord(parsed.state) ? parsed.state : null;
    }

    return parsed;
  } catch {
    return null;
  }
}

/**
 * Apply legacy boolean-to-enum migrations from the old format
 */
export function applyLegacyMigrations(state: Record<string, unknown>): Record<string, unknown> {
  const migrated = { ...state };

  // Migrate old showCameras boolean to new cameraDisplayMode
  if ('showCameras' in migrated && typeof migrated.showCameras === 'boolean') {
    migrated.cameraDisplayMode = 'frustum';
  }

  // Migrate old showMatches boolean to new matchesDisplayMode
  if ('showMatches' in migrated && typeof migrated.showMatches === 'boolean') {
    migrated.matchesDisplayMode = 'static';
  }

  // Migrate old rainbowMode boolean to new selectionColorMode
  if ('rainbowMode' in migrated && typeof migrated.rainbowMode === 'boolean') {
    migrated.selectionColorMode = migrated.rainbowMode ? 'rainbow' : 'static';
    delete migrated.rainbowMode;
  }

  // Migrate old rainbowSpeed to selectionAnimationSpeed
  if ('rainbowSpeed' in migrated) {
    migrated.selectionAnimationSpeed = migrated.rainbowSpeed;
    delete migrated.rainbowSpeed;
  }

  // Legacy showAxes boolean is now directly used (no migration needed)
  // Old axesDisplayMode enum is handled in uiStore migration version 7

  return migrated;
}

function extractDomainState(
  legacyState: Record<string, unknown>,
  properties: readonly string[]
): Record<string, unknown> {
  const domainState: Record<string, unknown> = {};
  for (const prop of properties) {
    if (prop in legacyState) {
      domainState[prop] = legacyState[prop];
    }
  }
  return domainState;
}

function saveDomainStore(key: string, state: Record<string, unknown>): void {
  if (Object.keys(state).length > 0) {
    localStorage.setItem(key, JSON.stringify({ state, version: 0 }));
  }
}

export function needsMigration(): boolean {
  if (typeof window === 'undefined') return false;

  const legacyData = localStorage.getItem(STORAGE_KEYS.legacy);
  if (!legacyData) return false;

  // Check if any new store already exists (migration already done)
  const hasNewStores = [
    STORAGE_KEYS.pointCloud,
    STORAGE_KEYS.camera,
    STORAGE_KEYS.ui,
    STORAGE_KEYS.export,
  ].some(key => localStorage.getItem(key) !== null);

  return !hasNewStores;
}

export function migrateFromLegacyStore(): boolean {
  if (migrationAttempted) return false;
  migrationAttempted = true;

  if (!needsMigration()) return false;

  try {
    const legacyData = localStorage.getItem(STORAGE_KEYS.legacy);
    if (!legacyData) return false;

    const legacyState = parseLegacyPersistedState(legacyData);
    if (!legacyState) return false;

    // Apply legacy boolean migrations first
    const migratedState = applyLegacyMigrations(legacyState);

    // Extract and save each domain
    saveDomainStore(
      STORAGE_KEYS.pointCloud,
      extractDomainState(migratedState, POINT_CLOUD_PROPERTIES)
    );
    saveDomainStore(
      STORAGE_KEYS.camera,
      extractDomainState(migratedState, CAMERA_PROPERTIES)
    );
    saveDomainStore(
      STORAGE_KEYS.ui,
      extractDomainState(migratedState, UI_PROPERTIES)
    );
    saveDomainStore(
      STORAGE_KEYS.export,
      extractDomainState(migratedState, EXPORT_PROPERTIES)
    );

    // Remove legacy store after successful migration
    localStorage.removeItem(STORAGE_KEYS.legacy);

    appLogger.info('[Store Migration] Successfully migrated from legacy store to domain stores');
    return true;
  } catch (error) {
    appLogger.error('[Store Migration] Failed to migrate legacy store:', error);
    return false;
  }
}

/**
 * Check if the app version changed since last visit and show a notification if so.
 * Caches the current app version in localStorage so we can detect upgrades.
 */
function showNewVersionNotification(): void {
  if (typeof window === 'undefined') return;

  const currentVersion = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '';
  if (!currentVersion) return;

  const lastSeenVersion = localStorage.getItem(STORAGE_KEYS.lastSeenVersion);

  // First visit ever — just record the version, no notification
  if (lastSeenVersion === null) {
    localStorage.setItem(STORAGE_KEYS.lastSeenVersion, currentVersion);
    return;
  }

  // Same version — nothing to do
  if (lastSeenVersion === currentVersion) return;

  // Version changed — show notification and update cached version
  useNotificationStore.getState().addNotification(
    'info',
    `Updated to v${currentVersion}! Consider resetting settings via the ⟳ button in Settings to enable new defaults.`
  );
  localStorage.setItem(STORAGE_KEYS.lastSeenVersion, currentVersion);
}

export function initStoreMigration(): boolean {
  const migratedLegacyStore = migrateFromLegacyStore();
  showNewVersionNotification();
  return migratedLegacyStore;
}
