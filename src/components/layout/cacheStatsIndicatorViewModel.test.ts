import { describe, expect, it } from 'vitest';
import type { CacheStatsEntry } from '../../cache';
import type { DatasetMemoryStats, ResourceInfo } from '../../dataset';
import {
  buildCacheStatsFooterTotals,
  buildDatasetResourceRows,
  computeCacheEntryTotals,
  CACHE_TOOLTIP_BOTTOM_OFFSET,
  CACHE_TOOLTIP_MARGIN_BOTTOM,
  formatCacheBytes,
  getCacheSourceIndicatorLabel,
  getCacheStatsJoinedFooterRowStyle,
  getCacheStatsTooltipStyle,
  getCacheSourceInfo,
  getEffectiveResourceStrategy,
  getTooltipHorizontalAdjustment,
} from './cacheStatsIndicatorViewModel';

describe('cache stats indicator view model', () => {
  it('formats source labels and byte counts', () => {
    expect(getCacheSourceInfo('local')?.label).toBe('Local');
    expect(getCacheSourceInfo('zip')?.label).toBe('ZIP');
    expect(getCacheSourceInfo('unknown')).toBeNull();
    expect(getCacheSourceInfo(null)).toBeNull();
    expect(getCacheSourceIndicatorLabel('Local', false)).toBe('Local');
    expect(getCacheSourceIndicatorLabel('Local', true)).toBe('Local + Splat');
    expect(getCacheSourceIndicatorLabel(undefined, true)).toBe('None + Splat');

    expect(formatCacheBytes(0)).toBe('0 B');
    expect(formatCacheBytes(512)).toBe('512 B');
    expect(formatCacheBytes(1024)).toBe('1.00 KB');
    expect(formatCacheBytes(10 * 1024)).toBe('10.0 KB');
    expect(formatCacheBytes(100 * 1024)).toBe('100 KB');
    expect(formatCacheBytes(2 * 1024 * 1024)).toBe('2.00 MB');
  });

  it('dims unavailable resources through an effective strategy', () => {
    expect(getEffectiveResourceStrategy(true, 'memory')).toBe('memory');
    expect(getEffectiveResourceStrategy(true, 'lazy')).toBe('lazy');
    expect(getEffectiveResourceStrategy(false, 'memory')).toBe('unavailable');
  });

  it('builds dataset table rows with rig and database policy', () => {
    const stats = createStats({
      rigs: resource({ available: true, count: 2, sizeBytes: 128 }),
      database: resource({ available: true, count: 1, sizeBytes: 4096 }),
      splats: resource({ available: true, count: 1, sizeBytes: 5 * 1024 * 1024 }),
    });

    expect(buildDatasetResourceRows(stats)).toEqual([
      expect.objectContaining({ label: '3D Points', count: 10, size: '80.0 B', available: true }),
      expect.objectContaining({ label: '2D Keypoints', count: 20 }),
      expect.objectContaining({ label: 'Matches', available: false }),
      expect.objectContaining({ label: 'Cameras/Rigs', count: 5, size: '256 B' }),
      expect.objectContaining({ label: 'Camera Poses', count: 4 }),
      expect.objectContaining({ label: 'Database', count: 1, size: '4.00 KB' }),
      expect.objectContaining({ label: 'Splat PLY', count: 1, size: '5.00 MB' }),
    ]);
  });

  it('omits unavailable database rows and leaves camera rows uncombined without rigs', () => {
    const rows = buildDatasetResourceRows(createStats());

    expect(rows.map((row) => row.label)).toEqual([
      '3D Points',
      '2D Keypoints',
      'Matches',
      'Cameras',
      'Camera Poses',
    ]);
  });

  it('computes cache entry and footer totals', () => {
    const entries: CacheStatsEntry[] = [
      { name: 'a', label: 'A', strategy: 'memory', memoryType: 'js', stats: { count: 1, sizeBytes: 100 } },
      { name: 'b', label: 'B', strategy: 'memory', memoryType: 'wasm', stats: { count: 2, sizeBytes: 200 } },
      { name: 'c', label: 'C', strategy: 'lazy', memoryType: 'js', stats: { count: 3, sizeBytes: 300 } },
    ];

    const cacheTotals = computeCacheEntryTotals(entries);
    const footerTotals = buildCacheStatsFooterTotals(createStats(), cacheTotals);

    expect(cacheTotals).toEqual({ jsBytes: 100, wasmBytes: 200, lazyBytes: 300, lazyCount: 3 });
    expect(footerTotals.loadedJsBytes).toBe(1100);
    expect(footerTotals.loadedWasmBytes).toBe(700);
    expect(footerTotals.lazyJsBytes).toBe(550);
    expect(footerTotals.lazyJsCount).toBe(8);
    expect(footerTotals.showWasm).toBe(true);
    expect(footerTotals.showLazy).toBe(true);
  });

  it('computes tooltip horizontal adjustment against viewport edges', () => {
    expect(getTooltipHorizontalAdjustment({ left: 4, right: 304 }, 800, 8)).toBe(4);
    expect(getTooltipHorizontalAdjustment({ left: 540, right: 810 }, 800, 8)).toBe(-18);
    expect(getTooltipHorizontalAdjustment({ left: 20, right: 300 }, 800, 8)).toBeNull();
  });

  it('derives tooltip and joined footer render styles', () => {
    expect(getCacheStatsTooltipStyle(null)).toEqual({
      bottom: CACHE_TOOLTIP_BOTTOM_OFFSET,
      marginBottom: CACHE_TOOLTIP_MARGIN_BOTTOM,
      left: 0,
    });
    expect(getCacheStatsTooltipStyle(-18)).toEqual({
      bottom: CACHE_TOOLTIP_BOTTOM_OFFSET,
      marginBottom: CACHE_TOOLTIP_MARGIN_BOTTOM,
      left: -18,
    });
    expect(getCacheStatsJoinedFooterRowStyle(false)).toBeUndefined();
    expect(getCacheStatsJoinedFooterRowStyle(true)).toEqual({ borderTop: 'none' });
  });
});

function createStats(overrides: Partial<DatasetMemoryStats> = {}): DatasetMemoryStats {
  return {
    points3D: resource({ count: 10, sizeBytes: 80 }),
    points2D: resource({ count: 20, sizeBytes: 160 }),
    matches: resource({ available: false }),
    cameras: resource({ count: 3, sizeBytes: 128 }),
    imagePoses: resource({ count: 4, sizeBytes: 512 }),
    imageFiles: resource({ strategy: 'lazy', count: 5, sizeBytes: 250 }),
    maskFiles: resource({ available: false, strategy: 'lazy' }),
    imagesDecoded: resource({ strategy: 'lazy', count: 1, sizeBytes: 1024 }),
    database: resource({ available: false }),
    rigs: resource({ available: false }),
    splats: resource({ available: false }),
    zipArchive: resource({ available: false }),
    totalWasm: { count: 10, sizeBytes: 500, sizeFormatted: '500 B' },
    totalJs: { count: 30, sizeBytes: 1000, sizeFormatted: '1000 B' },
    totalCached: { count: 5, sizeBytes: 250, sizeFormatted: '250 B' },
    sourceType: 'local',
    ...overrides,
  };
}

function resource(overrides: Partial<ResourceInfo> & { count?: number; sizeBytes?: number } = {}): ResourceInfo {
  const sizeBytes = overrides.sizeBytes ?? 0;
  const count = overrides.count ?? 0;

  return {
    available: true,
    strategy: 'memory',
    memoryType: 'js',
    memory: {
      count,
      sizeBytes,
      sizeFormatted: formatCacheBytes(sizeBytes),
    },
    ...overrides,
  };
}
