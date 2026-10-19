import { File as NodeFile } from 'node:buffer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ColmapManifest } from '../types/manifest';
import type { ArchiveEntry, ArchiveReader } from '../archive/types';
import { openManifestMediaArchives } from './urlLoaderMediaArchives';
import { prepareNativeMedia, rememberNativeMediaSource } from '../dataset/nativeMedia';
import { readCameraSourceFile } from '../dataset/importers/sourceAccess';
import { imageResourceUrl } from '../dataset/importers/sourcePaths';
import { validateColmapManifest } from '../utils/manifestValidation';
import { CameraModelId } from '../types/cameraModelId';

beforeEach(() => vi.stubGlobal('File', NodeFile));
afterEach(() => vi.unstubAllGlobals());

const manifest: ColmapManifest = { version: 2, baseUrl: 'https://example.com/scene/',
  files: { cameras: 'sparse/0/cameras.txt', images: 'sparse/0/images.txt' },
  mediaArchives: [{ url: 'https://example.com/photos.tar', bytes: 123456,
    mountPath: 'images/dslr_images_undistorted', stripPrefix: 'capture/' }] };

function reader(paths: string[]) {
  const extracts = new Map<string, ReturnType<typeof vi.fn>>();
  const files = paths.map(path => {
    const name = path.split('/').at(-1)!;
    const extract = vi.fn(async () => new File(['source photo'], name));
    extracts.set(path, extract);
    const file: ArchiveEntry = { name, size: 12, lastModified: 0, extract, extractPreview: extract };
    return { path: path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '', file };
  });
  const result: ArchiveReader = { getFilesArray: async () => files, close: vi.fn(async () => {}) };
  return { result, extracts };
}

it('mounts a capture TAR without flattening paths and reads the exact native photo lazily', async () => {
  const archive = reader(['./capture/a.png', 'capture/nested/a.png', 'capture/depth/a.png', 'capture/._a.png', 'other/a.png']);
  const openReader = vi.fn(async () => archive.result);
  const resources = (await openManifestMediaArchives(manifest, { openReader }))!;
  expect(resources.imagePaths).toEqual(['images/dslr_images_undistorted/a.png', 'images/dslr_images_undistorted/nested/a.png']);
  expect([...archive.extracts.values()].every(extract => extract.mock.calls.length === 0)).toBe(true);
  const files = new Map<string, File>();
  const source = { kind: 'url' as const, baseUrl: manifest.baseUrl, archiveEntries: resources.entries };
  rememberNativeMediaSource(files, { source, modelDir: 'sparse/0', paths: [...resources.index.keys()], imagePaths: resources.imagePaths });
  const context = (await prepareNativeMedia(files, new File([''], 'cameras.txt'),
    new Map([[1, { cameraId: 1, modelId: CameraModelId.PINHOLE, width: 8, height: 4, params: [5, 5, 4, 2] }]]),
    new Map([[1, { imageId: 1, cameraId: 1, name: 'dslr_images_undistorted/a.png', qvec: [1, 0, 0, 0], tvec: [0, 0, 0], points2D: [] }]])))!;
  const binding = context.bindings.get('dslr_images_undistorted/a.png')!;
  expect(binding.sourceImagePath).toBe('images/dslr_images_undistorted/a.png');
  const photo = await readCameraSourceFile(source, binding.sourceImagePath);
  expect(await photo?.text()).toBe('source photo');
  expect(archive.extracts.get('./capture/a.png')).toHaveBeenCalledOnce();
  expect(archive.extracts.get('capture/nested/a.png')).not.toHaveBeenCalled();
  const absolute = imageResourceUrl(manifest.baseUrl, binding.sourceImagePath);
  expect(await readCameraSourceFile(source, absolute)).not.toBeNull();
  await resources.reader.close();
  expect(archive.result.close).toHaveBeenCalledOnce();
});

it('closes every opened archive on duplicate mount paths or a later open failure', async () => {
  const first = reader(['capture/a.png']), second = reader(['capture/A.png']);
  const two = { ...manifest, mediaArchives: [...manifest.mediaArchives!, ...manifest.mediaArchives!] };
  await expect(openManifestMediaArchives(two, { openReader: vi.fn().mockResolvedValueOnce(first.result).mockResolvedValueOnce(second.result) }))
    .rejects.toThrow(/collide/);
  expect(first.result.close).toHaveBeenCalledOnce();
  expect(second.result.close).toHaveBeenCalledOnce();
  const third = reader(['capture/a.png']);
  await expect(openManifestMediaArchives(two, { openReader: vi.fn().mockResolvedValueOnce(third.result).mockRejectedValueOnce(new Error('range rejected')) }))
    .rejects.toThrow('range rejected');
  expect(third.result.close).toHaveBeenCalledOnce();
});

it.each(['../capture/a.png', '/capture/a.png', 'capture/../../a.png'])('rejects traversal instead of rebasing %s', async path => {
  const archive = reader([path]);
  await expect(openManifestMediaArchives(manifest, { openReader: async () => archive.result })).rejects.toThrow(/Unsafe/);
  expect(archive.result.close).toHaveBeenCalledOnce();
});

it('does not open skipped images and closes an archive cancelled during enumeration', async () => {
  const openReader = vi.fn();
  expect(await openManifestMediaArchives({ ...manifest, skipImages: true }, { openReader })).toBeNull();
  expect(openReader).not.toHaveBeenCalled();
  const controller = new AbortController(), archive = reader(['capture/a.png']);
  archive.result.getFilesArray = async () => { controller.abort(); return []; };
  await expect(openManifestMediaArchives(manifest, { signal: controller.signal, openReader: async () => archive.result })).rejects.toMatchObject({ name: 'AbortError' });
  expect(archive.result.close).toHaveBeenCalledOnce();
});

it('requires version 2 and rejects unsafe prefixes, unbounded sizes and unsupported containers', () => {
  expect(validateColmapManifest(manifest).success).toBe(true);
  expect(validateColmapManifest({ ...manifest, version: 1 }).success).toBe(false);
  for (const changes of [{ mountPath: '../images' }, { stripPrefix: '../capture' }, { bytes: 0 },
    { bytes: Number.MAX_SAFE_INTEGER + 1 }, { url: 'https://example.com/photos.tar.gz' }, { url: 'file:///photos.zip' }]) {
    expect(validateColmapManifest({ ...manifest, mediaArchives: [{ ...manifest.mediaArchives![0], ...changes }] }).success).toBe(false);
  }
});
