import { describe, expect, it } from 'vitest';
import type { ColmapManifest } from '../types/manifest';
import {
  resolveSplatBackend,
  type SplatBackendPreference,
  type WebGpuSplatBackendState,
} from '../utils/splatBackendPolicy';
import {
  canUseByteLessSplatLoader,
  createDefaultManifest,
  getArchiveUrlDetectedLogMessage,
  getDefaultUrlManifestLogMessage,
  getDirectoryListingLinks,
  getDirectoryListingRootUrl,
  getEstimatedSplatCount,
  getHuggingFaceColmapTotalBytes,
  getHuggingFaceSplatPaths,
  getHuggingFaceDatasetTreeRequest,
  getInlineManifestLoadLogMessage,
  getLargeColmapDatasetWarning,
  getPreferredHuggingFaceSplatPath,
  getManifestColmapFileEntries,
  getManifestLoadedLogMessage,
  getManifestLoadSourceInfo,
  getManifestLazySourceBases,
  getRelativeHuggingFaceTreePath,
  getSplatAutoLoadDecision,
  getSplatDeviceTier,
  getUrlNormalizationLogMessage,
  joinManifestUrlPath,
  normalizeLoadUrl,
  SPLAT_AUTO_LOAD_MAX_BYTES,
  SPLAT_AUTO_LOAD_MAX_BYTES_TOUCH,
  TOUCH_SPLAT_BYTELESS_RETENTION_MIN_BYTES,
  TOUCH_SPLAT_DISABLE_MIN_SPLATS,
  TOUCH_SPLAT_DISABLE_MIN_SPLATS_BYTELESS,
} from './urlLoaderPolicy';

const manifest: ColmapManifest = {
  version: 1,
  baseUrl: 'https://example.com/dataset',
  files: {
    cameras: 'custom/cameras.bin',
    images: 'custom/images.bin',
    points3D: 'custom/points3D.bin',
    rigs: 'custom/rigs.bin',
    frames: 'custom/frames.bin',
  },
  splats: ['splats/small.ply', 'splats/large.ply'],
};

describe('url loader policy helpers', () => {
  it('creates a default manifest for standard COLMAP URL layouts', () => {
    expect(createDefaultManifest('https://example.com/reconstruction/')).toEqual({
      version: 1,
      baseUrl: 'https://example.com/reconstruction',
      files: {
        cameras: 'sparse/0/cameras.bin',
        images: 'sparse/0/images.bin',
        points3D: 'sparse/0/points3D.bin',
        rigs: 'sparse/0/rigs.bin',
        frames: 'sparse/0/frames.bin',
      },
      imagesPath: 'images/',
      masksPath: 'masks/',
    });
  });

  it('builds Hugging Face tree API requests from direct resolve dataset URLs', () => {
    expect(getHuggingFaceDatasetTreeRequest(
      'https://huggingface.co/datasets/OpsiClear/NGS/resolve/main/objects/scan_20250714_170841_lady_bug_toy/'
    )).toEqual({
      apiUrl: 'https://huggingface.co/api/datasets/OpsiClear/NGS/tree/main/objects/scan_20250714_170841_lady_bug_toy?recursive=true',
      treePath: 'objects/scan_20250714_170841_lady_bug_toy',
    });

    expect(getHuggingFaceDatasetTreeRequest('https://example.com/dataset')).toBeNull();
  });

  it('extracts same-dataset directory and splat links from generic directory listings', () => {
    expect(getDirectoryListingRootUrl('https://example.com/dataset')).toBe('https://example.com/dataset/');

    expect(getDirectoryListingLinks(
      'https://example.com/dataset/',
      'https://example.com/dataset',
      `
        <a href="../">parent</a>
        <a href="notes.txt">notes</a>
        <a href="surface_gaussians.ply">root splat</a>
        <a href="surface_gaussians.spz">compressed splat</a>
        <a href="output/">output</a>
        <a href="3dgs/">3dgs</a>
        <a href="folder/folder/folder/">deep</a>
        <a href="images/frame.jpg">image</a>
        <a href="https://other.example.com/dataset/model.ply">external</a>
      `
    )).toEqual([
      {
        url: 'https://example.com/dataset/surface_gaussians.ply',
        relativePath: 'surface_gaussians.ply',
        isDirectory: false,
        isSplat: true,
      },
      {
        url: 'https://example.com/dataset/surface_gaussians.spz',
        relativePath: 'surface_gaussians.spz',
        isDirectory: false,
        isSplat: true,
      },
      {
        url: 'https://example.com/dataset/output/',
        relativePath: 'output',
        isDirectory: true,
        isSplat: false,
      },
      {
        url: 'https://example.com/dataset/3dgs/',
        relativePath: '3dgs',
        isDirectory: true,
        isSplat: false,
      },
      {
        url: 'https://example.com/dataset/folder/folder/folder/',
        relativePath: 'folder/folder/folder',
        isDirectory: true,
        isSplat: false,
      },
    ]);

    expect(getDirectoryListingLinks(
      'https://example.com/dataset/',
      'https://example.com/dataset',
      '<a href="folder%20name/model%23a.ply">encoded</a>'
    )[0]).toEqual({
      // url stays percent-encoded (used directly to fetch); relativePath is decoded
      // so downstream encodeUrlPath re-encodes it exactly once instead of
      // double-encoding (%2520 / %2523) and 404-ing.
      url: 'https://example.com/dataset/folder%20name/model%23a.ply',
      relativePath: 'folder name/model#a.ply',
      isDirectory: false,
      isSplat: true,
    });
  });

  it('recursively lists splat paths from Hugging Face tree entries relative to the loaded dataset', () => {
    const treePath = 'objects/scan';
    const entries = [
      { type: 'directory', path: 'objects/scan/splats', size: 0 },
      { type: 'file', path: 'objects/scan/inside_gaussians.ply', size: 100 },
      { type: 'file', path: 'objects/scan/output/surface_gaussians.ply', size: 250 },
      { type: 'file', path: 'objects/scan/3dgs/surface_gaussians.ply', size: 500 },
      { type: 'file', path: 'objects/scan/folder/folder/folder/deep_gaussians.ply', size: 750 },
      { type: 'file', path: 'objects/scan/compressed/surface_gaussians.spz', size: 25 },
      { type: 'file', path: 'objects/scan/compressed/larger.spz', size: 50 },
      { type: 'file', path: 'objects/scan/points3D.bin', size: 500 },
      { type: 'file', path: 'objects/other/larger.ply', size: 1000 },
    ];

    expect(getRelativeHuggingFaceTreePath('objects/scan/splats/surface_gaussians.ply', treePath))
      .toBe('splats/surface_gaussians.ply');
    expect(getRelativeHuggingFaceTreePath('objects/other/surface_gaussians.ply', treePath))
      .toBeNull();

    expect(getHuggingFaceSplatPaths(entries, treePath)).toEqual([
      { path: 'compressed/larger.spz', size: 50 },
      { path: 'compressed/surface_gaussians.spz', size: 25 },
      { path: 'folder/folder/folder/deep_gaussians.ply', size: 750 },
      { path: '3dgs/surface_gaussians.ply', size: 500 },
      { path: 'output/surface_gaussians.ply', size: 250 },
      { path: 'inside_gaussians.ply', size: 100 },
    ]);
    expect(getPreferredHuggingFaceSplatPath(entries, treePath)).toEqual({
      path: 'compressed/larger.spz',
      size: 50,
    });
  });

  it('joins manifest-relative URL paths while preserving existing slash behavior', () => {
    expect(joinManifestUrlPath('https://example.com/base', 'sparse/0/images.bin'))
      .toBe('https://example.com/base/sparse/0/images.bin');
    expect(joinManifestUrlPath('https://example.com/base/', 'sparse/0/images.bin'))
      .toBe('https://example.com/base/sparse/0/images.bin');
  });

  it('builds required and optional COLMAP file entries from manifests', () => {
    expect(getManifestColmapFileEntries(manifest)).toEqual({
      requiredFiles: [
        { key: 'sparse/0/cameras.bin', path: 'custom/cameras.bin' },
        { key: 'sparse/0/images.bin', path: 'custom/images.bin' },
        { key: 'sparse/0/points3D.bin', path: 'custom/points3D.bin' },
      ],
      optionalFiles: [
        { key: 'sparse/0/rigs.bin', path: 'custom/rigs.bin' },
        { key: 'sparse/0/frames.bin', path: 'custom/frames.bin' },
        { key: 'splats/small.ply', path: 'splats/small.ply' },
        { key: 'splats/large.ply', path: 'splats/large.ply' },
      ],
    });
  });

  it('omits missing optional rig/frame entries', () => {
    const entries = getManifestColmapFileEntries({
      ...manifest,
      files: {
        cameras: 'cameras.bin',
        images: 'images.bin',
        points3D: 'points3D.bin',
      },
      splats: undefined,
    });

    expect(entries.optionalFiles).toEqual([]);
  });

  it('builds lazy image and mask URL bases from defaults or explicit manifest paths', () => {
    expect(getManifestLazySourceBases(manifest)).toEqual({
      imageUrlBase: 'https://example.com/dataset/images/',
      maskUrlBase: 'https://example.com/dataset/masks/',
    });

    expect(getManifestLazySourceBases({
      ...manifest,
      baseUrl: 'https://example.com/dataset/',
      imagesPath: 'rgb/',
      masksPath: 'segmentation/',
    })).toEqual({
      imageUrlBase: 'https://example.com/dataset/rgb/',
      maskUrlBase: 'https://example.com/dataset/segmentation/',
    });
  });

  it('builds per-image URLs from a mapping, encoding each path exactly once', () => {
    const bases = getManifestLazySourceBases({
      ...manifest,
      baseUrl: 'https://example.com/dataset',
      imageNameToPath: {
        '0.jpg': 'raw/10.07.25 LHS/G0019585.JPG',
        '1.jpg': 'raw/10.07.25 RHS/G0019586.JPG',
      },
    });
    expect(bases.imageNameToUrl).toEqual({
      '0.jpg': 'https://example.com/dataset/raw/10.07.25%20LHS/G0019585.JPG',
      '1.jpg': 'https://example.com/dataset/raw/10.07.25%20RHS/G0019586.JPG',
    });
    // Space encoded exactly once (%20), never double-encoded to %2520.
    expect(bases.imageNameToUrl?.['0.jpg']).not.toContain('%2520');
  });

  it('omits imageNameToUrl when the manifest has no mapping', () => {
    expect(getManifestLazySourceBases(manifest).imageNameToUrl).toBeUndefined();
  });

  it('threads imageNameToUrl through manifest load source info', () => {
    const info = getManifestLoadSourceInfo(
      { ...manifest, imageNameToPath: { '0.jpg': 'raw/a b/c.jpg' } },
      { type: 'url' }
    );
    expect(info.imageNameToUrl).toEqual({
      '0.jpg': 'https://example.com/dataset/raw/a%20b/c.jpg',
    });
  });

  it('plans source info for manifest URL loads', () => {
    expect(getManifestLoadSourceInfo(manifest, {
      type: 'url',
      sourceUrl: 'https://example.com/manifest.json',
    })).toEqual({
      sourceType: 'url',
      sourceUrl: 'https://example.com/manifest.json',
      sourceManifest: null,
      imageUrlBase: 'https://example.com/dataset/images/',
      maskUrlBase: 'https://example.com/dataset/masks/',
      successLabel: 'URL',
    });

    expect(getManifestLoadSourceInfo(manifest, { type: 'url' }).sourceUrl)
      .toBe('https://example.com/dataset');
  });

  it('plans source info for inline manifest loads', () => {
    expect(getManifestLoadSourceInfo(manifest, { type: 'manifest' })).toEqual({
      sourceType: 'manifest',
      sourceUrl: null,
      sourceManifest: manifest,
      imageUrlBase: 'https://example.com/dataset/images/',
      maskUrlBase: 'https://example.com/dataset/masks/',
      successLabel: 'manifest',
    });
  });

  it('normalizes cloud and Git hosted load URLs in order', () => {
    expect(normalizeLoadUrl('s3://my-bucket/path/to/reconstruction.zip')).toEqual({
      url: 'https://my-bucket.s3.amazonaws.com/path/to/reconstruction.zip',
      steps: [{
        kind: 'cloud',
        from: 's3://my-bucket/path/to/reconstruction.zip',
        to: 'https://my-bucket.s3.amazonaws.com/path/to/reconstruction.zip',
      }],
    });

    expect(normalizeLoadUrl('https://github.com/user/repo/blob/main/data/manifest.json')).toEqual({
      url: 'https://raw.githubusercontent.com/user/repo/main/data/manifest.json',
      steps: [{
        kind: 'git',
        from: 'https://github.com/user/repo/blob/main/data/manifest.json',
        to: 'https://raw.githubusercontent.com/user/repo/main/data/manifest.json',
      }],
    });
  });

  it('leaves already-direct URLs unchanged', () => {
    expect(normalizeLoadUrl('https://example.com/data/manifest.json')).toEqual({
      url: 'https://example.com/data/manifest.json',
      steps: [],
    });
  });

  it('formats URL loader log messages from typed inputs', () => {
    expect(getUrlNormalizationLogMessage({
      kind: 'cloud',
      from: 's3://bucket/path',
      to: 'https://bucket.s3.amazonaws.com/path',
    })).toBe(
      '[URL Loader] Normalized cloud URL: s3://bucket/path -> https://bucket.s3.amazonaws.com/path'
    );
    expect(getUrlNormalizationLogMessage({
      kind: 'git',
      from: 'https://github.com/user/repo/blob/main/data',
      to: 'https://raw.githubusercontent.com/user/repo/main/data',
    })).toBe(
      '[URL Loader] Normalized Git URL: https://github.com/user/repo/blob/main/data -> https://raw.githubusercontent.com/user/repo/main/data'
    );
    expect(getArchiveUrlDetectedLogMessage('https://example.com/data.zip'))
      .toBe('[URL Loader] Detected archive URL: https://example.com/data.zip');
    expect(getManifestLoadedLogMessage(manifest))
      .toBe('[URL Loader] Loaded manifest: unnamed');
    expect(getDefaultUrlManifestLogMessage('https://example.com/data'))
      .toBe('[URL Loader] Using direct URL with default paths: https://example.com/data');
    expect(getInlineManifestLoadLogMessage({ ...manifest, name: 'Shared' }))
      .toBe('[URL Loader] Loading from manifest: Shared');
  });
});

describe('getSplatAutoLoadDecision', () => {
  it('auto-loads a single candidate within the desktop budget', () => {
    expect(
      getSplatAutoLoadDecision([{ path: 'splats/scene.spz', size: 40_000_000 }], { isTouchDevice: false })
    ).toEqual({
      autoLoad: true,
      budgetBytes: SPLAT_AUTO_LOAD_MAX_BYTES,
      oversizedCandidate: null,
    });
  });

  it('declines a single candidate above the desktop budget and reports it as oversized', () => {
    const candidate = { path: 'splats/bigsur_v2.ply', size: 1_040_000_634 };

    expect(getSplatAutoLoadDecision([candidate], { isTouchDevice: false })).toEqual({
      autoLoad: false,
      budgetBytes: SPLAT_AUTO_LOAD_MAX_BYTES,
      oversizedCandidate: candidate,
    });
  });

  it('applies the stricter touch budget on touch devices', () => {
    const candidate = { path: 'splats/scene.spz', size: 60_000_000 };

    expect(getSplatAutoLoadDecision([candidate], { isTouchDevice: false }).autoLoad).toBe(true);
    expect(getSplatAutoLoadDecision([candidate], { isTouchDevice: true })).toEqual({
      autoLoad: false,
      budgetBytes: SPLAT_AUTO_LOAD_MAX_BYTES_TOUCH,
      oversizedCandidate: candidate,
    });
  });

  it('auto-loads a single candidate with unknown size (static hosts may block HEAD)', () => {
    expect(
      getSplatAutoLoadDecision([{ path: 'scene.spz', size: 0 }], { isTouchDevice: true }).autoLoad
    ).toBe(true);
  });

  it('never auto-loads when there is not exactly one candidate', () => {
    const small = { path: 'a.spz', size: 1_000 };
    const alsoSmall = { path: 'b.spz', size: 2_000 };

    expect(getSplatAutoLoadDecision([], { isTouchDevice: false })).toEqual({
      autoLoad: false,
      budgetBytes: SPLAT_AUTO_LOAD_MAX_BYTES,
      oversizedCandidate: null,
    });
    expect(getSplatAutoLoadDecision([small, alsoSmall], { isTouchDevice: false })).toEqual({
      autoLoad: false,
      budgetBytes: SPLAT_AUTO_LOAD_MAX_BYTES,
      oversizedCandidate: null,
    });
  });
});

describe('getSplatDeviceTier', () => {
  it('is always ok on desktop hardware', () => {
    expect(getSplatDeviceTier({ path: 'huge.ply', size: 1_040_000_634, splatCount: 10_000_000 }, { isTouchDevice: false, byteLessLoaderAvailable: false })).toBe('ok');
    // Loader availability is irrelevant off touch hardware.
    expect(getSplatDeviceTier({ path: 'huge.ply', size: 1_040_000_634, splatCount: 10_000_000 }, { isTouchDevice: false, byteLessLoaderAvailable: true })).toBe('ok');
  });

  it('disables on touch when the known splat count exceeds the ceiling', () => {
    expect(getSplatDeviceTier({ path: 'huge.ply', size: 1_040_000_634, splatCount: 10_000_000 }, { isTouchDevice: true, byteLessLoaderAvailable: false })).toBe('disabled');
    expect(getSplatDeviceTier({ path: 'ok.ply', size: 200_000_000, splatCount: 1_900_000 }, { isTouchDevice: true, byteLessLoaderAvailable: false })).toBe('hint');
  });

  it('estimates the count from bytes per format when unknown', () => {
    // 1.04 GB PLY / 104 B -> ~10M -> disabled; 64 MB spz / 16 B = 4M -> disabled
    // under the retaining 3M ceiling; 40 MB spz / 16 B = 2.5M (<= ceiling) and
    // 40 MB <= 50 MB budget -> ok.
    expect(getEstimatedSplatCount({ path: 'huge.ply', size: 1_040_000_634 })).toBe(10_000_006);
    expect(getSplatDeviceTier({ path: 'huge.ply', size: 1_040_000_634 }, { isTouchDevice: true, byteLessLoaderAvailable: false })).toBe('disabled');
    expect(getSplatDeviceTier({ path: 'dense.spz', size: 64_000_000 }, { isTouchDevice: true, byteLessLoaderAvailable: false })).toBe('disabled');
    expect(getSplatDeviceTier({ path: 'tiles.spz', size: 40_000_000 }, { isTouchDevice: true, byteLessLoaderAvailable: false })).toBe('ok');
    expect(getSplatDeviceTier({ path: 'mid.spz', size: 55_000_000, splatCount: 2_000_000 }, { isTouchDevice: true, byteLessLoaderAvailable: false })).toBe('hint');
  });

  it('never disables on an unknown estimate', () => {
    expect(getSplatDeviceTier({ path: 'mystery.ply', size: 0 }, { isTouchDevice: true, byteLessLoaderAvailable: false })).toBe('ok');
    expect(getSplatDeviceTier({ path: 'mystery.ply' }, { isTouchDevice: true, byteLessLoaderAvailable: false })).toBe('ok');
    expect(getSplatDeviceTier({ path: 'mystery.ply' }, { isTouchDevice: true, byteLessLoaderAvailable: true })).toBe('ok');
  });

  it('raises the ceiling to 4M splats when the byte-less loader is available', () => {
    // 64 MB spz / 16 B = 4M == the raised ceiling (not >) -> no longer disabled;
    // 64 MB > 50 MB touch budget -> hint.
    expect(getSplatDeviceTier({ path: 'dense.spz', size: 64_000_000 }, { isTouchDevice: true, byteLessLoaderAvailable: true })).toBe('hint');
    // Explicit 3.5M count: over the retaining 3M ceiling, within the byte-less 4M one.
    const midCount = { path: 'big.ply', size: 364_000_000, splatCount: 3_500_000 };
    expect(getSplatDeviceTier(midCount, { isTouchDevice: true, byteLessLoaderAvailable: false })).toBe('disabled');
    expect(getSplatDeviceTier(midCount, { isTouchDevice: true, byteLessLoaderAvailable: true })).toBe('hint');
    // Still far over even the raised ceiling -> disabled either way.
    expect(getSplatDeviceTier({ path: 'huge.ply', size: 1_040_000_634 }, { isTouchDevice: true, byteLessLoaderAvailable: true })).toBe('disabled');
    // Under both ceilings and under the size budget -> ok.
    expect(getSplatDeviceTier({ path: 'tiles.spz', size: 40_000_000 }, { isTouchDevice: true, byteLessLoaderAvailable: true })).toBe('ok');
  });

  it('defaults to the conservative retaining ceiling when availability is not given', () => {
    expect(getSplatDeviceTier({ path: 'dense.spz', size: 64_000_000 }, { isTouchDevice: true })).toBe('disabled');
  });
});

describe('canUseByteLessSplatLoader', () => {
  it('is available on touch with the WebGPU backend ready', () => {
    expect(canUseByteLessSplatLoader({ isTouchDevice: true, requestedBackend: 'auto', webGpuAvailability: 'ready', sparkBackendAvailable: false })).toBe(true);
    // A WebGPU-ready backend wins over a loaded Spark module, so byte-less stays on.
    expect(canUseByteLessSplatLoader({ isTouchDevice: true, requestedBackend: 'auto', webGpuAvailability: 'ready', sparkBackendAvailable: true })).toBe(true);
  });

  it('is available on fresh first load while WebGPU initializes and Spark is not yet loaded', () => {
    // Adjudicated invariant: 'ready' must NOT be required. The WebGPU canvas only
    // mounts after a splat activates, so at selection time a capable device reports
    // 'unavailable' (preparing), never 'ready'. With Spark not loaded, auto mode
    // resolves to no renderer yet (not Spark), so byte-less is safe.
    expect(canUseByteLessSplatLoader({ isTouchDevice: true, requestedBackend: 'auto', webGpuAvailability: 'unavailable', sparkBackendAvailable: false })).toBe(true);
    expect(canUseByteLessSplatLoader({ isTouchDevice: true, requestedBackend: 'webgpu', webGpuAvailability: 'unavailable', sparkBackendAvailable: false })).toBe(true);
  });

  it('is unavailable in auto mode when Spark is already loaded while WebGPU initializes', () => {
    // The finding: a prior splat rendered via Spark this session leaves the Spark
    // module loaded. In auto mode with WebGPU still 'unavailable', the resolver
    // picks Spark NOW - and the visible Spark renderer streams the placeholder's
    // (zero) bytes directly, so byte-less would render EMPTY. Must be off.
    expect(canUseByteLessSplatLoader({ isTouchDevice: true, requestedBackend: 'auto', webGpuAvailability: 'unavailable', sparkBackendAvailable: true })).toBe(false);
    // Forced WebGPU never resolves to Spark, so a loaded Spark module is irrelevant.
    expect(canUseByteLessSplatLoader({ isTouchDevice: true, requestedBackend: 'webgpu', webGpuAvailability: 'unavailable', sparkBackendAvailable: true })).toBe(true);
  });

  it('is never available on desktop (the retaining path stays)', () => {
    expect(canUseByteLessSplatLoader({ isTouchDevice: false, requestedBackend: 'auto', webGpuAvailability: 'ready', sparkBackendAvailable: false })).toBe(false);
    expect(canUseByteLessSplatLoader({ isTouchDevice: false, requestedBackend: 'webgpu', webGpuAvailability: 'unavailable', sparkBackendAvailable: false })).toBe(false);
  });

  it('is unavailable when the Spark renderer is forced (it streams splatFile bytes)', () => {
    expect(canUseByteLessSplatLoader({ isTouchDevice: true, requestedBackend: 'spark', webGpuAvailability: 'ready', sparkBackendAvailable: true })).toBe(false);
    expect(canUseByteLessSplatLoader({ isTouchDevice: true, requestedBackend: 'spark', webGpuAvailability: 'unavailable', sparkBackendAvailable: false })).toBe(false);
  });

  it('is unavailable in every WebGPU state that resolves to the Spark fallback', () => {
    // 'unsupported' (no navigator.gpu / blocked browser) and 'failed' (renderer
    // init failed) both permanently fall back to Spark, which reads the active
    // splatFile's bytes directly - a byte-less placeholder would render empty.
    // These stay off even before Spark finishes loading (spark not yet available),
    // because they can NEVER seed the WebGPU decode cache byte-less relies on.
    expect(canUseByteLessSplatLoader({ isTouchDevice: true, requestedBackend: 'auto', webGpuAvailability: 'unsupported', sparkBackendAvailable: false })).toBe(false);
    expect(canUseByteLessSplatLoader({ isTouchDevice: true, requestedBackend: 'auto', webGpuAvailability: 'failed', sparkBackendAvailable: false })).toBe(false);
    expect(canUseByteLessSplatLoader({ isTouchDevice: true, requestedBackend: 'webgpu', webGpuAvailability: 'unsupported', sparkBackendAvailable: false })).toBe(false);
    expect(canUseByteLessSplatLoader({ isTouchDevice: true, requestedBackend: 'webgpu', webGpuAvailability: 'failed', sparkBackendAvailable: false })).toBe(false);
  });

  it('never contradicts the real backend resolver: byte-less implies resolution is not Spark', () => {
    // Parity pin against resolveSplatBackend over the FULL input matrix. Byte-less
    // must never be enabled in a state whose current resolution is the Spark
    // renderer (which reads splatFile bytes directly -> empty on a placeholder).
    const touchValues = [true, false] as const;
    const backends: SplatBackendPreference[] = ['auto', 'webgpu', 'spark'];
    const webGpuStates: WebGpuSplatBackendState[] = ['unsupported', 'unavailable', 'ready', 'failed'];
    const sparkValues = [true, false] as const;

    let trueCount = 0;
    let falseCount = 0;
    for (const isTouchDevice of touchValues) {
      for (const requestedBackend of backends) {
        for (const webGpuAvailability of webGpuStates) {
          for (const sparkBackendAvailable of sparkValues) {
            const byteLess = canUseByteLessSplatLoader({
              isTouchDevice,
              requestedBackend,
              webGpuAvailability,
              sparkBackendAvailable,
            });
            if (byteLess) {
              trueCount += 1;
              const resolution = resolveSplatBackend(requestedBackend, {
                webGpu: webGpuAvailability,
                spark: sparkBackendAvailable,
              });
              expect(
                resolution.backend,
                `byte-less enabled but resolver picked Spark for ${JSON.stringify({ isTouchDevice, requestedBackend, webGpuAvailability, sparkBackendAvailable })}`
              ).not.toBe('spark');
            } else {
              falseCount += 1;
            }
          }
        }
      }
    }

    // Guard against a vacuously-always-false predicate passing the implication.
    expect(trueCount).toBeGreaterThan(0);
    expect(falseCount).toBeGreaterThan(0);
  });

  it('falls back to the conservative 3M ceiling when a loaded Spark forces byte-less off', () => {
    // Ceiling coherence: getSplatDeviceTier shares canUseByteLessSplatLoader, so
    // the spark-availability guard must also demote the raised 4M ceiling to 3M.
    const gate = { isTouchDevice: true, requestedBackend: 'auto' as const, webGpuAvailability: 'unavailable' as const };
    const byteLessWithSpark = canUseByteLessSplatLoader({ ...gate, sparkBackendAvailable: true });
    const byteLessWithoutSpark = canUseByteLessSplatLoader({ ...gate, sparkBackendAvailable: false });
    expect(byteLessWithSpark).toBe(false);
    expect(byteLessWithoutSpark).toBe(true);

    // 364 MB / 3.5M splats: over the retaining 3M ceiling, within the byte-less 4M one.
    const midCount = { path: 'big.ply', size: 364_000_000, splatCount: 3_500_000 };
    expect(getSplatDeviceTier(midCount, { isTouchDevice: true, byteLessLoaderAvailable: byteLessWithSpark })).toBe('disabled');
    expect(getSplatDeviceTier(midCount, { isTouchDevice: true, byteLessLoaderAvailable: byteLessWithoutSpark })).toBe('hint');
  });

  it('pins the splat tiering constants', () => {
    expect(TOUCH_SPLAT_DISABLE_MIN_SPLATS).toBe(3_000_000);
    expect(TOUCH_SPLAT_DISABLE_MIN_SPLATS_BYTELESS).toBe(4_000_000);
    expect(TOUCH_SPLAT_BYTELESS_RETENTION_MIN_BYTES).toBe(100_000_000);
  });
});

describe('large COLMAP dataset warning', () => {
  const treePath = 'objects/scan';
  const entries = [
    { type: 'file', path: 'objects/scan/sparse/0/cameras.bin', size: 48 },
    { type: 'file', path: 'objects/scan/sparse/0/images.bin', size: 192_776_427 },
    { type: 'file', path: 'objects/scan/sparse/0/points3D.bin', size: 59_779_977 },
  ];
  const colmap = {
    cameras: 'sparse/0/cameras.bin',
    images: 'sparse/0/images.bin',
    points3D: 'sparse/0/points3D.bin',
  };

  it('sums the discovered COLMAP bin sizes', () => {
    expect(getHuggingFaceColmapTotalBytes(entries, treePath, colmap)).toBe(252_556_452);
  });

  it('returns null when a size is unknown', () => {
    expect(getHuggingFaceColmapTotalBytes(entries.slice(0, 2), treePath, colmap)).toBeNull();
  });

  it('warns on touch devices above the threshold, stays quiet otherwise', () => {
    expect(getLargeColmapDatasetWarning(252_556_452, true)).toBe(
      "Large dataset (253 MB of COLMAP data) - may exceed this device's memory"
    );
    expect(getLargeColmapDatasetWarning(252_556_452, false)).toBeNull();
    expect(getLargeColmapDatasetWarning(100_000_000, true)).toBeNull();
    expect(getLargeColmapDatasetWarning(null, true)).toBeNull();
  });
});
