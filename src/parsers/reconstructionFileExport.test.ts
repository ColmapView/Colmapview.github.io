import { describe, expect, it, vi } from 'vitest';
import {
  exportPointsPLYFile,
  exportReconstructionBinaryFiles,
  exportReconstructionTextFiles,
} from './reconstructionFileExport';

describe('exportReconstructionTextFiles', () => {
  it('downloads core COLMAP text files followed by optional rig files', () => {
    const download = vi.fn();

    exportReconstructionTextFiles(
      {
        writeCameras: vi.fn(() => 'cameras'),
        writeImages: vi.fn(() => 'images'),
        writePoints3D: vi.fn(() => 'points3D'),
        writeRigs: vi.fn(() => 'rigs'),
        writeFrames: vi.fn(() => 'frames'),
      },
      download
    );

    expect(download.mock.calls).toEqual([
      ['cameras', 'cameras.txt'],
      ['images', 'images.txt'],
      ['points3D', 'points3D.txt'],
      ['rigs', 'rigs.txt'],
      ['frames', 'frames.txt'],
    ]);
  });

  it('omits rig files when optional writers are absent', () => {
    const download = vi.fn();

    exportReconstructionTextFiles(
      {
        writeCameras: () => 'cameras',
        writeImages: () => 'images',
        writePoints3D: () => 'points3D',
      },
      download
    );

    expect(download.mock.calls).toEqual([
      ['cameras', 'cameras.txt'],
      ['images', 'images.txt'],
      ['points3D', 'points3D.txt'],
    ]);
  });
});

describe('exportReconstructionBinaryFiles', () => {
  it('downloads core COLMAP binary files followed by optional rig files', () => {
    const download = vi.fn();
    const cameras = new ArrayBuffer(1);
    const images = new ArrayBuffer(2);
    const points3D = new ArrayBuffer(3);
    const rigs = new ArrayBuffer(4);
    const frames = new ArrayBuffer(5);

    exportReconstructionBinaryFiles(
      {
        writeCameras: vi.fn(() => cameras),
        writeImages: vi.fn(() => images),
        writePoints3D: vi.fn(() => points3D),
        writeRigs: vi.fn(() => rigs),
        writeFrames: vi.fn(() => frames),
      },
      download
    );

    expect(download.mock.calls).toEqual([
      [cameras, 'cameras.bin'],
      [images, 'images.bin'],
      [points3D, 'points3D.bin'],
      [rigs, 'rigs.bin'],
      [frames, 'frames.bin'],
    ]);
  });
});

describe('exportPointsPLYFile', () => {
  it('downloads generated PLY content as points.ply', () => {
    const download = vi.fn();

    exportPointsPLYFile(() => 'ply-data', download);

    expect(download).toHaveBeenCalledOnce();
    expect(download).toHaveBeenCalledWith('ply-data', 'points.ply');
  });
});
