import { describe, expect, it, vi } from 'vitest';
import { parseConfigYaml } from '../config/configuration/serializer';
import {
  findDatasetViewerSettingsEntry, parseDatasetViewerSettings, resolveDatasetSplatSourceId, resolveDatasetViewerSettings,
  serializeDatasetViewerSettings,
} from './datasetViewerSettings';
import { createIdentityEuler } from './sim3dTransforms';
import { MAX_VIEWER_STATE_BYTES, type PublishedViewerState } from './publishedViewerState';

const state: PublishedViewerState = { version: 1, viewerVersion: 'test',
  viewState: { position: [1, 2, 3], quaternion: [0, 0, 0, 1], target: [0, 0, 0], distance: 4 },
  config: { camera: { cameraScale: 0.4, cameraMode: 'orbit', selectedImageId: 1 },
    pointCloud: { pointSize: 2, maxReprojectionError: null }, ui: { backgroundColor: '#123456' },
    transform: createIdentityEuler(), splat: { activeSourceId: 'splats/scene.spz', transform: { ...createIdentityEuler(), translationY: 4 } } } };

describe('colmapview.yaml settings', () => {
  it('round trips zero-track cloud settings through dataset and application YAML', () => {
    const untracked = { ...state, config: { pointCloud: { minTrackLength: 0 } } };
    const yaml = serializeDatasetViewerSettings(untracked);
    expect(parseDatasetViewerSettings(yaml)).toEqual(untracked);
    expect(parseConfigYaml(yaml)).toMatchObject({ valid: true, config: { pointCloud: { minTrackLength: 0 } } });
  });

  it('round trips COLMAP only without resolving it to a settings directory or a default splat', () => {
    const none = { ...state, config: { ...state.config, splat: { activeSourceId: '' } } };
    expect(parseDatasetViewerSettings(serializeDatasetViewerSettings(none))).toEqual(none);
    expect(resolveDatasetSplatSourceId('', 'project/colmapview.yaml', ['project/splats/scene.spz'])).toBe('');
  });
  it('resolves splats relative to the settings directory instead of matching a basename', () => {
    const paths = ['other/splats/scene.spz', 'project/nested/scene.spz', 'project/splats/scene.spz'];
    expect(resolveDatasetSplatSourceId('splats/scene.spz', 'project/colmapview.yaml', paths)).toBe('project/splats/scene.spz');
    expect(resolveDatasetSplatSourceId('splats\\scene.spz', 'project\\colmapview.yaml', paths)).toBe('project/splats/scene.spz');
    expect(resolveDatasetSplatSourceId('project/splats/scene.spz', 'project/colmapview.yaml', paths)).toBe('project/splats/scene.spz');
    expect(resolveDatasetSplatSourceId('missing.spz', 'project/colmapview.yaml', paths)).toBe('missing.spz');
  });
  it('selects settings at the project root regardless of file discovery order', () => {
    const entries = new Map([['project/nested/colmapview.yaml', 'nested'], ['project/training.yaml', 'unrelated'],
      ['project/colmapview.yaml', 'root']]);
    expect(findDatasetViewerSettingsEntry(entries)).toEqual(['project/colmapview.yaml', 'root']);
    expect(findDatasetViewerSettingsEntry(new Map([['training.yaml', 'unrelated']]))).toBeUndefined();
  });
  it('round trips the reviewed camera, display settings and separate splat alignment', () => {
    const yaml = serializeDatasetViewerSettings(state);
    expect(yaml).toContain('viewer_version: test');
    expect(yaml).toContain('view_state:');
    expect(yaml).toContain('scale: 0.4');
    expect(yaml).not.toContain('camera_scale:');
    expect(parseDatasetViewerSettings(yaml)).toEqual(state);
    expect(parseConfigYaml(yaml)).toMatchObject({ valid: true, config: { camera: { scale: 0.4 }, ui: { backgroundColor: '#123456' } } });
  });

  it('accepts an ordinary partial exported configuration without publication metadata', () => {
    expect(parseDatasetViewerSettings('version: 1\ncamera:\n  show: false\n  projection: orthographic\nui:\n  background_color: "#112233"\n'))
      .toMatchObject({ version: 1, viewState: null, config: { camera: { showCameras: false, cameraProjection: 'orthographic' }, ui: { backgroundColor: '#112233' } } });
  });

  it('ignores unknown fields, including credentials and store actions', () => {
    const parsed = parseDatasetViewerSettings('ui:\n  background_color: "#112233"\n  set_background_color: replace\naccess_token: secret\nunknown: &cycle\n  child: *cycle\n');
    expect(parsed.config.ui).toEqual({ backgroundColor: '#112233' });
    expect(JSON.stringify(parsed)).not.toContain('secret');
  });

  it('keeps the other settings when one display value is invalid or outdated', () => {
    const parsed = parseDatasetViewerSettings('camera:\n  scale: -2\n  show: false\nui:\n  background_color: "#fff"\n  show_grid: false\n');
    expect(parsed.config.camera).toEqual({ showCameras: false });
    expect(parsed.config.ui).toEqual({ showGrid: false });
  });

  it('drops a self-referencing display value without following it', () => {
    expect(parseDatasetViewerSettings('ui: &cycle\n  background_color: *cycle\n').config.ui).toEqual({});
  });

  it.each(['version: 2', 'view_state: {position: [1, 2]}', 'splat:\n  transform:\n    scale: -1', 'camera: 5', '!!js/function x', ''])(
    'rejects malformed structure or alignment: %s', yaml => {
      expect(() => parseDatasetViewerSettings(yaml)).toThrow();
    });

  it('bounds input before parsing YAML', () => {
    expect(() => parseDatasetViewerSettings('#' + 'x'.repeat(256 * 1024))).toThrow('size');
  });
});

describe('the saved settings a load of some files applies', () => {
  const fromSource: PublishedViewerState = { version: 1, viewerVersion: 'test', viewState: null,
    config: { ui: { backgroundColor: '#111111' } } };
  const ownYaml = serializeDatasetViewerSettings({ ...fromSource, config: { ui: { backgroundColor: '#222222' } } });
  /** jsdom's File has no text(). */
  const settingsFile = (text: () => Promise<string>, size = 0) =>
    Object.assign(new File(['x'.repeat(size)], 'colmapview.yaml'), { text });

  it("lets the files' own colmapview.yaml win over the settings from their source", async () => {
    const files = new Map([['project/colmapview.yaml', settingsFile(async () => ownYaml)]]);
    await expect(resolveDatasetViewerSettings(files, fromSource))
      .resolves.toMatchObject({ config: { ui: { backgroundColor: '#222222' } } });
  });

  it('applies the settings from their source, else none, when the files hold no colmapview.yaml', async () => {
    const files = new Map([['cameras.bin', new File([''], 'cameras.bin')]]);
    const onSkipped = vi.fn();
    await expect(resolveDatasetViewerSettings(files, fromSource, onSkipped)).resolves.toBe(fromSource);
    await expect(resolveDatasetViewerSettings(files, undefined, onSkipped)).resolves.toBeNull();
    expect(onSkipped).not.toHaveBeenCalled();
  });

  it.each(['unreadable', 'invalid', 'oversized'] as const)(
    'skips a %s colmapview.yaml for the settings from their source, else none', async mode => {
      // Read in full, the oversized file would be valid settings of its own.
      const text = vi.fn(async () => {
        if (mode === 'unreadable') throw new Error('Read failed');
        return mode === 'invalid' ? 'version: 99' : ownYaml;
      });
      const files = new Map([['colmapview.yaml', settingsFile(text, mode === 'oversized' ? MAX_VIEWER_STATE_BYTES + 1 : 0)]]);
      const onSkipped = vi.fn();
      await expect(resolveDatasetViewerSettings(files, fromSource, onSkipped)).resolves.toBe(fromSource);
      await expect(resolveDatasetViewerSettings(files, null, onSkipped)).resolves.toBeNull();
      expect(onSkipped).toHaveBeenCalledTimes(2);
      if (mode === 'oversized') expect(text).not.toHaveBeenCalled();
    });

  it('resolves the saved splat among the files, relative to the colmapview.yaml', async () => {
    const yaml = serializeDatasetViewerSettings({ ...fromSource, config: { splat: { activeSourceId: 'splats/scene.spz' } } });
    const files = new Map([['other/splats/scene.spz', new File([''], 'scene.spz')],
      ['project/splats/scene.spz', new File([''], 'scene.spz')], ['project/colmapview.yaml', settingsFile(async () => yaml)]]);
    await expect(resolveDatasetViewerSettings(files, null))
      .resolves.toMatchObject({ config: { splat: { activeSourceId: 'project/splats/scene.spz' } } });
  });
});
