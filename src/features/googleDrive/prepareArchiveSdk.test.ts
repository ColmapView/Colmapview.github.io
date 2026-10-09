import { Blob as NodeBlob } from 'node:buffer';
import { unzipSync, strFromU8 } from 'fflate';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { prepareDriveArchive } from './prepareArchive';
import { buildCamera, buildDatasetState, buildImage, buildPoint3D, buildReconstruction } from '../../test/builders';
import { createIdentityEuler } from '../../utils/sim3dTransforms';

vi.mock('@huggingface/hub', () => { throw new Error('Optional Hub SDK chunk unavailable'); });
beforeEach(() => vi.stubGlobal('Blob', NodeBlob));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it.each(['local', 'zip', 'url'] as const)('packages a %s source without the Hub SDK', async sourceType => {
  const request = vi.fn(async () => new Response('original image'));
  vi.stubGlobal('fetch', request);
  const input = {
    sourceKey: 'source', modelRevision: 0, source: null,
    reconstruction: buildReconstruction({ cameras: [buildCamera()],
      images: sourceType === 'url' ? [buildImage({ name: 'photo.jpg' })] : [], points3D: [buildPoint3D()] }),
    dataset: buildDatasetState({ sourceType, imageUrlBase: sourceType === 'url' ? 'https://bucket.example/images/' : null }),
    activeSplatId: null, transform: createIdentityEuler(), splatTransform: createIdentityEuler(),
    config: {}, viewState: null, appVersion: 'test', viewerBaseUrl: 'https://viewer.example/',
  };
  const archive = await prepareDriveArchive(input, new AbortController().signal, () => {}, () => {});
  const entries = unzipSync(new Uint8Array(await archive.blob.arrayBuffer()));
  expect(entries['sparse/0/cameras.bin'].byteLength).toBeGreaterThan(0);
  expect(entries['colmapview.yaml']).toBeDefined();
  if (sourceType === 'url') {
    expect(strFromU8(entries['images/photo.jpg'])).toBe('original image');
    expect(request).toHaveBeenCalledOnce();
  } else expect(request).not.toHaveBeenCalled();
});
