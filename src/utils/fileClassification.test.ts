import { describe, expect, it } from 'vitest';
import { buildFile } from '../test/builders';
import {
  createImagesOnlyReconstruction,
  findColmapFiles,
  findLargestPlyFile,
  hasColmapFiles,
  hasImageFiles,
} from './fileClassification';

function fileMap(entries: Array<[string, File]>): Map<string, File> {
  return new Map(entries);
}

describe('file classification helpers', () => {
  it('finds the preferred complete COLMAP directory and binary files', () => {
    const rootCameras = buildFile('cameras.bin');
    const rootImages = buildFile('images.bin');
    const rootPoints = buildFile('points3D.bin');
    const sparseCamerasTxt = buildFile('cameras.txt');
    const sparseCamerasBin = buildFile('cameras.bin');
    const sparseImages = buildFile('images.txt');
    const sparsePoints = buildFile('points3D.txt');
    const sparseDatabase = buildFile('database.db');
    const sparseRigs = buildFile('rigs.txt');
    const sparseFrames = buildFile('frames.bin');

    const result = findColmapFiles(fileMap([
      ['other/model/cameras.bin', rootCameras],
      ['other/model/images.bin', rootImages],
      ['other/model/points3D.bin', rootPoints],
      ['project/sparse/0/cameras.txt', sparseCamerasTxt],
      ['project/sparse/0/cameras.bin', sparseCamerasBin],
      ['project/sparse/0/images.txt', sparseImages],
      ['project/sparse/0/points3D.txt', sparsePoints],
      ['project/sparse/0/database.db', sparseDatabase],
      ['project/sparse/0/rigs.txt', sparseRigs],
      ['project/sparse/0/frames.bin', sparseFrames],
    ]));

    expect(result).toEqual({
      camerasFile: sparseCamerasBin,
      imagesFile: sparseImages,
      points3DFile: sparsePoints,
      databaseFile: sparseDatabase,
      rigsFile: sparseRigs,
      framesFile: sparseFrames,
    });
  });

  it('requires cameras, images, and points3D files for a COLMAP selection', () => {
    const result = findColmapFiles(fileMap([
      ['sparse/0/cameras.bin', buildFile('cameras.bin')],
      ['sparse/0/images.bin', buildFile('images.bin')],
      ['sparse/0/rigs.bin', buildFile('rigs.bin')],
    ]));

    expect(result).toEqual({});
  });

  it('finds the largest PLY file without treating non-PLY files as splats', () => {
    const small = buildFile('small.ply', 'x');
    const root = buildFile('root_gaussians.ply', 'xx');
    const output = buildFile('surface_gaussians.ply', 'xxx');
    const nested = buildFile('model.PLY', 'xxxx');
    const largest = buildFile('deep_gaussians.ply', 'xxxxx');
    const ignored = buildFile('points3D.bin', 'xxxxxxxx');

    const result = findLargestPlyFile(fileMap([
      ['splats/small.ply', small],
      ['root_gaussians.ply', root],
      ['output/surface_gaussians.ply', output],
      ['sparse/0/points3D.bin', ignored],
      ['3dgs/model.PLY', nested],
      ['folder/folder/folder/deep_gaussians.ply', largest],
    ]));

    expect(result).toBe(largest);
  });

  it('returns undefined when no PLY file is present', () => {
    expect(findLargestPlyFile(fileMap([
      ['images/frame.jpg', buildFile('frame.jpg')],
    ]))).toBeUndefined();
  });

  it('classifies COLMAP, image-only, and generated reconstruction inputs', () => {
    const image = buildFile('frame.jpg');
    const files = fileMap([
      ['sparse/0/cameras.txt', buildFile('cameras.txt')],
      ['images/frame.jpg', image],
    ]);

    expect(hasColmapFiles(files)).toBe(true);
    expect(hasImageFiles(files)).toBe(true);

    const reconstruction = createImagesOnlyReconstruction(new Map([['frame.jpg', image]]));

    expect(reconstruction.images.size).toBe(1);
    expect(reconstruction.cameras.size).toBe(1);
    expect(reconstruction.connectedImagesIndex.size).toBe(0);
  });
});
