import { describe, expect, it } from 'vitest';
import type { ColmapManifest } from '../types/manifest';
import {
  createDefaultManifest,
  getArchiveUrlDetectedLogMessage,
  getDefaultUrlManifestLogMessage,
  getDirectoryListingLinks,
  getDirectoryListingRootUrl,
  getHuggingFaceDatasetTreeRequest,
  getInlineManifestLoadLogMessage,
  getPreferredHuggingFaceSplatPath,
  getManifestColmapFileEntries,
  getManifestLoadedLogMessage,
  getManifestLoadSourceInfo,
  getManifestLazySourceBases,
  getRelativeHuggingFaceTreePath,
  getUrlNormalizationLogMessage,
  joinManifestUrlPath,
  normalizeLoadUrl,
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
      url: 'https://example.com/dataset/folder%20name/model%23a.ply',
      relativePath: 'folder%20name/model%23a.ply',
      isDirectory: false,
      isSplat: true,
    });
  });

  it('recursively chooses the preferred splat path from Hugging Face tree entries relative to the loaded dataset', () => {
    const treePath = 'objects/scan';

    expect(getRelativeHuggingFaceTreePath('objects/scan/splats/surface_gaussians.ply', treePath))
      .toBe('splats/surface_gaussians.ply');
    expect(getRelativeHuggingFaceTreePath('objects/other/surface_gaussians.ply', treePath))
      .toBeNull();

    expect(getPreferredHuggingFaceSplatPath([
      { type: 'directory', path: 'objects/scan/splats', size: 0 },
      { type: 'file', path: 'objects/scan/inside_gaussians.ply', size: 100 },
      { type: 'file', path: 'objects/scan/output/surface_gaussians.ply', size: 250 },
      { type: 'file', path: 'objects/scan/3dgs/surface_gaussians.ply', size: 500 },
      { type: 'file', path: 'objects/scan/folder/folder/folder/deep_gaussians.ply', size: 750 },
      { type: 'file', path: 'objects/scan/compressed/surface_gaussians.spz', size: 25 },
      { type: 'file', path: 'objects/scan/compressed/larger.spz', size: 50 },
      { type: 'file', path: 'objects/scan/points3D.bin', size: 500 },
      { type: 'file', path: 'objects/other/larger.ply', size: 1000 },
    ], treePath)).toEqual({
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
