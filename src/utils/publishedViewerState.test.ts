import { describe, expect, it } from 'vitest';
import { parsePublishedViewerState, sanitizeShareConfig } from './publishedViewerState';
import { createIdentityEuler } from './sim3dTransforms';
import { decodeShareData, encodeShareData } from './shareDataCodec';

describe('published viewer state', () => {
  it('allowlists presentation fields instead of replacing store actions', () => {
    const config = sanitizeShareConfig({ pointCloud: { pointSize: 2, setPointSize: 'overwrite', '__proto__': { polluted: true } },
      ui: { backgroundColor: '#112233', notifications: ['unexpected'] } });
    expect(config.pointCloud).toEqual({ pointSize: 2 });
    expect(config.ui).toEqual({ backgroundColor: '#112233' });
  });

  it('drops only invalid fields and keeps the remaining settings and alignment', () => {
    const transform = { ...createIdentityEuler(), translationX: 3 };
    const config = sanitizeShareConfig({ pointCloud: { pointSize: 2, colorMode: 'retired-mode' }, ui: { backgroundColor: '#fff' },
      transform, splat: { activeSourceId: 'splats/scene.ply', transform: { ...createIdentityEuler(), translationY: Infinity } } });
    expect(config.pointCloud).toEqual({ pointSize: 2 });
    expect(config.ui?.backgroundColor).toBeUndefined();
    expect(config.transform).toEqual(transform);
    expect(config.splat).toEqual({ activeSourceId: 'splats/scene.ply' });
  });

  it('keeps a document with one outdated display value, dropping only that value', () => {
    const transform = { ...createIdentityEuler(), translationY: 4 };
    const state = parsePublishedViewerState({ version: 1, viewerVersion: '1', viewState: null,
      config: { pointCloud: { pointSize: 2, colorMode: 'retired-mode' }, ui: { backgroundColor: '#fff' }, splat: { transform } } });
    expect(state.config.pointCloud).toEqual({ pointSize: 2 });
    expect(state.config.ui?.backgroundColor).toBeUndefined();
    expect(state.config.splat).toEqual({ transform });
  });

  it('rejects malformed or nonfinite transforms in dataset state', () => {
    expect(() => parsePublishedViewerState({ version: 1, viewerVersion: '1', viewState: null,
      config: { splat: { transform: { ...createIdentityEuler(), translationX: Infinity } } } })).toThrow();
  });

  it('round trips separate scene and splat transforms and still reads legacy links', async () => {
    const transform = { ...createIdentityEuler(), translationX: 3 };
    const splat = { transform: { ...createIdentityEuler(), translationY: 4 } };
    const modern = await decodeShareData(encodeShareData('https://example.com/manifest.json', null, { transform, splat }));
    expect(modern?.config).toEqual({ transform, splat });
    const legacy = await decodeShareData(encodeShareData('https://example.com/manifest.json', null, { transform }));
    expect(legacy?.config).toEqual({ transform });
  });
});
