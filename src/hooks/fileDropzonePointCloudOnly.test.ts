import { describe, expect, it, vi } from 'vitest';
import { buildPoint3D } from '../test/builders';
import { runPointCloudOnlyLoad } from './fileDropzonePointCloudOnly';

describe('file dropzone point-cloud-only load helper', () => {
  it('builds a reconstruction with points3D and no active splat file', async () => {
    const pointCloudFile = new File(['ply'], 'points.ply');
    const point = buildPoint3D({ point3DId: 1n });
    const points3D = new Map([[point.point3DId, point]]);
    const calls: string[] = [];
    const setUrlProgress = vi.fn((progress) => calls.push(`progress:${progress.message}`));
    const setLoadedFiles = vi.fn(() => calls.push('loadedFiles'));
    const clearSplatPsnr = vi.fn(() => calls.push('clearSplatPsnr'));
    const clearCaches = vi.fn(() => calls.push('clearCaches'));
    const setReconstruction = vi.fn(() => calls.push('reconstruction'));
    const resetView = vi.fn(() => calls.push('resetView'));
    const addNotification = vi.fn(() => calls.push('notification'));
    const log = vi.fn((message: string) => calls.push(`log:${message}`));

    const reconstruction = await runPointCloudOnlyLoad({
      pointCloudFile,
      mapProgress: (percent) => percent,
      setUrlProgress,
      setLoadedFiles,
      clearSplatPsnr,
      clearCaches,
      setReconstruction,
      resetView,
      addNotification,
      parsePointCloudFile: vi.fn(async () => points3D),
      log,
    });

    expect(reconstruction.points3D).toBe(points3D);
    expect(reconstruction.globalStats.totalPoints).toBe(1);
    expect(setLoadedFiles).toHaveBeenCalledWith({
      camerasFile: undefined,
      imagesFile: undefined,
      points3DFile: pointCloudFile,
      splatFile: undefined,
      splatFiles: [],
      splatFileSources: [],
      databaseFile: undefined,
      rigsFile: undefined,
      framesFile: undefined,
      imageFiles: new Map(),
      hasMasks: false,
    });
    expect(setReconstruction).toHaveBeenCalledWith(reconstruction);
    expect(addNotification).toHaveBeenCalledWith('info', 'Loaded 1 points', 5000);
    expect(calls).toEqual([
      'log:[PointCloud] Creating point-cloud scene from points.ply',
      'progress:Loading point cloud...',
      'clearSplatPsnr',
      'loadedFiles',
      'clearCaches',
      'progress:Finalizing point cloud...',
      'reconstruction',
      'resetView',
      'notification',
      'log:[PointCloud] Loaded 1 points from points.ply',
    ]);
  });
});
