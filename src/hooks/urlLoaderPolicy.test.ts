import { describe, expect, it } from 'vitest';
import type { ColmapManifest } from '../types/manifest';
import {
  createDefaultManifest,
  getArchiveUrlDetectedLogMessage,
  getDefaultUrlManifestLogMessage,
  getDirectoryListingLinks,
  getDirectoryListingRootUrl,
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
  getUrlNormalizationLogMessage,
  joinManifestUrlPath,
  normalizeLoadUrl,
  SPLAT_AUTO_LOAD_MAX_BYTES,
  SPLAT_AUTO_LOAD_MAX_BYTES_TOUCH,
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
