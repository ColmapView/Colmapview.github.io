import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyLegacyMigrations,
  parseLegacyPersistedState,
} from './migration';
import {
  migrateCameraPersistedState,
  migrateUIPersistedState,
} from './persistedStoreMigrations';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
});

describe('clearPersistedSettings', () => {
  it('discards stale writes from the outgoing page before stores hydrate after a reload', async () => {
    const migration = await importFreshMigration();
    for (const key of Object.values(migration.STORAGE_KEYS)) localStorage.setItem(key, 'old preference');
    localStorage.setItem('unrelated-setting', 'keep');
    migration.clearPersistedSettings();
    for (const key of Object.values(migration.STORAGE_KEYS)) expect(localStorage.getItem(key)).toBeNull();
    expect(sessionStorage.getItem(migration.STORAGE_KEYS.pendingSettingsReset)).toBe('1');

    // An FPS/idle update can persist the old in-memory state during a slow reload.
    localStorage.setItem(migration.STORAGE_KEYS.ui, JSON.stringify({ state: { backgroundColor: '#ffffff' }, version: 13 }));
    localStorage.setItem(migration.STORAGE_KEYS.camera, 'late camera preference');
    localStorage.setItem(migration.STORAGE_KEYS.theme, 'light');
    await importFreshMigration();
    const { useUIStore } = await import('./stores/uiStore');
    expect(useUIStore.getState().backgroundColor).toBe('#161616');
    expect(localStorage.getItem(migration.STORAGE_KEYS.camera)).toBeNull();
    expect(localStorage.getItem(migration.STORAGE_KEYS.theme)).toBeNull();
    expect(localStorage.getItem('unrelated-setting')).toBe('keep');
    expect(sessionStorage.getItem(migration.STORAGE_KEYS.pendingSettingsReset)).toBeNull();
  });

  it('consumes the reset once and preserves subsequent deliberate preferences', async () => {
    const migration = await importFreshMigration();
    migration.clearPersistedSettings();
    await importFreshMigration();
    const stored = JSON.stringify({ state: { backgroundColor: '#ffffff' }, version: 13 });
    localStorage.setItem(migration.STORAGE_KEYS.ui, stored);
    await importFreshMigration();
    expect(localStorage.getItem(migration.STORAGE_KEYS.ui)).toBe(stored);
    const { useUIStore } = await import('./stores/uiStore');
    expect(useUIStore.getState().backgroundColor).toBe('#ffffff');
  });

  it('retries a pending reset without breaking startup when local storage is temporarily blocked', async () => {
    const migration = await importFreshMigration();
    migration.clearPersistedSettings();
    const blocked = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError'); });
    await expect(importFreshMigration()).resolves.toBeDefined();
    expect(sessionStorage.getItem(migration.STORAGE_KEYS.pendingSettingsReset)).toBe('1');
    blocked.mockRestore();
    await importFreshMigration();
    expect(sessionStorage.getItem(migration.STORAGE_KEYS.pendingSettingsReset)).toBeNull();
  });

  it('discards late writes on page exit if session storage is unavailable', async () => {
    const migration = await importFreshMigration();
    localStorage.setItem(migration.STORAGE_KEYS.ui, 'old');
    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (this === sessionStorage) throw new DOMException('Blocked', 'SecurityError');
      return original.call(this, key, value);
    });
    expect(() => migration.clearPersistedSettings()).not.toThrow();
    expect(localStorage.getItem(migration.STORAGE_KEYS.ui)).toBeNull();
    localStorage.setItem(migration.STORAGE_KEYS.ui, 'late stale preference');
    window.dispatchEvent(new Event('pagehide'));
    expect(localStorage.getItem(migration.STORAGE_KEYS.ui)).toBeNull();
  });
});

describe('parseLegacyPersistedState', () => {
  it('parses plain legacy state objects', () => {
    expect(parseLegacyPersistedState(JSON.stringify({
      pointSize: 3,
      showCameras: true,
    }))).toEqual({
      pointSize: 3,
      showCameras: true,
    });
  });

  it('parses Zustand-wrapped legacy state objects', () => {
    expect(parseLegacyPersistedState(JSON.stringify({
      state: {
        cameraScale: 2,
        showMatches: false,
      },
      version: 0,
    }))).toEqual({
      cameraScale: 2,
      showMatches: false,
    });
  });

  it('rejects malformed, primitive, array, and invalid wrapped states', () => {
    expect(parseLegacyPersistedState('{not json')).toBeNull();
    expect(parseLegacyPersistedState('12')).toBeNull();
    expect(parseLegacyPersistedState('["pointSize"]')).toBeNull();
    expect(parseLegacyPersistedState(JSON.stringify({ state: 'bad' }))).toBeNull();
  });
});

describe('applyLegacyMigrations', () => {
  it('maps legacy booleans and renamed properties without mutating the input', () => {
    const state = {
      showCameras: false,
      showMatches: true,
      rainbowMode: true,
      rainbowSpeed: 1.5,
      pointSize: 4,
    };

    expect(applyLegacyMigrations(state)).toEqual({
      showCameras: false,
      cameraDisplayMode: 'frustum',
      showMatches: true,
      matchesDisplayMode: 'static',
      selectionColorMode: 'rainbow',
      selectionAnimationSpeed: 1.5,
      pointSize: 4,
    });
    expect(state).toEqual({
      showCameras: false,
      showMatches: true,
      rainbowMode: true,
      rainbowSpeed: 1.5,
      pointSize: 4,
    });
  });
});

describe('migrateFromLegacyStore', () => {
  it('splits valid legacy state into domain stores and removes the legacy key', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const migration = await importFreshMigration();
    localStorage.setItem(migration.STORAGE_KEYS.legacy, JSON.stringify({
      state: {
        pointSize: 4,
        minTrackLength: 3,
        showCameras: true,
        cameraScale: 2,
        showMatches: false,
        matchesOpacity: 0.5,
        screenshotFormat: 'png',
      },
      version: 0,
    }));

    expect(migration.migrateFromLegacyStore()).toBe(true);

    expect(JSON.parse(localStorage.getItem(migration.STORAGE_KEYS.pointCloud) ?? '')).toEqual({
      state: { pointSize: 4, minTrackLength: 3 },
      version: 0,
    });
    expect(JSON.parse(localStorage.getItem(migration.STORAGE_KEYS.camera) ?? '')).toEqual({
      state: { showCameras: true, cameraDisplayMode: 'frustum', cameraScale: 2 },
      version: 0,
    });
    expect(JSON.parse(localStorage.getItem(migration.STORAGE_KEYS.ui) ?? '')).toEqual({
      state: { showMatches: false, matchesDisplayMode: 'static', matchesOpacity: 0.5 },
      version: 0,
    });
    expect(JSON.parse(localStorage.getItem(migration.STORAGE_KEYS.export) ?? '')).toEqual({
      state: { screenshotFormat: 'png' },
      version: 0,
    });
    expect(localStorage.getItem(migration.STORAGE_KEYS.legacy)).toBeNull();
    expect(log).toHaveBeenCalledWith('[Store Migration] Successfully migrated from legacy store to domain stores');
  });

  it('preserves hidden legacy visibility settings through versioned domain migrations', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const migration = await importFreshMigration();
    localStorage.setItem(migration.STORAGE_KEYS.legacy, JSON.stringify({
      state: {
        showCameras: false,
        showMatches: false,
        showAxes: false,
        showGrid: false,
      },
      version: 0,
    }));

    expect(migration.migrateFromLegacyStore()).toBe(true);

    const cameraPayload = JSON.parse(localStorage.getItem(migration.STORAGE_KEYS.camera) ?? '');
    const uiPayload = JSON.parse(localStorage.getItem(migration.STORAGE_KEYS.ui) ?? '');

    expect(migrateCameraPersistedState(cameraPayload.state, cameraPayload.version)).toMatchObject({
      showCameras: false,
      cameraDisplayMode: 'frustum',
    });
    expect(migrateUIPersistedState(uiPayload.state, uiPayload.version, [])).toMatchObject({
      showMatches: false,
      matchesDisplayMode: 'static',
      showAxes: false,
      showGrid: false,
    });
    expect(log).toHaveBeenCalledWith('[Store Migration] Successfully migrated from legacy store to domain stores');
  });

  it('does not migrate or remove invalid non-object legacy state', async () => {
    const migration = await importFreshMigration();
    localStorage.setItem(migration.STORAGE_KEYS.legacy, JSON.stringify({ state: 'bad' }));

    expect(migration.migrateFromLegacyStore()).toBe(false);
    expect(localStorage.getItem(migration.STORAGE_KEYS.legacy)).toBe(JSON.stringify({ state: 'bad' }));
    expect(localStorage.getItem(migration.STORAGE_KEYS.pointCloud)).toBeNull();
  });

  it('does not migrate when a new domain store already exists', async () => {
    const migration = await importFreshMigration();
    localStorage.setItem(migration.STORAGE_KEYS.legacy, JSON.stringify({ pointSize: 4 }));
    localStorage.setItem(migration.STORAGE_KEYS.pointCloud, JSON.stringify({
      state: { pointSize: 1 },
      version: 0,
    }));

    expect(migration.migrateFromLegacyStore()).toBe(false);
    expect(JSON.parse(localStorage.getItem(migration.STORAGE_KEYS.pointCloud) ?? '')).toEqual({
      state: { pointSize: 1 },
      version: 0,
    });
  });

  it('runs at most once per module instance', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const migration = await importFreshMigration();
    localStorage.setItem(migration.STORAGE_KEYS.legacy, JSON.stringify({ pointSize: 4 }));

    expect(migration.migrateFromLegacyStore()).toBe(true);
    localStorage.setItem(migration.STORAGE_KEYS.legacy, JSON.stringify({ pointSize: 8 }));

    expect(migration.migrateFromLegacyStore()).toBe(false);
    expect(JSON.parse(localStorage.getItem(migration.STORAGE_KEYS.pointCloud) ?? '')).toEqual({
      state: { pointSize: 4 },
      version: 0,
    });
    expect(log).toHaveBeenCalledWith('[Store Migration] Successfully migrated from legacy store to domain stores');
  });
});

async function importFreshMigration(): Promise<typeof import('./migration')> {
  vi.resetModules();
  return import('./migration');
}
