import { describe, expect, it } from 'vitest';
import { parseConfigYaml } from '../config/configuration/serializer';
import { findDatasetViewerSettingsEntry, parseDatasetViewerSettings, resolveDatasetSplatSourceId, serializeDatasetViewerSettings } from './datasetViewerSettings';
import { createIdentityEuler } from './sim3dTransforms';
import type { PublishedViewerState } from './publishedViewerState';

const state: PublishedViewerState = { version: 1, viewerVersion: 'test',
  viewState: { position: [1, 2, 3], quaternion: [0, 0, 0, 1], target: [0, 0, 0], distance: 4 },
  config: { camera: { cameraScale: 0.4, cameraMode: 'orbit', selectedImageId: 1 },
    pointCloud: { pointSize: 2, maxReprojectionError: null }, ui: { backgroundColor: '#123456' },
    transform: createIdentityEuler(), splat: { activeSourceId: 'splats/scene.spz', transform: { ...createIdentityEuler(), translationY: 4 } } } };

describe('colmapview.yaml settings', () => {
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
