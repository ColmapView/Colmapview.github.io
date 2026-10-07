import { describe, expect, it, vi } from 'vitest';
import type { LoadedFiles } from '../types/colmap';
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
      log,
    });

    expect(reconstruction.images.size).toBe(0);
    expect(reconstruction.cameras.size).toBe(0);
    expect(setUrlProgress).toHaveBeenNthCalledWith(1, {
      percent: 55,
      message: 'Loading splat scene...',
      currentFile: 'scene.spz',
    });
    // The caller hands the splat to its renderer: only it knows whether the splat is already on screen.
    expect(setUrlProgress).toHaveBeenNthCalledWith(2, {
      percent: 100,
      message: 'Finalizing...',
    });
    expect(setLoadedFiles).toHaveBeenCalledWith({
      camerasFile: undefined,
      imagesFile: undefined,
      points3DFile: undefined,
      splatFile,
      splatFiles,
      splatFileSources,
      rigsFile: undefined,
      framesFile: undefined,
      imageFiles: new Map(),
      hasMasks: false,
    });
    expect(setReconstruction).toHaveBeenCalledWith(reconstruction);
    expect(calls).toEqual([
      'log:[Splats] Creating splat-only scene from scene.spz',
      'progress:Loading splat scene...',
      'clearSplatPsnr',
      'loadedFiles',
      'clearCaches',
      'progress:Finalizing...',
      'reconstruction',
      'resetView',
      'log:[Splats] Loaded splat-only scene: scene.spz',
    ]);
  });

  it('lists the splats with none active when a Reload keeps None', () => {
    const splatFile = buildFile('scene.spz', 'splat');
    const splatFileSources = [{ id: 'scene.spz', path: 'scene.spz', file: splatFile }];
    const setUrlProgress = vi.fn();
    const setLoadedFiles = vi.fn((_files: LoadedFiles) => undefined);
    const setReconstruction = vi.fn();

    const reconstruction = runSplatOnlyLoad({
      splatFile: undefined,
      splatFiles: [splatFile],
      splatFileSources,
      mapProgress: (percent) => percent,
      setUrlProgress,
      setLoadedFiles,
      clearCaches: vi.fn(),
      setReconstruction,
      resetView: vi.fn(),
      log: vi.fn(),
    });

    expect(reconstruction.images.size).toBe(0);
    expect(setReconstruction).toHaveBeenCalledWith(reconstruction);
    const committed = setLoadedFiles.mock.calls[0][0];
    expect(committed.splatFile).toBeUndefined();
    expect(committed.splatFileSources).toBe(splatFileSources);
    expect(committed.splatFiles?.[0]).toBe(splatFile);
    expect(setUrlProgress).toHaveBeenNthCalledWith(1, { percent: 50, message: 'Loading splat scene...' });
    expect(setUrlProgress).toHaveBeenLastCalledWith({ percent: 95, message: 'Finalizing...' });
  });
});
