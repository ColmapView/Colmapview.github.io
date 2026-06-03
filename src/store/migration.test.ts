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
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
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
