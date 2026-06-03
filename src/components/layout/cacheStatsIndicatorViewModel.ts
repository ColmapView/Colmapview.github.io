import type { CSSProperties } from 'react';
import type { CacheStatsEntry } from '../../cache';
import type { DatasetMemoryStats, LoadStrategy, MemoryType } from '../../dataset';
import { STATUS_COLORS } from '../../theme';

export const CACHE_TOOLTIP_VIEWPORT_PADDING = 8;
export const CACHE_TOOLTIP_BOTTOM_OFFSET = '100%';
export const CACHE_TOOLTIP_MARGIN_BOTTOM = '8px';

export interface CacheSourceInfo {
  label: string;
  color: string;
}

export interface CacheStatsResourceRow {
  label: string;
  strategy: LoadStrategy;
  memoryType: MemoryType;
  count: number;
  size: string;
  available: boolean;
}

export interface CacheEntryTotals {
  jsBytes: number;
  wasmBytes: number;
  lazyBytes: number;
  lazyCount: number;
}

export interface CacheStatsFooterTotals extends CacheEntryTotals {
  loadedJsBytes: number;
  loadedWasmBytes: number;
  lazyJsBytes: number;
  lazyJsCount: number;
  showWasm: boolean;
  showLazy: boolean;
}

export interface HorizontalRect {
  left: number;
  right: number;
}

export const CACHE_SOURCE_INFO: Record<string, CacheSourceInfo> = {
  local: { label: 'Local', color: STATUS_COLORS.success },
  url: { label: 'URL', color: STATUS_COLORS.info },
  manifest: { label: 'Manifest', color: STATUS_COLORS.highlight },
  zip: { label: 'ZIP', color: STATUS_COLORS.warning },
};

export function getCacheSourceInfo(sourceType: string | null): CacheSourceInfo | null {
  return sourceType ? CACHE_SOURCE_INFO[sourceType] ?? null : null;
}

export function getCacheSourceIndicatorLabel(
  sourceLabel: string | undefined,
  hasSplatFile: boolean
): string {
  const label = sourceLabel ?? 'None';
  return hasSplatFile ? `${label} + Splat` : label;
}

export function formatCacheBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), units.length - 1);
  const size = bytes / Math.pow(k, index);
  const decimals = size < 10 ? 2 : size < 100 ? 1 : 0;

  return `${size.toFixed(decimals)} ${units[index]}`;
}

export function getEffectiveResourceStrategy(available: boolean, strategy: LoadStrategy): LoadStrategy {
  return available ? strategy : 'unavailable';
}

export function buildDatasetResourceRows(stats: DatasetMemoryStats): CacheStatsResourceRow[] {
  const rows: CacheStatsResourceRow[] = [
    getResourceRow('3D Points', stats.points3D),
    getResourceRow('2D Keypoints', stats.points2D),
    getResourceRow('Matches', stats.matches),
    {
      label: stats.rigs.available ? 'Cameras/Rigs' : 'Cameras',
      strategy: stats.cameras.strategy,
      memoryType: stats.cameras.memoryType,
      count: stats.cameras.memory.count + (stats.rigs.available ? stats.rigs.memory.count : 0),
      size: formatCacheBytes(stats.cameras.memory.sizeBytes + (stats.rigs.available ? stats.rigs.memory.sizeBytes : 0)),
      available: stats.cameras.available,
    },
    getResourceRow('Camera Poses', stats.imagePoses),
  ];

  if (stats.database.available) {
    rows.push(getResourceRow('Database', stats.database));
  }

  if (stats.splats.available) {
    rows.push(getResourceRow('Splat PLY', stats.splats));
  }

  return rows;
}

export function computeCacheEntryTotals(cacheEntries: CacheStatsEntry[]): CacheEntryTotals {
  let jsBytes = 0;
  let wasmBytes = 0;
  let lazyBytes = 0;
  let lazyCount = 0;

  for (const entry of cacheEntries) {
    if (entry.strategy === 'lazy') {
      lazyBytes += entry.stats.sizeBytes;
      lazyCount += entry.stats.count;
    } else if (entry.memoryType === 'wasm') {
      wasmBytes += entry.stats.sizeBytes;
    } else {
      jsBytes += entry.stats.sizeBytes;
    }
  }

  return { jsBytes, wasmBytes, lazyBytes, lazyCount };
}

export function buildCacheStatsFooterTotals(
  stats: DatasetMemoryStats,
  cacheTotals: CacheEntryTotals
): CacheStatsFooterTotals {
  const loadedWasmBytes = stats.totalWasm.sizeBytes + cacheTotals.wasmBytes;
  const loadedJsBytes = stats.totalJs.sizeBytes + cacheTotals.jsBytes;
  const lazyJsBytes = stats.totalCached.sizeBytes + cacheTotals.lazyBytes;
  const lazyJsCount = stats.totalCached.count + cacheTotals.lazyCount;

  return {
    ...cacheTotals,
    loadedJsBytes,
    loadedWasmBytes,
    lazyJsBytes,
    lazyJsCount,
    showWasm: loadedWasmBytes > 0,
    showLazy: lazyJsBytes > 0,
  };
}

export function getTooltipHorizontalAdjustment(
  rect: HorizontalRect,
  viewportWidth: number,
  padding = CACHE_TOOLTIP_VIEWPORT_PADDING
): number | null {
  if (rect.left < padding) {
    return padding - rect.left;
  }

  if (rect.right > viewportWidth - padding) {
    return -(rect.right - (viewportWidth - padding));
  }

  return null;
}

export function getCacheStatsTooltipStyle(adjustedLeft: number | null): CSSProperties {
  return {
    bottom: CACHE_TOOLTIP_BOTTOM_OFFSET,
    marginBottom: CACHE_TOOLTIP_MARGIN_BOTTOM,
    left: adjustedLeft ?? 0,
  };
}

export function getCacheStatsJoinedFooterRowStyle(joinedWithPrevious: boolean): CSSProperties | undefined {
  return joinedWithPrevious ? { borderTop: 'none' } : undefined;
}

function getResourceRow(
  label: string,
  resource: DatasetMemoryStats['points3D']
): CacheStatsResourceRow {
  return {
    label,
    strategy: resource.strategy,
    memoryType: resource.memoryType,
    count: resource.memory.count,
    size: resource.memory.sizeFormatted,
    available: resource.available,
  };
}
