import { describe, expect, it, vi } from 'vitest';
import { buildFile } from '../test/builders';
import type { ColmapManifest, UrlLoadError } from '../types/manifest';
import {
  deriveMasksPathFromImages,
  discoverDirectoryListingSplatPaths,
  discoverHuggingFaceSplatPaths,
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
    // The third arg is the optional byte-progress callback for splat files.
    expect(fetchFile).toHaveBeenCalledWith('https://example.com/dataset', 'splats/small.ply', expect.anything());
    expect(fetchFile).toHaveBeenCalledWith('https://example.com/dataset', 'splats/large.ply', expect.anything());
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

  it('does not auto-load any splat when multiple are discovered, but surfaces the catalog', async () => {
    const setUrlProgress = vi.fn();
    const log = vi.fn();
    const onRemoteSplatCatalog = vi.fn();
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
      onRemoteSplatCatalog,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://huggingface.co/api/datasets/OpsiClear/NGS/tree/main/objects/scan_toy?recursive=true'
    );
    // No splat is eager-downloaded when there are multiple; the user picks one.
    expect(fetchFile).not.toHaveBeenCalledWith(baseUrl, 'splats/surface_gaussians.spz');
    expect(fetchFile).not.toHaveBeenCalledWith(baseUrl, 'inside_gaussians.ply');
    expect([...files.keys()].some((key) => key.endsWith('.ply') || key.endsWith('.spz'))).toBe(false);
    // The full catalog (all 5 splats) is surfaced for lazy on-demand loading.
    expect(onRemoteSplatCatalog).toHaveBeenCalledTimes(1);
    expect(onRemoteSplatCatalog.mock.calls[0][0].map((candidate: { path: string }) => candidate.path)).toEqual([
      'splats/surface_gaussians.spz',
      'folder/folder/folder/surface_gaussians.ply',
      '3dgs/surface_gaussians.ply',
      'output/surface_gaussians.ply',
      'inside_gaussians.ply',
    ]);
    expect(log).toHaveBeenCalledWith(
      '[URL Loader] 5 splats found; none auto-loaded - select one to display'
    );
  });

  it('auto-loads the splat when exactly one is discovered', async () => {
    const setUrlProgress = vi.fn();
    const onRemoteSplatCatalog = vi.fn();
    const baseUrl = 'https://huggingface.co/datasets/OpsiClear/NGS/resolve/main/objects/scan_single';
    const fetchImpl = vi.fn(async () => jsonResponse([
      { type: 'file', path: 'objects/scan_single/splats/scene.spz', size: 40_000_000 },
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
      setUrlProgress,
      onRemoteSplatCatalog,
    });

    expect(fetchFile).toHaveBeenCalledWith(baseUrl, 'splats/scene.spz', expect.anything());
    expect([...files.keys()]).toContain('splats/scene.spz');
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

  it('discovers generic directory-listing splats without auto-downloading when multiple', async () => {
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

    // Multiple discovered -> none auto-loaded; user selects from the catalog.
    expect(fetchFile).not.toHaveBeenCalledWith('https://example.com/dataset', '3dgs/model.ply');
    expect(fetchFile).not.toHaveBeenCalledWith('https://example.com/dataset', 'output/model.spz');
    expect([...files.keys()]).not.toContain('output/model.spz');
    expect([...files.keys()]).not.toContain('3dgs/model.ply');
    expect(log).toHaveBeenCalledWith(
      '[URL Loader] Discovered 2 directory splat files: output/model.spz (50 bytes), 3dgs/model.ply (200 bytes)'
    );
    expect(log).toHaveBeenCalledWith(
      '[URL Loader] 2 splats found; none auto-loaded - select one to display'
    );
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
    expect(fetchFile).toHaveBeenCalledWith(baseUrl, 'manual_splat.ply', expect.anything());
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

describe('splat discovery robustness', () => {
  const HF_BASE = 'https://huggingface.co/datasets/x/y/resolve/main/ds';
  const HF_API = 'https://huggingface.co/api/datasets/x/y/tree/main/ds?recursive=true';

  it('F2: does not download the full body when classifying a Range-ignored 200', async () => {
    let pulls = 0;
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        // First chunk carries the PLY header; rest simulates a multi-GB body.
        controller.enqueue(new TextEncoder().encode('ply\nformat binary_little_endian 1.0\n'.padEnd(8192, ' ')));
      },
      pull(controller) {
        pulls += 1;
        if (pulls > 100) {
          controller.close(); // safety: a broken bound would otherwise loop forever
          return;
        }
        controller.enqueue(new Uint8Array(8192));
      },
      cancel,
    });
    const fetchImpl = vi.fn(async (url: string) =>
      url.includes('/api/datasets/')
        ? jsonResponse([{ type: 'file', path: 'ds/point_cloud.ply', size: 9_000_000_000 }])
        // 200 (NOT 206): the server ignored the Range header.
        : new Response(body, { status: 200 })
    );

    await discoverHuggingFaceSplatPaths(HF_BASE, { fetchImpl });

    expect(cancel).toHaveBeenCalled();
    expect(pulls).toBeLessThan(20); // ~64KB / 8KB, not the whole 9GB
  });

  it('F9: caps concurrent splat classification at 6', async () => {
    const entries = Array.from({ length: 20 }, (_, i) => ({
      type: 'file', path: `ds/tile${i}.ply`, size: 100,
    }));
    const fetchImpl = vi.fn(async () => jsonResponse(entries));
    let inFlight = 0;
    let peak = 0;
    const classifySplatUrl = vi.fn(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return true;
    });

    const result = await discoverHuggingFaceSplatPaths(HF_BASE, { fetchImpl, classifySplatUrl });

    expect(result).toHaveLength(20);
    expect(peak).toBeLessThanOrEqual(6);
  });

  it('F6: de-duplicates repeated tree entries so one splat is not counted as many', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([
      { type: 'file', path: 'ds/scene.ply', size: 100 },
      { type: 'file', path: 'ds/scene.ply', size: 100 },
    ]));
    const classifySplatUrl = vi.fn(async () => true);

    const result = await discoverHuggingFaceSplatPaths(HF_BASE, { fetchImpl, classifySplatUrl });

    expect(result.map((c) => c.path)).toEqual(['scene.ply']);
  });

  it('F6: stops paginating on a cyclic next cursor', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(
      [{ type: 'file', path: 'ds/scene.ply', size: 1 }],
      { headers: { 'Content-Type': 'application/json', Link: `<${HF_API}>; rel="next"` } }
    ));
    const classifySplatUrl = vi.fn(async () => true);

    await discoverHuggingFaceSplatPaths(HF_BASE, { fetchImpl, classifySplatUrl });

    const treeFetches = fetchImpl.mock.calls.filter(([u]) => String(u).includes('/api/datasets/')).length;
    expect(treeFetches).toBe(1); // the cyclic cursor (same url) is not re-fetched
  });

  it('F15: does not follow a cross-origin pagination cursor', async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url === HF_API
        ? jsonResponse(
            [{ type: 'file', path: 'ds/scene.ply', size: 1 }],
            { headers: { 'Content-Type': 'application/json', Link: '<https://evil.example/steal>; rel="next"' } }
          )
        : jsonResponse([])
    );
    const classifySplatUrl = vi.fn(async () => true);

    await discoverHuggingFaceSplatPaths(HF_BASE, { fetchImpl, classifySplatUrl });

    expect(fetchImpl).not.toHaveBeenCalledWith('https://evil.example/steal');
  });

  it('F8: keeps a directory-listing splat whose HEAD lacks Content-Length', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'HEAD') {
        return new Response(null, { status: 200 }); // no content-length
      }
      if (url === 'https://example.com/dataset/') {
        return textResponse('<a href="model.ply">m</a>');
      }
      return missingResponse();
    });

    const result = await discoverDirectoryListingSplatPaths('https://example.com/dataset', { fetchImpl });

    expect(result).toEqual([{ path: 'model.ply', size: 0 }]);
  });

  it('decodes directory-listing splat paths so they are not double-encoded on fetch', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'HEAD') {
        return new Response(null, { headers: { 'content-length': '10' } });
      }
      if (url === 'https://example.com/dataset/') {
        // A correct static listing serves the '#' percent-encoded in the href.
        return textResponse('<a href="5x5%23-5.ply">tile</a>');
      }
      return missingResponse();
    });

    const result = await discoverDirectoryListingSplatPaths('https://example.com/dataset', { fetchImpl });

    // The stored path must be DECODED ('#', not '%23'); callers re-encode once via
    // encodeUrlPath, so a decoded path yields the correct single-encoded fetch URL.
    expect(result).toEqual([{ path: '5x5#-5.ply', size: 10 }]);
  });

  it('F8: keeps a directory-listing splat when HEAD is rejected (405)', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'HEAD') {
        return new Response(null, { status: 405, statusText: 'Method Not Allowed' });
      }
      if (url === 'https://example.com/dataset/') {
        return textResponse('<a href="a.spz">a</a>');
      }
      return missingResponse();
    });

    const result = await discoverDirectoryListingSplatPaths('https://example.com/dataset', { fetchImpl });

    expect(result).toEqual([{ path: 'a.spz', size: 0 }]);
  });

  it('F16: derives the masks directory as a sibling of the images directory', () => {
    expect(deriveMasksPathFromImages('corrected/images')).toBe('corrected/masks');
    expect(deriveMasksPathFromImages('corrected/images/')).toBe('corrected/masks');
    expect(deriveMasksPathFromImages('images')).toBe('masks');
    expect(deriveMasksPathFromImages('a/b/Images')).toBe('a/b/masks');
  });

  it('F16: returns null for paths that do not end in an images segment', () => {
    expect(deriveMasksPathFromImages('corrected/frames')).toBeNull();
    expect(deriveMasksPathFromImages('data')).toBeNull();
  });
});

describe('initial-load byte counting for COLMAP files', () => {
  function streamingBinResponse(size: number): Response {
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent >= size) {
          controller.close();
          return;
        }
        const chunk = Math.min(4096, size - sent);
        controller.enqueue(new Uint8Array(chunk));
        sent += chunk;
      },
    });
    return new Response(body, { status: 200, headers: { 'content-length': String(size) } });
  }

  it('aggregates bytesLoaded/bytesTotal across the parallel required downloads', async () => {
    const setUrlProgress = vi.fn();
    const sizes: Record<string, number> = {
      'custom/cameras.bin': 4096,
      'custom/images.bin': 40_000,
      'custom/points3D.bin': 200_000,
    };
    // Real fetchFile (no deps.fetchFile) so it streams via fetchManifestFile.
    const fetchImpl = vi.fn(async (url: string) => {
      for (const [path, size] of Object.entries(sizes)) {
        if (url.endsWith(path)) return streamingBinResponse(size);
      }
      return missingResponse(); // discovery / optional rigs+frames -> nothing
    });

    await fetchManifestColmapFiles(manifest, { fetchImpl, setUrlProgress });

    const byteCalls = setUrlProgress.mock.calls
      .map(([p]) => p)
      .filter((p) => p && p.bytesTotal !== undefined);

    const expectedTotal = 4096 + 40_000 + 200_000;
    expect(byteCalls.length).toBeGreaterThan(0);
    // Every reported total is the full sum (only surfaced once all sizes known).
    expect(byteCalls.every((p) => p.bytesTotal === expectedTotal)).toBe(true);
    // Loaded climbs monotonically and ends fully downloaded.
    const loaded = byteCalls.map((p) => p.bytesLoaded as number);
    expect(loaded).toEqual([...loaded].sort((a, b) => a - b));
    expect(Math.max(...loaded)).toBe(expectedTotal);
  });

  it('falls back to file-count progress (no bytes) when a size is unknown', async () => {
    const setUrlProgress = vi.fn();
    const fetchImpl = vi.fn(async (url: string) => {
      // points3D has no Content-Length -> bytes cannot be aggregated reliably.
      if (url.endsWith('points3D.bin')) {
        return new Response(new ReadableStream<Uint8Array>({ start: (c) => c.close() }), { status: 200 });
      }
      if (url.endsWith('cameras.bin') || url.endsWith('images.bin')) {
        return streamingBinResponse(1000);
      }
      return missingResponse();
    });

    await fetchManifestColmapFiles(manifest, { fetchImpl, setUrlProgress });

    const anyBytes = setUrlProgress.mock.calls.some(([p]) => p && p.bytesTotal !== undefined);
    expect(anyBytes).toBe(false);
  });

  it('aggregates bytes across the eager manifest-splat downloads', async () => {
    const setUrlProgress = vi.fn();
    const splatSizes: Record<string, number> = {
      'splats/a.ply': 50_000,
      'splats/b.ply': 120_000,
    };
    const fetchImpl = vi.fn(async (url: string) => {
      for (const [path, size] of Object.entries(splatSizes)) {
        if (url.endsWith(path)) return streamingBinResponse(size);
      }
      if (url.endsWith('.bin')) return streamingBinResponse(1000); // required + rigs/frames
      return missingResponse();
    });

    await fetchManifestColmapFiles(
      { ...manifest, splats: ['splats/a.ply', 'splats/b.ply'] },
      { fetchImpl, setUrlProgress }
    );

    const splatByteCalls = setUrlProgress.mock.calls
      .map(([p]) => p)
      .filter((p) => p && p.message === 'Downloading splat files...' && p.bytesTotal !== undefined);

    const expectedTotal = 50_000 + 120_000;
    expect(splatByteCalls.length).toBeGreaterThan(0);
    expect(splatByteCalls.every((p) => p.bytesTotal === expectedTotal)).toBe(true);
    expect(Math.max(...splatByteCalls.map((p) => p.bytesLoaded as number))).toBe(expectedTotal);
  });
});
