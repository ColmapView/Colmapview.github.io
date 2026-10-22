import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ColmapManifest } from '../types/manifest';
import type { ArchiveEntry, ArchiveReader } from '../archive/types';
import { openManifestMediaArchives } from './urlLoaderMediaArchives';
import { prepareNativeMedia, rememberNativeMediaSource } from '../dataset/nativeMedia';
import { readCameraSourceFile } from '../dataset/importers/sourceAccess';
import { imageResourceUrl } from '../dataset/importers/sourcePaths';
import { validateColmapManifest } from '../utils/manifestValidation';
import { CameraModelId } from '../types/cameraModelId';
import { NativeMediaPathIndex } from '../dataset/nativeMediaPaths';
import type { Image } from '../types/colmap';
import { IndexedTarBackend } from '../archive/indexedTar';

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

it('indexes a complete first-frame TAR prefix and leaves later frame headers unread', async () => {
  vi.stubGlobal('Blob', NodeBlob);
  const original = new Uint8Array(65536).fill(255), header = new Uint8Array(512);
  const text = (value: string, offset: number) => header.set(new TextEncoder().encode(value), offset);
  text('capture/frame0/a.png', 0); text('00000000006\0', 124); text('00000000000\0', 136);
  header.fill(32, 148, 156); header[156] = 48;
  text(header.reduce((sum, value) => sum + value, 0).toString(8).padStart(6, '0') + '\0 ', 148);
  original.set(header); original.set(new TextEncoder().encode('source'), 512);
  const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
    const [from, to] = new Headers(init?.headers).get('Range')!.match(/\d+/g)!.map(Number);
    return new Response(original.slice(from, to + 1), { status: 206,
      headers: { 'Content-Range': `bytes ${from}-${to}/${original.length}` } });
  });
  const selected: ColmapManifest = { ...manifest, mediaArchives: [{ ...manifest.mediaArchives![0],
    bytes: original.length, indexBytes: 1024, stripPrefix: 'capture/frame0' }] };
  const resources = (await openManifestMediaArchives(selected, { fetchImpl, openReader: async (source, options) => {
    const signal = new AbortController().signal;
    const backend = new IndexedTarBackend({ name: source.name, size: source.size,
      read: async (offset, length) => new Uint8Array(await options.read!(offset, length, signal)) });
    const indexed = await backend.list(signal);
    return { close: () => backend.close(), getFilesArray: async () => indexed.map(entry => ({
      path: entry.path.slice(0, entry.path.lastIndexOf('/')),
      file: { name: entry.path.split('/').at(-1)!, size: entry.size, lastModified: entry.lastModified,
        extract: async () => backend.extract(entry.path, signal),
        extractPreview: async () => backend.extract(entry.path, signal) },
    })) };
  } }))!;
  expect(resources.imagePaths).toEqual(['images/dslr_images_undistorted/a.png']);
  expect(await (await resources.index.values().next().value!.extract()).text()).toBe('source');
  expect(new Headers(fetchImpl.mock.calls[0][1]?.headers).get('Range')).toBe('bytes=0-1023');
  expect(fetchImpl).toHaveBeenCalledOnce();
  await resources.reader.close();
});

it('closes every opened archive on duplicate mount paths or a later open failure', async () => {
  const first = reader(['capture/a.png']), second = reader(['capture/a.png']);
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

it('preserves case-distinct photos and binds each exact native name to its original bytes', async () => {
  const names = ['Palacio_Bolívar.JPG', 'Palacio_Bolívar.jpg'];
  const archive = reader(names.map(name => 'capture/' + name));
  for (const name of names) archive.extracts.get('capture/' + name)!.mockResolvedValue(new File([name], name));
  const resources = (await openManifestMediaArchives(manifest, { openReader: async () => archive.result }))!;
  const paths = names.map(name => 'images/dslr_images_undistorted/' + name);
  expect(resources.imagePaths).toEqual(paths);
  const pathIndex = new NativeMediaPathIndex(paths, 'sparse/0');
  expect(pathIndex.file('images/dslr_images_undistorted/Palacio_Bolívar.JpG').status).toBe('ambiguous');
  const files = new Map<string, File>();
  const source = { kind: 'url' as const, baseUrl: manifest.baseUrl, archiveEntries: resources.entries };
  rememberNativeMediaSource(files, { source, modelDir: 'sparse/0', paths, imagePaths: paths });
  const images = new Map<number, Image>();
  for (const [index, name] of names.entries()) images.set(index + 1, { imageId: index + 1, cameraId: 1,
    name: 'dslr_images_undistorted/' + name, qvec: [1, 0, 0, 0], tvec: [0, 0, 0], points2D: [] });
  const context = (await prepareNativeMedia(files, new File([''], 'cameras.txt'),
    new Map([[1, { cameraId: 1, modelId: CameraModelId.PINHOLE, width: 8, height: 4, params: [5, 5, 4, 2] }]]),
    images))!;
  for (const [index, name] of names.entries()) {
    const binding = context.bindings.get('dslr_images_undistorted/' + name)!;
    expect(binding.sourceImagePath).toBe(paths[index]);
    expect(await (await readCameraSourceFile(source, binding.sourceImagePath))?.text()).toBe(name);
    expect(archive.extracts.get('capture/' + name)).toHaveBeenCalledOnce();
  }
  await resources.reader.close();
  expect(archive.result.close).toHaveBeenCalledOnce();
});

it('rejects a repeated member after stripping leading dot segments', async () => {
  const archive = reader(['capture/a.png', './capture/a.png']);
  await expect(openManifestMediaArchives(manifest, { openReader: async () => archive.result })).rejects.toThrow(/collide/);
  expect(archive.result.close).toHaveBeenCalledOnce();
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
    { bytes: Number.MAX_SAFE_INTEGER + 1 }, { url: 'https://example.com/photos.tar.gz' }, { url: 'file:///photos.zip' },
    { indexBytes: 0 }, { indexBytes: 513 }, { indexBytes: 123904 }, { indexBytes: 1024, url: 'https://example.com/photos.zip' }]) {
    expect(validateColmapManifest({ ...manifest, mediaArchives: [{ ...manifest.mediaArchives![0], ...changes }] }).success).toBe(false);
  }
  expect(validateColmapManifest({ ...manifest, mediaArchives: [{ ...manifest.mediaArchives![0], indexBytes: 1024 }] }).success).toBe(true);
});
