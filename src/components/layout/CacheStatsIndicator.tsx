import { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react';
import { useDataset, type DatasetMemoryStats, type LoadStrategy, type MemoryType } from '../../dataset';
import { useReconstructionStore } from '../../store';
import { cacheStatsStyles } from '../../theme';
import { getCacheStatsEntries, type CacheStatsEntry } from '../../cache';

/** Source type display info */
const SOURCE_INFO: Record<string, { label: string; color: string }> = {
  local: { label: 'Local', color: 'text-green-400' },
  url: { label: 'URL', color: 'text-blue-400' },
  manifest: { label: 'Manifest', color: 'text-purple-400' },
  zip: { label: 'ZIP', color: 'text-amber-400' },
};

/** Icon components */
function FolderIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={`w-3.5 h-3.5 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
  );
}

function LinkIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={`w-3.5 h-3.5 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  );
}

function FileTextIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={`w-3.5 h-3.5 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function ArchiveIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={`w-3.5 h-3.5 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
    </svg>
  );
}

function getSourceIcon(sourceType: string | null, className = '') {
  switch (sourceType) {
    case 'local': return <FolderIcon className={className} />;
    case 'url': return <LinkIcon className={className} />;
    case 'manifest': return <FileTextIcon className={className} />;
    case 'zip': return <ArchiveIcon className={className} />;
    default: return <FolderIcon className={className} />;
  }
}

/** Status dot with color based on strategy and memory type */
function StatusDot({ strategy, memoryType = 'js' }: { strategy: LoadStrategy; memoryType?: MemoryType }) {
  if (strategy === 'lazy') {
    return <span className={cacheStatsStyles.dotLazy} />;
  }
  if (strategy === 'unavailable') {
    return <span className={cacheStatsStyles.dotUnavailable} />;
  }
  // Memory strategy - differentiate WASM vs JS
  return <span className={memoryType === 'wasm' ? cacheStatsStyles.dotMemoryWasm : cacheStatsStyles.dotMemoryJs} />;
}

/** Format bytes into human-readable string */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const size = bytes / Math.pow(k, i);
  const decimals = size < 10 ? 2 : size < 100 ? 1 : 0;
  return `${size.toFixed(decimals)} ${units[i]}`;
}

/** Table row for resource */
function Row({
  label,
  strategy,
  memoryType = 'js',
  count,
  size,
  available,
}: {
  label: string;
  strategy: LoadStrategy;
  memoryType?: MemoryType;
  count: number;
  size: string;
  available: boolean;
}) {
  const effectiveStrategy = available ? strategy : 'unavailable';
  const rowClass = available ? '' : cacheStatsStyles.tableRowDimmed;

  return (
    <tr className={rowClass}>
      <td className={cacheStatsStyles.tableCellLabel}>
        <div className={cacheStatsStyles.tableCellLabelInner}>
          <StatusDot strategy={effectiveStrategy} memoryType={memoryType} />
          <span className={cacheStatsStyles.tableCellLabelText}>{label}</span>
        </div>
      </td>
      <td className={cacheStatsStyles.tableCellCount}>
        {available ? count.toLocaleString() : '-'}
      </td>
      <td className={cacheStatsStyles.tableCellSize}>
        {available ? size : '-'}
      </td>
    </tr>
  );
}

/** Table row for a registered cache entry (auto-generated from registry) */
function CacheRow({ entry }: { entry: CacheStatsEntry }) {
  const available = entry.stats.count > 0 || entry.stats.sizeBytes > 0;
  if (!available) return null;

  return (
    <tr>
      <td className={cacheStatsStyles.tableCellLabel}>
        <div className={cacheStatsStyles.tableCellLabelInner}>
          <StatusDot strategy={entry.strategy} memoryType={entry.memoryType} />
          <span className={cacheStatsStyles.tableCellLabelText}>{entry.label}</span>
        </div>
      </td>
      <td className={cacheStatsStyles.tableCellCount}>
        {entry.stats.count.toLocaleString()}
      </td>
      <td className={cacheStatsStyles.tableCellSize}>
        {formatBytes(entry.stats.sizeBytes)}
      </td>
    </tr>
  );
}

const VIEWPORT_PADDING = 8; // Minimum distance from viewport edge

export function CacheStatsIndicator() {
  const dataset = useDataset();
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const [isHovered, setIsHovered] = useState(false);
  const [stats, setStats] = useState<DatasetMemoryStats | null>(null);
  const [cacheEntries, setCacheEntries] = useState<CacheStatsEntry[]>([]);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [adjustedLeft, setAdjustedLeft] = useState<number | null>(null);

  const sourceType = dataset.getSourceType();
  const sourceInfo = sourceType ? SOURCE_INFO[sourceType] : null;

  useEffect(() => {
    if (isHovered) {
      setStats(dataset.getMemoryStats());
      setCacheEntries(getCacheStatsEntries());
    }
  }, [isHovered, dataset]);

  // Adjust tooltip position to keep within viewport
  useLayoutEffect(() => {
    if (!isHovered || !tooltipRef.current) {
      setAdjustedLeft(null);
      return;
    }

    const rect = tooltipRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;

    // Check if tooltip overflows left edge
    if (rect.left < VIEWPORT_PADDING) {
      setAdjustedLeft(VIEWPORT_PADDING - rect.left);
    }
    // Check if tooltip overflows right edge
    else if (rect.right > viewportWidth - VIEWPORT_PADDING) {
      setAdjustedLeft(-(rect.right - (viewportWidth - VIEWPORT_PADDING)));
    }
    // No adjustment needed
    else {
      setAdjustedLeft(null);
    }
  }, [isHovered, stats]);

  // Compute totals from cache entries
  const cacheTotals = useMemo(() => {
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
  }, [cacheEntries]);

  if (!reconstruction) {
    return null;
  }

  return (
    <span
      className={cacheStatsStyles.wrapper}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Status bar indicator */}
      <span className={cacheStatsStyles.indicator}>
        <span className={`flex items-center ${sourceInfo?.color}`}>{getSourceIcon(sourceType)}</span>
        <span className={cacheStatsStyles.indicatorLabel}>Source:</span>
        <span className={cacheStatsStyles.indicatorValue}>{sourceInfo?.label ?? 'None'}</span>
      </span>

      {/* Tooltip */}
      {isHovered && stats && (
        <div
          ref={tooltipRef}
          className={cacheStatsStyles.tooltipContainer}
          style={{
            bottom: '100%',
            marginBottom: '8px',
            left: adjustedLeft !== null ? adjustedLeft : 0,
          }}
        >
          <div className={cacheStatsStyles.card}>
            {/* Header */}
            <div className={cacheStatsStyles.header}>
              <div className={cacheStatsStyles.headerTitle}>
                <span className={sourceInfo?.color}>{getSourceIcon(sourceType)}</span>
                {sourceInfo?.label} Dataset
              </div>
              <div className={cacheStatsStyles.headerLegend}>
                <span className={cacheStatsStyles.legendItem}>
                  <StatusDot strategy="memory" memoryType="js" />
                  <span className={cacheStatsStyles.legendText}>Loaded</span>
                </span>
                <span className={cacheStatsStyles.legendItem}>
                  <StatusDot strategy="memory" memoryType="wasm" />
                  <span className={cacheStatsStyles.legendText}>WASM</span>
                </span>
                <span className={cacheStatsStyles.legendItem}>
                  <StatusDot strategy="lazy" />
                  <span className={cacheStatsStyles.legendText}>Lazy</span>
                </span>
              </div>
            </div>

            {/* Table */}
            <table className={cacheStatsStyles.table}>
              <thead>
                <tr className={cacheStatsStyles.tableHeader}>
                  <th className={`${cacheStatsStyles.tableHeaderCell} ${cacheStatsStyles.tableHeaderLeft}`}>
                    Resource
                  </th>
                  <th className={`${cacheStatsStyles.tableHeaderCell} ${cacheStatsStyles.tableHeaderRight} px-2`}>
                    Count
                  </th>
                  <th className={`${cacheStatsStyles.tableHeaderCell} ${cacheStatsStyles.tableHeaderRight} pl-2`}>
                    Size
                  </th>
                </tr>
              </thead>
              <tbody>
                {/* Reconstruction data (from DatasetManager) */}
                <Row
                  label="3D Points"
                  strategy={stats.points3D.strategy}
                  memoryType={stats.points3D.memoryType}
                  count={stats.points3D.memory.count}
                  size={stats.points3D.memory.sizeFormatted}
                  available={stats.points3D.available}
                />
                <Row
                  label="2D Keypoints"
                  strategy={stats.points2D.strategy}
                  memoryType={stats.points2D.memoryType}
                  count={stats.points2D.memory.count}
                  size={stats.points2D.memory.sizeFormatted}
                  available={stats.points2D.available}
                />
                <Row
                  label="Matches"
                  strategy={stats.matches.strategy}
                  memoryType={stats.matches.memoryType}
                  count={stats.matches.memory.count}
                  size={stats.matches.memory.sizeFormatted}
                  available={stats.matches.available}
                />
                <Row
                  label={stats.rigs.available ? "Cameras/Rigs" : "Cameras"}
                  strategy={stats.cameras.strategy}
                  memoryType={stats.cameras.memoryType}
                  count={stats.cameras.memory.count + (stats.rigs.available ? stats.rigs.memory.count : 0)}
                  size={formatBytes(stats.cameras.memory.sizeBytes + (stats.rigs.available ? stats.rigs.memory.sizeBytes : 0))}
                  available={stats.cameras.available}
                />
                <Row
                  label="Camera Poses"
                  strategy={stats.imagePoses.strategy}
                  memoryType={stats.imagePoses.memoryType}
                  count={stats.imagePoses.memory.count}
                  size={stats.imagePoses.memory.sizeFormatted}
                  available={stats.imagePoses.available}
                />
                {stats.database.available && (
                  <Row
                    label="Database"
                    strategy={stats.database.strategy}
                    memoryType={stats.database.memoryType}
                    count={stats.database.memory.count}
                    size={stats.database.memory.sizeFormatted}
                    available={stats.database.available}
                  />
                )}

                {/* Caches (auto-generated from registry) */}
                {cacheEntries.map((entry) => (
                  <CacheRow key={entry.name} entry={entry} />
                ))}
              </tbody>
              <tfoot>
                {(stats.totalWasm.sizeBytes > 0 || cacheTotals.wasmBytes > 0) && (
                  <tr className={cacheStatsStyles.tableFooter}>
                    <td className={cacheStatsStyles.tableFooterCell}>
                      <span className={cacheStatsStyles.tableFooterLabel}>WASM Loaded</span>
                    </td>
                    <td className={`${cacheStatsStyles.tableFooterCell} ${cacheStatsStyles.tableCellCount}`} />
                    <td className={`${cacheStatsStyles.tableFooterCell} ${cacheStatsStyles.tableCellSize} text-amber-400`}>
                      {formatBytes(stats.totalWasm.sizeBytes + cacheTotals.wasmBytes)}
                    </td>
                  </tr>
                )}
                <tr className={cacheStatsStyles.tableFooter} style={{ borderTop: (stats.totalWasm.sizeBytes > 0 || cacheTotals.wasmBytes > 0) ? 'none' : undefined }}>
                  <td className={cacheStatsStyles.tableFooterCell}>
                    <span className={cacheStatsStyles.tableFooterLabel}>JS Loaded</span>
                  </td>
                  <td className={`${cacheStatsStyles.tableFooterCell} ${cacheStatsStyles.tableCellCount}`} />
                  <td className={`${cacheStatsStyles.tableFooterCell} ${cacheStatsStyles.tableCellSize} text-green-400`}>
                    {formatBytes(stats.totalJs.sizeBytes + cacheTotals.jsBytes)}
                  </td>
                </tr>
                {(stats.totalCached.sizeBytes > 0 || cacheTotals.lazyBytes > 0) && (
                  <tr className={cacheStatsStyles.tableFooter} style={{ borderTop: 'none' }}>
                    <td className={cacheStatsStyles.tableFooterCell}>
                      <span className={cacheStatsStyles.tableFooterLabel}>JS Lazy</span>
                    </td>
                    <td className={`${cacheStatsStyles.tableFooterCell} ${cacheStatsStyles.tableCellCount} text-blue-400`}>
                      {(stats.totalCached.count + cacheTotals.lazyCount).toLocaleString()}
                    </td>
                    <td className={`${cacheStatsStyles.tableFooterCell} ${cacheStatsStyles.tableCellSize} text-blue-400`}>
                      {formatBytes(stats.totalCached.sizeBytes + cacheTotals.lazyBytes)}
                    </td>
                  </tr>
                )}
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </span>
  );
}
