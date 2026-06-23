import { describe, it, expect } from 'vitest';
import { resolveColmapPaths, getColmapDirectoryScore, resolveImagesDir } from './colmapPathResolver';

describe('resolveColmapPaths', () => {
  it('resolves a colmap/ directory (HuggingFace sweet-corals layout)', () => {
    const sel = resolveColmapPaths([
      'ds/colmap/cameras.bin',
      'ds/colmap/images.bin',
      'ds/colmap/points3D.bin',
      'ds/corrected/images/GPAA0483.jpg',
      'ds/splats/scene.spz',
    ]);
    expect(sel).not.toBeNull();
    expect(sel?.dir).toBe('ds/colmap');
    expect(sel?.cameras).toBe('ds/colmap/cameras.bin');
    expect(sel?.images).toBe('ds/colmap/images.bin');
    expect(sel?.points3D).toBe('ds/colmap/points3D.bin');
  });

  it('prefers sparse/0 over an arbitrary directory', () => {
    const sel = resolveColmapPaths([
      'other/model/cameras.bin',
      'other/model/images.bin',
      'other/model/points3D.bin',
      'project/sparse/0/cameras.bin',
      'project/sparse/0/images.bin',
      'project/sparse/0/points3D.bin',
    ]);
    expect(sel?.dir).toBe('project/sparse/0');
  });

  it('prefers sparse/0 over colmap when both are complete', () => {
    const sel = resolveColmapPaths([
      'ds/colmap/cameras.bin',
      'ds/colmap/images.bin',
      'ds/colmap/points3D.bin',
      'ds/sparse/0/cameras.bin',
      'ds/sparse/0/images.bin',
      'ds/sparse/0/points3D.bin',
    ]);
    expect(sel?.dir).toBe('ds/sparse/0');
  });

  it('prefers .bin over .txt within the same directory', () => {
    const sel = resolveColmapPaths([
      'sparse/0/cameras.txt',
      'sparse/0/cameras.bin',
      'sparse/0/images.txt',
      'sparse/0/points3D.txt',
    ]);
    expect(sel?.cameras).toBe('sparse/0/cameras.bin');
    expect(sel?.images).toBe('sparse/0/images.txt');
    expect(sel?.points3D).toBe('sparse/0/points3D.txt');
  });

  it('captures optional database, rigs and frames files', () => {
    const sel = resolveColmapPaths([
      'sparse/0/cameras.bin',
      'sparse/0/images.bin',
      'sparse/0/points3D.bin',
      'sparse/0/database.db',
      'sparse/0/rigs.bin',
      'sparse/0/frames.bin',
    ]);
    expect(sel?.database).toBe('sparse/0/database.db');
    expect(sel?.rigs).toBe('sparse/0/rigs.bin');
    expect(sel?.frames).toBe('sparse/0/frames.bin');
  });

  it('returns null when points3D is required but absent', () => {
    expect(
      resolveColmapPaths([
        'colmap/cameras.bin',
        'colmap/images.bin',
      ])
    ).toBeNull();
  });

  it('can resolve cameras+images without points3D when not required', () => {
    const sel = resolveColmapPaths(
      ['colmap/cameras.bin', 'colmap/images.bin'],
      { requirePoints3D: false }
    );
    expect(sel?.cameras).toBe('colmap/cameras.bin');
    expect(sel?.images).toBe('colmap/images.bin');
    expect(sel?.points3D).toBeUndefined();
  });

  it('resolves bins at the dataset root (empty parent dir)', () => {
    const sel = resolveColmapPaths(['cameras.bin', 'images.bin', 'points3D.bin']);
    expect(sel?.dir).toBe('');
    expect(sel?.cameras).toBe('cameras.bin');
  });

  it('returns null for a listing with no COLMAP files', () => {
    expect(resolveColmapPaths(['images/a.jpg', 'splats/scene.ply'])).toBeNull();
  });
});

describe('resolveImagesDir', () => {
  it('finds a /images directory that is not at the root (sweet-corals corrected/images)', () => {
    const dir = resolveImagesDir([
      'colmap/cameras.bin',
      'corrected/images/GPAA0483.jpg',
      'corrected/images/GPAA0484.jpg',
      'raw/Q7_Left/x.jpg',
      'raw/Q7_Right/y.jpg',
    ], { modelDir: 'colmap' });
    expect(dir).toBe('corrected/images');
  });

  it('resolves the images root when images are nested in per-camera subdirs', () => {
    // Toy layout: images/cam_N/*.png + masks/cam_N/*.png, bins in sparse/0.
    const dir = resolveImagesDir([
      'sparse/0/cameras.bin',
      'images/cam_1/00.png',
      'images/cam_1/01.png',
      'images/cam_2/00.png',
      'masks/cam_1/00.png',
      'masks/cam_2/00.png',
    ], { modelDir: 'sparse/0' });
    expect(dir).toBe('images');
  });

  it('resolves a nested images root that is not at the root path', () => {
    expect(
      resolveImagesDir(['data/images/cam_1/a.jpg', 'data/images/cam_2/b.jpg'])
    ).toBe('data/images');
  });

  it('prefers an images dir under the model dir (images beside the bins)', () => {
    const dir = resolveImagesDir([
      'ds/colmap/images/a.jpg',
      'ds/colmap/images/b.jpg',
      'far/away/images/c.jpg',
    ], { modelDir: 'ds/colmap' });
    expect(dir).toBe('ds/colmap/images');
  });

  it('resolves a canonical root images/ directory', () => {
    expect(resolveImagesDir(['images/a.jpg', 'images/b.png', 'sparse/0/cameras.bin'])).toBe('images');
  });

  it('falls back to the largest image set when no dir is named images', () => {
    const dir = resolveImagesDir([
      'photos/a.jpg',
      'photos/b.jpg',
      'photos/c.jpg',
      'misc/d.jpg',
    ]);
    expect(dir).toBe('photos');
  });

  it('returns null when there are no image files', () => {
    expect(resolveImagesDir(['colmap/cameras.bin', 'splats/scene.ply'])).toBeNull();
  });
});

describe('getColmapDirectoryScore', () => {
  it('ranks sparse/N best, then sparse, then colmap, then everything else', () => {
    expect(getColmapDirectoryScore('p/sparse/0')).toBeLessThan(getColmapDirectoryScore('p/sparse'));
    expect(getColmapDirectoryScore('p/sparse/2')).toBeLessThan(getColmapDirectoryScore('p/sparse'));
    expect(getColmapDirectoryScore('p/sparse')).toBeLessThan(getColmapDirectoryScore('p/colmap'));
    expect(getColmapDirectoryScore('p/colmap')).toBeLessThan(getColmapDirectoryScore('p/whatever'));
  });
});
