import { describe, expect, it, vi } from 'vitest';
import { buildFile } from '../test/builders';
import type { ColmapManifest, UrlLoadError } from '../types/manifest';
import {
  discoverDirectoryListingSplatPaths,
  fetchManifestColmapFiles,
  fetchManifestFile,
  fetchUrlManifest,
} from './urlLoaderManifestFetch';

const manifest: ColmapManifest = {
  version: 1,
  name: 'test scene',
  baseUrl: 'https://example.com/dataset',
  files: {
    cameras: 'custom/cameras.bin',
    images: 'custom/images.bin',
    points3D: 'custom/points3D.bin',
    rigs: 'custom/rigs.bin',
    frames: 'custom/frames.bin',
  },
};

function jsonResponse(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

function textResponse(data: string, init: ResponseInit = {}): Response {
  return new Response(data, {
    status: 200,
    headers: { 'Content-Type': 'text/html' },
    ...init,
  });
}

function missingResponse(): Response {
  return new Response('', { status: 404, statusText: 'Missing' });
}

describe('URL loader manifest fetch helpers', () => {
  it('fetches and validates a manifest while reporting progress', async () => {
    const setUrlProgress = vi.fn();
    const fetchImpl = vi.fn(async () => jsonResponse(manifest));

    await expect(fetchUrlManifest('https://example.com/manifest.json', {
      fetchImpl,
      setUrlProgress,
    })).resolves.toEqual(manifest);

    expect(fetchImpl).toHaveBeenCalledWith('https://example.com/manifest.json');
    expect(setUrlProgress).toHaveBeenNthCalledWith(1, { percent: 2, message: 'Fetching manifest...' });
    expect(setUrlProgress).toHaveBeenNthCalledWith(2, { percent: 5, message: 'Manifest loaded' });
  });

  it('classifies manifest fetch status failures', async () => {
    const setUrlProgress = vi.fn();
    const fetchImpl = vi.fn(async () => jsonResponse({}, { status: 404, statusText: 'Missing' }));

    await expect(fetchUrlManifest('https://example.com/missing.json', {
      fetchImpl,
      setUrlProgress,
    })).rejects.toMatchObject({
      type: 'not_found',
      message: 'Failed to fetch manifest (404)',
      details: 'Missing',
      failedFile: 'https://example.com/missing.json',
    });
  });

  it('rejects invalid manifest JSON with schema details', async () => {
    const setUrlProgress = vi.fn();
    const fetchImpl = vi.fn(async () => jsonResponse({
      version: 1,
      baseUrl: 'not-a-url',
      files: { cameras: '', images: 'images.bin', points3D: 'points3D.bin' },
    }));

    await expect(fetchUrlManifest('https://example.com/manifest.json', {
      fetchImpl,
      setUrlProgress,
    })).rejects.toMatchObject({
      type: 'invalid_manifest',
      message: 'Invalid manifest format',
      failedFile: 'https://example.com/manifest.json',
    });
  });

  it('fetches a manifest-relative file and preserves the URL filename', async () => {
    const fetchImpl = vi.fn(async () => new Response('camera', {
      headers: { 'Content-Type': 'application/octet-stream' },
    }));

    const file = await fetchManifestFile(
      'https://example.com/dataset',
      'sparse/0/cameras.bin',
      { fetchImpl }
    );

    expect(fetchImpl).toHaveBeenCalledWith('https://example.com/dataset/sparse/0/cameras.bin');
    expect(file.name).toBe('cameras.bin');
    expect(file.type).toBe('application/octet-stream');
  });

  it('downloads required files, keeps optional successes, and ignores optional failures', async () => {
    const setUrlProgress = vi.fn();
    const log = vi.fn();
    const fetchImpl = vi.fn(async () => missingResponse());
    const fetchFile = vi.fn(async (_baseUrl: string, path: string) => {
      if (path === 'custom/frames.bin') {
        throw new Error('optional missing');
      }
      return buildFile(path.split('/').pop() ?? path);
    });

    const files = await fetchManifestColmapFiles(manifest, {
      fetchImpl,
      fetchFile,
      log,
      setUrlProgress,
    });

    expect([...files.keys()]).toEqual([
      'sparse/0/cameras.bin',
      'sparse/0/images.bin',
      'sparse/0/points3D.bin',
      'sparse/0/rigs.bin',
    ]);
    expect(fetchFile).toHaveBeenCalledTimes(5);
    expect(setUrlProgress).toHaveBeenCalledWith({
      percent: 5,
      message: 'Downloading COLMAP files...',
      filesDownloaded: 0,
      totalFiles: 3,
    });
    expect(setUrlProgress).toHaveBeenCalledWith(expect.objectContaining({
      percent: 30,
      currentFile: 'custom/points3D.bin',
      filesDownloaded: 3,
      totalFiles: 3,
    }));
    expect(log).toHaveBeenCalledWith('[URL Loader] Optional file loaded: custom/rigs.bin');
    expect(log).toHaveBeenCalledWith('[URL Loader] Optional file not found: custom/frames.bin');
  });

  it('downloads optional manifest splat entries into the returned file map', async () => {
    const setUrlProgress = vi.fn();
    const log = vi.fn();
    const fetchFile = vi.fn(async (_baseUrl: string, path: string) =>
      buildFile(path.split('/').pop() ?? path)
    );

    const files = await fetchManifestColmapFiles({
      ...manifest,
      splats: ['splats/small.ply', 'splats/large.ply'],
    }, {
      fetchFile,
      log,
      setUrlProgress,
    });

    expect([...files.keys()]).toContain('splats/small.ply');
    expect([...files.keys()]).toContain('splats/large.ply');
    expect(fetchFile).toHaveBeenCalledWith('https://example.com/dataset', 'splats/small.ply');
    expect(fetchFile).toHaveBeenCalledWith('https://example.com/dataset', 'splats/large.ply');
    expect(setUrlProgress).toHaveBeenCalledWith({
      percent: 30,
      message: 'Downloading splat files...',
      filesDownloaded: 0,
      totalFiles: 2,
    });
    const splatProgressUpdates = setUrlProgress.mock.calls
      .map(([progress]) => progress)
      .filter((progress) =>
        progress?.message === 'Downloading splat files...' && progress.currentFile
      );
    expect(splatProgressUpdates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        percent: 55,
        filesDownloaded: 1,
        totalFiles: 2,
      }),
      expect.objectContaining({
        percent: 80,
        filesDownloaded: 2,
        totalFiles: 2,
      }),
    ]));
    expect(splatProgressUpdates.map((progress) => progress.currentFile).sort()).toEqual([
      'splats/large.ply',
      'splats/small.ply',
    ]);
    expect(log).toHaveBeenCalledWith('[URL Loader] Optional file loaded: splats/small.ply');
    expect(log).toHaveBeenCalledWith('[URL Loader] Optional file loaded: splats/large.ply');
  });

  it('discovers all Hugging Face splats for direct dataset manifests', async () => {
    const setUrlProgress = vi.fn();
    const log = vi.fn();
    const baseUrl = 'https://huggingface.co/datasets/OpsiClear/NGS/resolve/main/objects/scan_toy';
    const fetchImpl = vi.fn(async () => jsonResponse([
      { type: 'directory', path: 'objects/scan_toy/images', size: 0 },
      { type: 'file', path: 'objects/scan_toy/inside_gaussians.ply', size: 52_347_387 },
      { type: 'file', path: 'objects/scan_toy/output/surface_gaussians.ply', size: 128_935_787 },
      { type: 'file', path: 'objects/scan_toy/3dgs/surface_gaussians.ply', size: 178_935_787 },
      { type: 'file', path: 'objects/scan_toy/folder/folder/folder/surface_gaussians.ply', size: 228_935_787 },
      { type: 'file', path: 'objects/scan_toy/splats/surface_gaussians.spz', size: 40_000_000 },
    ]));
    const fetchFile = vi.fn(async (_baseUrl: string, path: string) =>
      buildFile(path.split('/').pop() ?? path)
    );

    const files = await fetchManifestColmapFiles({
      ...manifest,
      baseUrl,
      splats: undefined,
    }, {
      fetchImpl,
      fetchFile,
      log,
      setUrlProgress,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://huggingface.co/api/datasets/OpsiClear/NGS/tree/main/objects/scan_toy?recursive=true'
    );
    expect(fetchFile).toHaveBeenCalledWith(baseUrl, 'splats/surface_gaussians.spz');
    expect(fetchFile).toHaveBeenCalledWith(baseUrl, 'inside_gaussians.ply');
    expect(fetchFile).toHaveBeenCalledWith(baseUrl, 'output/surface_gaussians.ply');
    expect(fetchFile).toHaveBeenCalledWith(baseUrl, '3dgs/surface_gaussians.ply');
    expect(fetchFile).toHaveBeenCalledWith(baseUrl, 'folder/folder/folder/surface_gaussians.ply');
    expect([...files.keys()]).toContain('splats/surface_gaussians.spz');
    expect([...files.keys()]).toContain('inside_gaussians.ply');
    expect([...files.keys()]).toContain('output/surface_gaussians.ply');
    expect([...files.keys()]).toContain('3dgs/surface_gaussians.ply');
    expect([...files.keys()]).toContain('folder/folder/folder/surface_gaussians.ply');
    expect(log).toHaveBeenCalledWith(
      '[URL Loader] Discovered 5 Hugging Face splat files: splats/surface_gaussians.spz (40000000 bytes), folder/folder/folder/surface_gaussians.ply (228935787 bytes), 3dgs/surface_gaussians.ply (178935787 bytes), output/surface_gaussians.ply (128935787 bytes), inside_gaussians.ply (52347387 bytes)'
    );
    expect(log).toHaveBeenCalledWith('[URL Loader] Optional file loaded: splats/surface_gaussians.spz');
    expect(log).toHaveBeenCalledWith('[URL Loader] Optional file loaded: folder/folder/folder/surface_gaussians.ply');
  });

  it('discovers all generic directory-listing splats recursively', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'HEAD') {
        const sizes = new Map([
          ['https://example.com/dataset/root_gaussians.ply', 10],
          ['https://example.com/dataset/root_gaussians.spz', 5],
          ['https://example.com/dataset/output/surface_gaussians.ply', 100],
          ['https://example.com/dataset/3dgs/model.ply', 200],
          ['https://example.com/dataset/folder/folder/folder/deep_gaussians.ply', 300],
        ]);
        const size = sizes.get(url);
        return size === undefined
          ? missingResponse()
          : new Response(null, { headers: { 'content-length': String(size) } });
      }

      if (url === 'https://example.com/dataset/') {
        return textResponse(`
          <a href="root_gaussians.ply">root</a>
          <a href="root_gaussians.spz">root compressed</a>
          <a href="output/">output</a>
          <a href="3dgs/">3dgs</a>
          <a href="folder/">folder</a>
        `);
      }
      if (url === 'https://example.com/dataset/output/') {
        return textResponse('<a href="surface_gaussians.ply">surface</a>');
      }
      if (url === 'https://example.com/dataset/3dgs/') {
        return textResponse('<a href="model.ply">model</a>');
      }
      if (url === 'https://example.com/dataset/folder/') {
        return textResponse('<a href="folder/">folder</a>');
      }
      if (url === 'https://example.com/dataset/folder/folder/') {
        return textResponse('<a href="folder/">folder</a>');
      }
      if (url === 'https://example.com/dataset/folder/folder/folder/') {
        return textResponse('<a href="deep_gaussians.ply">deep</a>');
      }

      return missingResponse();
    });

    await expect(discoverDirectoryListingSplatPaths('https://example.com/dataset', {
      fetchImpl,
    })).resolves.toEqual([
      { path: 'root_gaussians.spz', size: 5 },
      { path: 'folder/folder/folder/deep_gaussians.ply', size: 300 },
      { path: '3dgs/model.ply', size: 200 },
      { path: 'output/surface_gaussians.ply', size: 100 },
      { path: 'root_gaussians.ply', size: 10 },
    ]);
  });

  it('adds the generic directory-listing splat to downloaded manifest files', async () => {
    const setUrlProgress = vi.fn();
    const log = vi.fn();
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'HEAD') {
        const size = url.endsWith('/output/model.spz')
            ? 50
            : 200;
        return new Response(null, { headers: { 'content-length': String(size) } });
      }

      if (url === 'https://example.com/dataset/') {
        return textResponse('<a href="output/">output</a><a href="3dgs/">3dgs</a>');
      }
      if (url === 'https://example.com/dataset/output/') {
        return textResponse('<a href="model.spz">surface</a>');
      }
      if (url === 'https://example.com/dataset/3dgs/') {
        return textResponse('<a href="model.ply">model</a>');
      }

      return missingResponse();
    });
    const fetchFile = vi.fn(async (_baseUrl: string, path: string) =>
      buildFile(path.split('/').pop() ?? path)
    );

    const files = await fetchManifestColmapFiles({
      ...manifest,
      files: {
        cameras: 'sparse/0/cameras.bin',
        images: 'sparse/0/images.bin',
        points3D: 'sparse/0/points3D.bin',
      },
      splats: undefined,
    }, {
      fetchImpl,
      fetchFile,
      log,
      setUrlProgress,
    });

    expect(fetchFile).toHaveBeenCalledWith('https://example.com/dataset', 'output/model.spz');
    expect(fetchFile).toHaveBeenCalledWith('https://example.com/dataset', '3dgs/model.ply');
    expect([...files.keys()]).toContain('output/model.spz');
    expect([...files.keys()]).toContain('3dgs/model.ply');
    expect(log).toHaveBeenCalledWith(
      '[URL Loader] Discovered 2 directory splat files: output/model.spz (50 bytes), 3dgs/model.ply (200 bytes)'
    );
    expect(log).toHaveBeenCalledWith('[URL Loader] Optional file loaded: output/model.spz');
    expect(log).toHaveBeenCalledWith('[URL Loader] Optional file loaded: 3dgs/model.ply');
  });

  it('keeps explicit manifest splats instead of querying Hugging Face discovery', async () => {
    const setUrlProgress = vi.fn();
    const log = vi.fn();
    const baseUrl = 'https://huggingface.co/datasets/OpsiClear/NGS/resolve/main/objects/scan_toy';
    const fetchImpl = vi.fn(async () => jsonResponse([]));
    const fetchFile = vi.fn(async (_baseUrl: string, path: string) =>
      buildFile(path.split('/').pop() ?? path)
    );

    await fetchManifestColmapFiles({
      ...manifest,
      baseUrl,
      splats: ['manual_splat.ply'],
    }, {
      fetchImpl,
      fetchFile,
      log,
      setUrlProgress,
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(fetchFile).toHaveBeenCalledWith(baseUrl, 'manual_splat.ply');
  });

  it('rethrows required file UrlLoadError values without reclassification', async () => {
    const setUrlProgress = vi.fn();
    const fetchImpl = vi.fn(async () => missingResponse());
    const expectedError: UrlLoadError = {
      type: 'not_found',
      message: 'missing file',
      failedFile: 'https://example.com/dataset/custom/images.bin',
    };
    const fetchFile = vi.fn(async (_baseUrl: string, path: string) => {
      if (path === 'custom/images.bin') {
        throw expectedError;
      }
      return buildFile(path);
    });

    await expect(fetchManifestColmapFiles(manifest, {
      fetchImpl,
      fetchFile,
      setUrlProgress,
    })).rejects.toBe(expectedError);
  });

  it('classifies malformed required file errors instead of trusting a type field alone', async () => {
    const setUrlProgress = vi.fn();
    const fetchImpl = vi.fn(async () => missingResponse());
    const fetchFile = vi.fn(async (_baseUrl: string, path: string) => {
      if (path === 'custom/images.bin') {
        throw { type: 'not_found' };
      }
      return buildFile(path);
    });

    await expect(fetchManifestColmapFiles(manifest, {
      fetchImpl,
      fetchFile,
      setUrlProgress,
    })).rejects.toMatchObject({
      type: 'unknown',
      message: '[object Object]',
      failedFile: 'https://example.com/dataset/custom/images.bin',
    });
  });
});
