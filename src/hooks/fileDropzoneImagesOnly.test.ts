import { describe, expect, it, vi } from 'vitest';
import { buildFile } from '../test/builders';
import { runImagesOnlyLoad } from './fileDropzoneImagesOnly';

describe('file dropzone images-only load helper', () => {
  it('builds a gallery-only reconstruction and applies side effects in load order', () => {
    const image = buildFile('frame.jpg');
    const splatFile = buildFile('scene.ply', 'splat');
    const splatFiles = [splatFile];
    const imageFiles = new Map([['frame.jpg', image]]);
    const calls: string[] = [];
    const setUrlProgress = vi.fn((progress) => calls.push(`progress:${progress.message}`));
    const setLoadedFiles = vi.fn(() => calls.push('loadedFiles'));
    const clearSplatPsnr = vi.fn(() => calls.push('clearSplatPsnr'));
    const clearCaches = vi.fn(() => calls.push('clearCaches'));
    const setReconstruction = vi.fn(() => calls.push('reconstruction'));
    const resetView = vi.fn(() => calls.push('resetView'));
    const addNotification = vi.fn(() => calls.push('notification'));
    const log = vi.fn((message: string) => calls.push(`log:${message}`));

    const reconstruction = runImagesOnlyLoad({
      imageFiles,
      hasMasks: true,
      splatFile,
      splatFiles,
      mapProgress: (percent) => percent + 10,
      setUrlProgress,
      setLoadedFiles,
      clearSplatPsnr,
      clearCaches,
      setReconstruction,
      resetView,
      addNotification,
      log,
    });

    expect(reconstruction.images.size).toBe(1);
    expect(reconstruction.points3D).toBeUndefined();
    expect(setUrlProgress).toHaveBeenNthCalledWith(1, {
      percent: 60,
      message: 'Creating image gallery...',
    });
    expect(setUrlProgress).toHaveBeenNthCalledWith(2, {
      percent: 105,
      message: 'Finalizing...',
    });
    expect(setLoadedFiles).toHaveBeenCalledWith({
      camerasFile: undefined,
      imagesFile: undefined,
      points3DFile: undefined,
      splatFile,
      splatFiles,
      databaseFile: undefined,
      rigsFile: undefined,
      framesFile: undefined,
      imageFiles,
      hasMasks: true,
    });
    expect(clearCaches).toHaveBeenCalledWith({ preserveZip: true });
    expect(setReconstruction).toHaveBeenCalledWith(reconstruction);
    expect(addNotification).toHaveBeenCalledWith(
      'info',
      'Loaded 1 images (gallery only, no 3D data)',
      5000
    );
    expect(calls).toEqual([
      'log:[Images-only] Creating gallery from 1 image lookup keys',
      'progress:Creating image gallery...',
      'clearSplatPsnr',
      'loadedFiles',
      'clearCaches',
      'progress:Finalizing...',
      'reconstruction',
      'resetView',
      'notification',
      'log:[Images-only] Loaded 1 images for gallery viewing',
    ]);
  });
});
