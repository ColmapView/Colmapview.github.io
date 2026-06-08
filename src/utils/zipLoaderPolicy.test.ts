import { describe, expect, it } from 'vitest';
import {
  buildArchiveEntryPath,
  findLargestArchivePlyCandidate,
  findPreferredArchiveSplatCandidate,
  getArchiveImageLookupKeys,
  getColmapArchiveKey,
  getZipEntryLookupCandidates,
  hasArchiveExtension,
  hasRequiredColmapArchiveFiles,
  isArchiveColmapPath,
  isArchiveImagePath,
  isArchiveMimeType,
  isArchivePlyPath,
  isArchiveSplatPath,
  sortArchiveSplatCandidatesByPreference,
} from './zipLoaderPolicy';

describe('zip loader policy', () => {
  it('detects supported archive extensions and MIME types', () => {
    expect(hasArchiveExtension('dataset.tar.gz')).toBe(true);
    expect(hasArchiveExtension('/path/DATASET.7Z')).toBe(true);
    expect(hasArchiveExtension('manifest.json')).toBe(false);
    expect(isArchiveMimeType('application/zip')).toBe(true);
    expect(isArchiveMimeType('application/json')).toBe(false);
  });

  it('classifies archive image and COLMAP paths by filename', () => {
    expect(isArchiveImagePath('project/images/cam1/PHOTO.JPG')).toBe(true);
    expect(isArchiveImagePath('project/sparse/0/images.bin')).toBe(false);
    expect(isArchiveColmapPath('project/sparse/0/points3D.bin')).toBe(true);
    expect(isArchiveColmapPath('project/images/photo.jpg')).toBe(false);
    expect(isArchivePlyPath('project/splats/scene.PLY')).toBe(true);
    expect(isArchivePlyPath('project/sparse/0/points3D.bin')).toBe(false);
    expect(isArchiveSplatPath('project/splats/scene.SPZ')).toBe(true);
    expect(isArchiveSplatPath('project/splats/scene.PLY')).toBe(true);
    expect(isArchiveSplatPath('project/sparse/0/points3D.bin')).toBe(false);
  });

  it('chooses the largest PLY candidate across root and nested archive folders', () => {
    expect(findLargestArchivePlyCandidate([
      { path: 'root_gaussians.ply', size: 10 },
      { path: 'output/surface_gaussians.ply', size: 100 },
      { path: '3dgs/model.ply', size: 200 },
      { path: 'folder/folder/folder/deep_gaussians.ply', size: 300 },
      { path: 'sparse/0/points3D.bin', size: 1000 },
    ])).toEqual({
      path: 'folder/folder/folder/deep_gaussians.ply',
      size: 300,
    });
  });

  it('chooses the largest SPZ candidate before falling back to PLY', () => {
    expect(findPreferredArchiveSplatCandidate([
      { path: 'root_gaussians.ply', size: 1_000 },
      { path: 'output/surface_gaussians.spz', size: 100 },
      { path: '3dgs/model.spz', size: 200 },
      { path: 'sparse/0/points3D.bin', size: 10_000 },
    ])).toEqual({
      path: '3dgs/model.spz',
      size: 200,
    });

    expect(findPreferredArchiveSplatCandidate([
      { path: 'root_gaussians.ply', size: 1_000 },
      { path: 'output/surface_gaussians.spz', size: 100 },
      { path: '3dgs/model.spz', size: 200 },
      { path: 'sparse/0/points3D.bin', size: 10_000 },
    ])).toEqual({
      path: '3dgs/model.spz',
      size: 200,
    });

    expect(findPreferredArchiveSplatCandidate([
      { path: 'root_gaussians.ply', size: 10 },
      { path: '3dgs/model.ply', size: 200 },
    ])).toEqual({
      path: '3dgs/model.ply',
      size: 200,
    });

    expect(sortArchiveSplatCandidatesByPreference([
      { path: 'root_gaussians.ply', size: 1_000 },
      { path: 'output/surface_gaussians.spz', size: 100 },
      { path: '3dgs/model.spz', size: 200 },
      { path: '3dgs/model.ply', size: 2_000 },
      { path: 'sparse/0/points3D.bin', size: 10_000 },
    ])).toEqual([
      { path: '3dgs/model.spz', size: 200 },
      { path: 'output/surface_gaussians.spz', size: 100 },
      { path: '3dgs/model.ply', size: 2_000 },
      { path: 'root_gaussians.ply', size: 1_000 },
    ]);
  });

  it('builds stable archive entry paths and image lookup keys', () => {
    expect(buildArchiveEntryPath(undefined, 'cameras.bin')).toBe('cameras.bin');
    expect(buildArchiveEntryPath('project/sparse/0', 'images.bin')).toBe('project/sparse/0/images.bin');
    expect(buildArchiveEntryPath('project/images/', 'photo.jpg')).toBe('project/images/photo.jpg');

    expect(getArchiveImageLookupKeys('project/images/photo.jpg')).toEqual([
      'project/images/photo.jpg',
      'images/photo.jpg',
      'photo.jpg',
    ]);
    expect(getArchiveImageLookupKeys('project/images/cam1/photo.jpg')).toEqual([
      'project/images/cam1/photo.jpg',
      'images/cam1/photo.jpg',
      'cam1/photo.jpg',
      'photo.jpg',
    ]);
    expect(getArchiveImageLookupKeys('photo.jpg')).toEqual(['photo.jpg']);
  });

  it('keeps archive auxiliary images out of plain image lookup aliases', () => {
    expect(getArchiveImageLookupKeys('project/masks/photo.jpg')).toEqual([
      'project/masks/photo.jpg',
      'masks/photo.jpg',
    ]);
    expect(getArchiveImageLookupKeys('project/masks/cam1/photo.jpg')).toEqual([
      'project/masks/cam1/photo.jpg',
      'masks/cam1/photo.jpg',
    ]);
    expect(getArchiveImageLookupKeys('project/depth/cam1/photo.jpg')).toEqual([
      'project/depth/cam1/photo.jpg',
      'depth/cam1/photo.jpg',
    ]);
    expect(getArchiveImageLookupKeys('project/segmentation/photo.jpg')).toEqual([
      'project/segmentation/photo.jpg',
      'segmentation/photo.jpg',
    ]);
    expect(getArchiveImageLookupKeys('project/images_4/depth/photo.jpg')).toEqual([
      'project/images_4/depth/photo.jpg',
      'images_4/depth/photo.jpg',
      'depth/photo.jpg',
      'photo.jpg',
    ]);
  });

  it('normalizes COLMAP archive keys to sparse directories', () => {
    expect(getColmapArchiveKey('project/sparse/1/cameras.bin')).toBe('sparse/1/cameras.bin');
    expect(getColmapArchiveKey('cameras.bin')).toBe('sparse/0/cameras.bin');
    expect(getColmapArchiveKey('project/model/cameras.txt')).toBe('sparse/0/cameras.txt');
  });

  it('checks required COLMAP archive files case-insensitively by filename', () => {
    expect(hasRequiredColmapArchiveFiles([
      'sparse/0/cameras.bin',
      'sparse/0/images.txt',
      'sparse/0/points3D.bin',
    ])).toBe(true);
    expect(hasRequiredColmapArchiveFiles([
      'sparse/0/cameras.bin',
      'sparse/0/images.txt',
    ])).toBe(false);
  });

  it('builds ZIP entry lookup candidates for normalized, filename, and prefixed paths', () => {
    expect(getZipEntryLookupCandidates('cam1\\photo.jpg')).toEqual([
      'cam1/photo.jpg',
      'photo.jpg',
      'images/cam1/photo.jpg',
      'sparse/0/cam1/photo.jpg',
    ]);
    expect(getZipEntryLookupCandidates('photo.jpg')).toEqual([
      'photo.jpg',
      'images/photo.jpg',
      'sparse/0/photo.jpg',
    ]);
  });
});
