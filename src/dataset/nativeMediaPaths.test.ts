import { describe, expect, it } from 'vitest';
import { nativeSceneRoot, resolveImagesDir } from '../utils/colmapPathResolver';
import { NativeMediaPathIndex } from './nativeMediaPaths';

const model = (root: string) => ['cameras.bin', 'images.bin', 'points3D.bin'].map(name => root ? root + '/' + name : name);
describe('native physical media layouts', () => {
  it('does not turn a bare mapped basename into an auxiliary photo guess', () => {
    const path = 'outer/scene/segmentation/cam/a.png';
    const index = new NativeMediaPathIndex([...model('outer/scene/sparse/0'), path], 'outer/scene/sparse/0');
    expect(index.image('cam/a.jpg', 'a.png').status).toBe('missing');
    expect(index.image('cam/a.jpg', 'segmentation/cam/a.png')).toMatchObject({ status: 'resolved', path });
  });
  it('keeps qualified partial mappings inside known owners while allowing full physical sharing', () => {
    const path = 'poster/segmentation/cam/a.png';
    const index = new NativeMediaPathIndex([...model('dozer/sparse/0'), ...model('poster/sparse/0'), path], 'dozer/sparse/0');
    expect(index.image('cam/a.jpg', 'segmentation/cam/a.png').status).toBe('missing');
    expect(index.image('cam/a.jpg', path)).toMatchObject({ status: 'resolved', path });
  });
  it('keeps case-folded qualified mapping collisions ambiguous', () => {
    const paths = ['outer/scene/segmentation/cam/A.PNG', 'outer/scene/segmentation/cam/a.png'];
    const index = new NativeMediaPathIndex(paths, 'outer/scene/sparse/0');
    expect(index.image('cam/a.jpg', 'segmentation/cam/A.Png')).toMatchObject({ status: 'ambiguous', candidates: paths });
  });

  it('prefers an exact mask filename convention over a folded match for another photo', () => {
    const index = new NativeMediaPathIndex(['images/frame.JPG', 'masks/frame.jpg.png', 'masks/frame.png'], 'sparse/0');
    expect(index.mask('frame.JPG', 'images/frame.JPG')).toMatchObject({ status: 'resolved', path: 'masks/frame.png' });
  });
  it('does not infer validity from a masks folder above a nonstandard mask root', () => {
    const path = 'capture/masks/reference/cam/a.jpg.png';
    const index = new NativeMediaPathIndex([path], 'scene/sparse/0', { role: 'mask' });
    expect(index.mask('cam/a.jpg', 'flat/a.png')).toMatchObject({ status: 'resolved', path, role: 'unknown' });
  });
  it.each(['https://rgb.test/pinned%20data/', 'https://models.test/pinned%20data-other/'])('does not assign source-relative ownership to external base %s', base => {
    const path = base + 'poster/images/cam/a.jpg?token=photo%2Fvalue';
    const index = new NativeMediaPathIndex([path], 'dozer/sparse/0', { role: 'photo', baseUrl: 'https://models.test/pinned%20data/',
      layoutPaths: [...model('dozer/sparse/0'), ...model('poster/sparse/0')] });
    expect(index.image('cam/a.jpg')).toMatchObject({ status: 'resolved', path });
  });
  it('uses an explicit physical photo mapping without enabling auxiliary-folder inference', () => {
    const path = 'scene/segmentation/cam/a.png';
    const index = new NativeMediaPathIndex([...model('scene/sparse/0'), path], 'scene/sparse/0');
    expect(index.image('cam/a.jpg').status).toBe('missing');
    expect(index.image('cam/a.jpg', path)).toMatchObject({ status: 'resolved', path });
  });
  it.each([true, false])('keeps fractional timestamps when matching masks, with RGB path: %s', hasPhoto => {
    const name = '1697287.12345';
    const photo = hasPhoto ? 'scene/images/' + name + '.png' : name;
    const paths = [...model('scene/sparse/0'), ...(hasPhoto ? [photo] : []), 'scene/masks/1697287.png'];
    expect(new NativeMediaPathIndex(paths, 'scene/sparse/0').mask(name, photo).status).toBe('missing');
    paths.push('scene/masks/' + name + '.png');
    expect(new NativeMediaPathIndex(paths, 'scene/sparse/0').mask(name, photo)).toMatchObject({status:'resolved',path:'scene/masks/' + name + '.png'});
  });
  it.each(['', 'sparse', 'sparse/0', 'colmap', 'colmap/0', 'colmap/sparse/0', 'sparses/1'])('finds sibling RGB with model at %s', dir => {
    const root = dir ? 'scene/' + dir : 'scene';
    const index = new NativeMediaPathIndex([...model(root), 'scene/images/cam_1/a.JPG'], root);
    expect(index.image('cam_1/a.JPG')).toEqual({ status: 'resolved', path: 'scene/images/cam_1/a.JPG' });
  });
  it.each(['rgb', 'color', 'frames', 'image', 'photos', 'dslr_images', 'images_4', 'raw/camera one'])('handles RGB under %s', directory => {
    const index = new NativeMediaPathIndex([...model('scene/sparse/0'), `scene/${directory}/a.jpg`], 'scene/sparse/0');
    expect(index.image('a.jpg').path).toBe(`scene/${directory}/a.jpg`);
  });
  it.each(['masks', 'mask', 'fg_masks', 'foreground_masks', 'obj_masks', 'com_masks'])('handles %s with changed image extension', directory => {
    const index = new NativeMediaPathIndex([...model('scene/colmap/0'), 'scene/images/cam_1/a.jpg', `scene/${directory}/cam_1/a.png`], 'scene/colmap/0');
    expect(index.mask('cam_1/a.jpg', 'scene/images/cam_1/a.jpg')).toEqual({ status: 'resolved', path: `scene/${directory}/cam_1/a.png`, role: 'unknown' });
  });
  it.each(['a.jpg', 'a.jpg.png', 'a.png', 'a_mask.png'])('handles mask name %s', filename => {
    const index = new NativeMediaPathIndex(['images/a.jpg', 'masks/' + filename], 'sparse/0');
    expect(index.mask('a.jpg', 'images/a.jpg')).toMatchObject({ status: 'resolved', path: 'masks/' + filename,
      role: filename === 'a.jpg.png' ? 'validity' : 'unknown' });
  });
  it('strips nested structural containers without losing the scene', () => {
    expect(nativeSceneRoot('scene/colmap/sparse/0')).toBe('scene');
    expect(nativeSceneRoot('scene/colmap/1')).toBe('scene');
    expect(nativeSceneRoot('scene/model')).toBe('scene/model');
  });
  it('selects the scene, not the largest canonical images directory', () => {
    const paths = [...model('a/sparse/0'), ...model('b/sparse/0'), 'a/images/one.jpg', ...Array.from({ length: 20 }, (_, i) => `b/images/${i}.jpg`)];
    expect(resolveImagesDir(paths, { modelDir: 'a/sparse/0' })).toBe('a/images');
    const index = new NativeMediaPathIndex(paths, 'a/sparse/0');
    expect(index.image('one.jpg').path).toBe('a/images/one.jpg');
    expect(index.image('0.jpg').status).toBe('missing');
  });
  it('does not borrow a nested foreign scene when the selected scene is at root', () => {
    const index = new NativeMediaPathIndex([...model('sparse/0'), ...model('other/sparse/0'), 'other/images/a.jpg'], 'sparse/0');
    expect(index.image('a.jpg').status).toBe('missing');
    expect(index.image('a.jpg', 'other/images/a.jpg').path).toBe('other/images/a.jpg');
  });
  it('does not borrow photos beside another scene with the same custom model container', () => {
    const index = new NativeMediaPathIndex([...model('a/reference'), ...model('b/reference'), 'b/images/a.jpg'], 'a/reference');
    expect(index.image('a.jpg').status).toBe('missing');
  });
  it('resolves scene-relative CSV paths inside an outer folder without basename substitution', () => {
    const index = new NativeMediaPathIndex(['outer/scene/raw/left/a.jpg', 'outer/scene/raw/right/a.jpg'], 'outer/scene/colmap');
    expect(index.image('0.jpg', 'raw/left/a.jpg').path).toBe('outer/scene/raw/left/a.jpg');
    expect(index.image('0.jpg', 'raw/missing/a.jpg').status).toBe('missing');
  });
  it('excludes mask and depth directories from RGB discovery', () => {
    expect(resolveImagesDir(['scene/masks/images/a.png', 'scene/depth/a.png', 'scene/fg_masks/a.png', 'scene/rgb/a.png'], { modelDir: 'scene/sparse/0' })).toBe('scene/rgb');
  });
  it('preserves nested camera names and never substitutes another camera basename', () => {
    const index = new NativeMediaPathIndex(['scene/images/cam_2/a.jpg', 'scene/masks/cam_2/a.jpg.png'], 'scene/sparse/0');
    expect(index.image('cam_1/a.jpg').status).toBe('missing');
    expect(index.mask('cam_1/a.jpg', 'scene/images/cam_1/a.jpg').status).toBe('missing');
  });
  it('retains ambiguous aliases and allows an explicit physical path to resolve them', () => {
    const paths = ['scene/raw/left/a.jpg', 'scene/raw/right/a.jpg'];
    const index = new NativeMediaPathIndex(paths, 'scene/model');
    expect(index.image('a.jpg')).toMatchObject({ status: 'ambiguous', candidates: paths });
    expect(index.image('a.jpg', paths[1])).toEqual({ status: 'resolved', path: paths[1] });
  });
  it('prefers original images over a resized alternative', () => {
    const index = new NativeMediaPathIndex(['scene/images_4/a.jpg', 'scene/images/a.jpg'], 'scene/sparse/0');
    expect(index.image('a.jpg').path).toBe('scene/images/a.jpg');
    expect(index.image('images/a.jpg').path).toBe('scene/images/a.jpg');
  });
  it('preserves a real images/ subdirectory in a native registered name', () => {
    const index = new NativeMediaPathIndex(['scene/images/images/nested/a.png', 'scene/images/nested/a.png'], 'scene/sparse/0');
    expect(index.image('images/nested/a.png').path).toBe('scene/images/images/nested/a.png');
    expect(index.image('nested/a.png').path).toBe('scene/images/nested/a.png');
  });
  it('prefers exact filename case, and refuses a case-folding collision', () => {
    const index = new NativeMediaPathIndex(['images/A.JPG', 'images/a.jpg'], 'sparse/0');
    expect(index.image('A.JPG').path).toBe('images/A.JPG');
    expect(index.image('a.JpG').status).toBe('ambiguous');
  });
  it('does not treat a camera subfolder named mask as a mask source', () => {
    const index = new NativeMediaPathIndex(['images/mask/a.jpg'], 'sparse/0');
    expect(index.image('mask/a.jpg').path).toBe('images/mask/a.jpg');
    expect(index.mask('mask/a.jpg', 'images/mask/a.jpg').status).toBe('missing');
  });
  it('does not bind an RGB photo as its own mask', () => {
    const index = new NativeMediaPathIndex(['images/a.png'], 'sparse/0');
    expect(index.mask('a.png', 'images/a.png').status).toBe('missing');
  });
  it('excludes downsampled mask previews from photos and masks', () => {
    const index = new NativeMediaPathIndex(['scene/masks_4/Visualizations/a.jpg'], 'scene/sparse/0');
    expect(index.image('a.jpg').status).toBe('missing');
    expect(index.mask('a.jpg', 'scene/images/a.jpg').status).toBe('missing');
  });
});
