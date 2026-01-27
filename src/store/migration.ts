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
  settingsResetWarningShown: 'colmap-viewer-settings-reset-warning-shown',
} as const;

// Version for the settings reset warning - increment this to show the warning again
const SETTINGS_RESET_WARNING_VERSION = 1;

// Property mappings for migration
const POINT_CLOUD_PROPERTIES = [
  'pointSize',
  'colorMode',
  'minTrackLength',
] as const;

const CAMERA_PROPERTIES = [
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

/**
 * Apply legacy boolean-to-enum migrations from the old format
 */
function applyLegacyMigrations(state: Record<string, unknown>): Record<string, unknown> {
  const migrated = { ...state };

  // Migrate old showCameras boolean to new cameraDisplayMode
  if ('showCameras' in migrated && typeof migrated.showCameras === 'boolean') {
    migrated.cameraDisplayMode = migrated.showCameras ? 'frustum' : 'off';
    delete migrated.showCameras;
  }

  // Migrate old showMatches boolean to new matchesDisplayMode
  if ('showMatches' in migrated && typeof migrated.showMatches === 'boolean') {
    migrated.matchesDisplayMode = migrated.showMatches ? 'static' : 'off';
    delete migrated.showMatches;
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

    const parsed = JSON.parse(legacyData);
    // Zustand persist wraps state in { state: {...}, version: number }
    const legacyState = parsed.state || parsed;

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

    console.log('[Store Migration] Successfully migrated from legacy store to domain stores');
    return true;
  } catch (error) {
    console.error('[Store Migration] Failed to migrate legacy store:', error);
    return false;
  }
}

/**
 * Check if the settings reset warning should be shown and display it
 */
function showSettingsResetWarning(): void {
  if (typeof window === 'undefined') return;

  const currentVersion = String(SETTINGS_RESET_WARNING_VERSION);

  // Check if user has any existing settings FIRST (before checking version)
  // This ensures reset users (no settings) don't see the notification,
  // even if Zustand persist middleware writes defaults later
  const hasExistingSettings = [
    STORAGE_KEYS.pointCloud,
    STORAGE_KEYS.camera,
    STORAGE_KEYS.ui,
    STORAGE_KEYS.export,
    STORAGE_KEYS.rig,
  ].some(key => localStorage.getItem(key) !== null);

  if (!hasExistingSettings) {
    // Mark as shown for new users / reset users
    localStorage.setItem(STORAGE_KEYS.settingsResetWarningShown, currentVersion);
    return;
  }

  // For users WITH settings, check if they've seen this version
  const shownVersion = localStorage.getItem(STORAGE_KEYS.settingsResetWarningShown);
  if (shownVersion === currentVersion) return;

  // Show notification for existing users who haven't seen this version
  import('./stores/notificationStore').then(({ useNotificationStore }) => {
    useNotificationStore.getState().addNotification(
      'warning',
      'New features available! Consider resetting settings via the ⟳ button in the startup panel to enable them.'
    );
    localStorage.setItem(STORAGE_KEYS.settingsResetWarningShown, currentVersion);
  });
}

export function initStoreMigration(): void {
  migrateFromLegacyStore();
  showSettingsResetWarning();
}

/**
 * Mark the settings reset warning as shown (used when user explicitly resets settings)
 */
export function markSettingsResetWarningShown(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.settingsResetWarningShown, String(SETTINGS_RESET_WARNING_VERSION));
}
