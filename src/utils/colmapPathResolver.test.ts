import { describe, it, expect } from 'vitest';
import { resolveColmapPaths, getColmapDirectoryScore, resolveImagesDir, nativeSceneRoot, nativePhotoVariantMatchesModel } from './colmapPathResolver';

describe('native scene ownership',()=>{
  it.each(['colmap_workspace','colmap_workspace/sparse/0','colmap_workspace/sparse_native','colmap_workspace/sparse_seed',
    'dslr_calibration_jpg', 'dslr_calibration_undistorted', 'dslr_calibration_jpg/sparse/0'])(
    'retains the scene prefix above workspace model %s',container=>{
      expect(nativeSceneRoot('captures/scene A #1/'+container)).toBe('captures/scene A #1');
    });
  it.each(['colmap_workspace_capture','sparse_native_capture','dslr_calibration_custom','dslr_calibration_jpg_capture','calibration'])('preserves an arbitrary named scene %s',scene=>{
    expect(nativeSceneRoot('captures/'+scene)).toBe('captures/'+scene);
  });
});

describe('ETH3D photo representations', () => {
  it.each(['jpg', 'undistorted'])('excludes the other representation from %s photo discovery', variant => {
    const modelDir = `scene/dslr_calibration_${variant}/sparse/0`;
    const photoDir = variant === 'jpg' ? 'dslr_images' : 'dslr_images_undistorted';
    const otherDir = variant === 'jpg' ? 'dslr_images_undistorted' : 'dslr_images';
    const photo = `scene/images/${photoDir}/A.JPG`, other = `scene/images/${otherDir}/A.JPG`;
    expect(nativePhotoVariantMatchesModel(photo, modelDir)).toBe(true);
    expect(nativePhotoVariantMatchesModel(other.replace(/\//g, '\\'), modelDir)).toBe(false);
    expect(resolveImagesDir([photo, other], { modelDir })).toBe('scene/images');
    expect(resolveImagesDir([other], { modelDir })).toBeNull();
    expect(nativePhotoVariantMatchesModel(other, 'scene/sparse/0')).toBe(true);
    expect(nativeSceneRoot(`dslr_calibration_${variant}`)).toBe('');
    const outer = `dslr_calibration_${variant === 'jpg' ? 'undistorted' : 'jpg'}/capture`;
    expect(nativePhotoVariantMatchesModel(`${outer}/${photo}`, `${outer}/${modelDir}`)).toBe(true);
    expect(nativePhotoVariantMatchesModel(`${outer}/${other}`, `${outer}/${modelDir}`)).toBe(false);
  });
});

describe('resolveColmapPaths', () => {
  it('chooses a triangulated reconstruction over its empty known-pose seed and text copy', () => {
    const paths = ['known_pose_model', 'triangulated_text', 'triangulated_model'].flatMap(dir =>
      ['cameras', 'images', 'points3D'].map(name => `preprocessing/colmap/scene/${dir}/${name}.${dir === 'triangulated_model' ? 'bin' : 'txt'}`));
    expect(resolveColmapPaths(paths)?.dir).toBe('preprocessing/colmap/scene/triangulated_model');
    expect(resolveColmapPaths(paths.filter(path => !path.includes('/triangulated_model/')))?.dir).toBe('preprocessing/colmap/scene/triangulated_text');
    expect(resolveColmapPaths(paths.filter(path => path.includes('/known_pose_model/')))?.dir).toBe('preprocessing/colmap/scene/known_pose_model');
    expect(nativeSceneRoot('preprocessing/colmap/scene/triangulated_model')).toBe('preprocessing/colmap/scene');
    const incomplete = paths.filter(path => !path.endsWith('/triangulated_model/images.bin'));
    expect(resolveColmapPaths(incomplete)?.dir).toBe('preprocessing/colmap/scene/triangulated_text');
    expect(resolveColmapPaths([...paths, ...['cameras', 'images', 'points3D'].map(name => `native/sparse/0/${name}.bin`)])?.dir).toBe('native/sparse/0');
  });
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

  it('captures optional rigs and frames files and ignores a database.db', () => {
    const sel = resolveColmapPaths([
      'sparse/0/cameras.bin',
      'sparse/0/images.bin',
      'sparse/0/points3D.bin',
      'sparse/0/database.db',
      'sparse/0/rigs.bin',
      'sparse/0/frames.bin',
    ]);
    // The ignore is the point (0e96d19 removed the role): no field of the
    // selection may resolve to the .db path.
    expect(Object.values(sel ?? {})).not.toContain('sparse/0/database.db');
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
  it('does not treat Waymo sky, actor or dynamic masks as missing RGB photographs', () => {
    const paths = ['masks', 'sky_masks', 'actor_masks', 'dynamic_masks'].map(dir => `preprocessing/${dir}/scene/FRONT/000000.png`);
    expect(resolveImagesDir(paths, { modelDir: 'preprocessing/colmap/scene/triangulated_model' })).toBeNull();
  });
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
