import { describe, expect, it, vi } from 'vitest';
import { buildFile } from '../test/builders';
import { runSplatOnlyLoad } from './fileDropzoneSplatOnly';

describe('file dropzone splat-only load helper', () => {
  it('builds an empty reconstruction and applies active splat side effects in load order', () => {
    const splatFile = buildFile('scene.spz', 'splat');
    const fallbackSplat = buildFile('fallback.spz', 'splat');
    const splatFiles = [splatFile, fallbackSplat];
    const splatFileSources = [
      { id: 'scene.spz', path: 'scene.spz', file: splatFile },
      { id: 'fallback.spz', path: 'fallback.spz', file: fallbackSplat },
    ];
    const calls: string[] = [];
    const setUrlProgress = vi.fn((progress) => calls.push(`progress:${progress.message}`));
    const setLoadedFiles = vi.fn(() => calls.push('loadedFiles'));
    const clearSplatPsnr = vi.fn(() => calls.push('clearSplatPsnr'));
    const clearCaches = vi.fn(() => calls.push('clearCaches'));
    const setReconstruction = vi.fn(() => calls.push('reconstruction'));
    const resetView = vi.fn(() => calls.push('resetView'));
    const addNotification = vi.fn(() => calls.push('notification'));
    const log = vi.fn((message: string) => calls.push(`log:${message}`));

    const reconstruction = runSplatOnlyLoad({
      splatFile,
      splatFiles,
      splatFileSources,
      mapProgress: (percent) => percent + 5,
      setUrlProgress,
      setLoadedFiles,
      clearSplatPsnr,
      clearCaches,
      setReconstruction,
      resetView,
      addNotification,
      log,
    });

    expect(reconstruction.images.size).toBe(0);
    expect(reconstruction.cameras.size).toBe(0);
    expect(setUrlProgress).toHaveBeenNthCalledWith(1, {
      percent: 55,
      message: 'Loading splat scene...',
      currentFile: 'scene.spz',
    });
    expect(setUrlProgress).toHaveBeenNthCalledWith(2, {
      percent: 65,
      message: 'Preparing splat renderer...',
      currentFile: 'scene.spz',
    });
    expect(setLoadedFiles).toHaveBeenCalledWith({
      camerasFile: undefined,
      imagesFile: undefined,
      points3DFile: undefined,
      splatFile,
      splatFiles,
      splatFileSources,
      databaseFile: undefined,
      rigsFile: undefined,
      framesFile: undefined,
      imageFiles: new Map(),
      hasMasks: false,
    });
    expect(setReconstruction).toHaveBeenCalledWith(reconstruction);
    expect(addNotification).toHaveBeenCalledWith('info', 'Loaded splat: scene.spz', 5000);
    expect(calls).toEqual([
      'log:[Splats] Creating splat-only scene from scene.spz',
      'progress:Loading splat scene...',
      'clearSplatPsnr',
      'loadedFiles',
      'clearCaches',
      'progress:Preparing splat renderer...',
      'reconstruction',
      'resetView',
      'notification',
      'log:[Splats] Loaded splat-only scene: scene.spz',
    ]);
  });
});
