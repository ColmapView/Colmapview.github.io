import { describe, it, expect } from 'vitest';
import {
  getSplatDownloadProgress,
  SPLAT_DOWNLOAD_START_PERCENT,
  SPLAT_DOWNLOAD_END_PERCENT,
} from './splatLoadingProgressPolicy';

describe('getSplatDownloadProgress', () => {
  it('maps loaded/total bytes onto the download percent range', () => {
    expect(getSplatDownloadProgress('a.ply', 0, 1000).percent).toBe(SPLAT_DOWNLOAD_START_PERCENT);
    expect(getSplatDownloadProgress('a.ply', 1000, 1000).percent).toBe(SPLAT_DOWNLOAD_END_PERCENT);
    // halfway: 5 + (90-5)*0.5 = 47.5 -> 48
    expect(getSplatDownloadProgress('a.ply', 500, 1000).percent).toBe(48);
  });

  it('exposes byte counts and the file name for the overlay', () => {
    expect(getSplatDownloadProgress('surface.ply', 250, 1000)).toEqual({
      percent: 26,
      message: 'Downloading splat: surface.ply',
      currentFile: 'surface.ply',
      bytesLoaded: 250,
      bytesTotal: 1000,
    });
  });

  it('omits bytesTotal and stays at the start percent when total is unknown', () => {
    const progress = getSplatDownloadProgress('a.ply', 4096, 0);
    expect(progress.percent).toBe(SPLAT_DOWNLOAD_START_PERCENT);
    expect(progress.bytesLoaded).toBe(4096);
    expect(progress.bytesTotal).toBeUndefined();
  });

  it('honors a custom percent range', () => {
    expect(getSplatDownloadProgress('a.ply', 1000, 1000, { startPercent: 0, endPercent: 50 }).percent).toBe(50);
  });
});
