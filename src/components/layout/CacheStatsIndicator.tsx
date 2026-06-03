import { useState, useMemo, useRef, useLayoutEffect } from 'react';
import { useDatasetDiagnostics, type DatasetMemoryStats } from '../../dataset';
import { cacheStatsStyles } from '../../theme';
import { getCacheStatsEntries, type CacheStatsEntry } from '../../cache';
import { CacheRow, ResourceRow, SourceIcon, StatusDot } from './CacheStatsRows';
import {
  buildCacheStatsFooterTotals,
  buildDatasetResourceRows,
  computeCacheEntryTotals,
  getCacheSourceInfo,
  getCacheSourceIndicatorLabel,
  getTooltipHorizontalAdjustment,
  formatCacheBytes,
  getCacheStatsJoinedFooterRowStyle,
  getCacheStatsTooltipStyle,
} from './cacheStatsIndicatorViewModel';
import { useCacheStatsIndicatorStoreFacade } from './useCacheStatsIndicatorStoreFacade';

export function CacheStatsIndicator() {
  const diagnostics = useDatasetDiagnostics();
  const { reconstruction, hasSplatFile } = useCacheStatsIndicatorStoreFacade();
  const [isHovered, setIsHovered] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [adjustedLeft, setAdjustedLeft] = useState<number | null>(null);

  const sourceType = diagnostics.getSourceType();
  const sourceInfo = getCacheSourceInfo(sourceType);
  const sourceLabel = getCacheSourceIndicatorLabel(sourceInfo?.label, hasSplatFile);
  const stats = useMemo<DatasetMemoryStats | null>(
    () => reconstruction && isHovered ? diagnostics.getMemoryStats() : null,
    [isHovered, diagnostics, reconstruction]
  );
  const cacheEntries = useMemo<CacheStatsEntry[]>(
    () => reconstruction && isHovered ? getCacheStatsEntries() : [],
    [isHovered, reconstruction]
  );

  // Adjust tooltip position to keep within viewport
  useLayoutEffect(() => {
    if (!isHovered || !tooltipRef.current) {
      const frame = requestAnimationFrame(() => setAdjustedLeft(null));
      return () => cancelAnimationFrame(frame);
    }

    const frame = requestAnimationFrame(() => {
      if (!tooltipRef.current) {
        setAdjustedLeft(null);
        return;
      }

      const rect = tooltipRef.current.getBoundingClientRect();
      setAdjustedLeft(getTooltipHorizontalAdjustment(rect, window.innerWidth));
    });

    return () => cancelAnimationFrame(frame);
  }, [isHovered, stats]);

  const cacheTotals = useMemo(() => computeCacheEntryTotals(cacheEntries), [cacheEntries]);
  const resourceRows = useMemo(() => stats ? buildDatasetResourceRows(stats) : [], [stats]);
  const footerTotals = useMemo(
    () => stats ? buildCacheStatsFooterTotals(stats, cacheTotals) : null,
    [stats, cacheTotals]
  );

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
        <span className={`flex items-center ${sourceInfo?.color}`}><SourceIcon sourceType={sourceType} /></span>
        <span className={cacheStatsStyles.indicatorLabel}>Source:</span>
        <span className={cacheStatsStyles.indicatorValue}>{sourceLabel}</span>
      </span>

      {/* Tooltip */}
      {isHovered && stats && footerTotals && (
        <div
          ref={tooltipRef}
          className={cacheStatsStyles.tooltipContainer}
          style={getCacheStatsTooltipStyle(adjustedLeft)}
        >
          <div className={cacheStatsStyles.card}>
            {/* Header */}
            <div className={cacheStatsStyles.header}>
              <div className={cacheStatsStyles.headerTitle}>
                <span className={sourceInfo?.color}><SourceIcon sourceType={sourceType} /></span>
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
                {resourceRows.map((row) => (
                  <ResourceRow key={row.label} row={row} />
                ))}

                {/* Caches (auto-generated from registry) */}
                {cacheEntries.map((entry) => (
                  <CacheRow key={entry.name} entry={entry} />
                ))}
              </tbody>
              <tfoot>
                {footerTotals.showWasm && (
                  <tr className={cacheStatsStyles.tableFooter}>
                    <td className={cacheStatsStyles.tableFooterCell}>
                      <span className={cacheStatsStyles.tableFooterLabel}>WASM Loaded</span>
                    </td>
                    <td className={`${cacheStatsStyles.tableFooterCell} ${cacheStatsStyles.tableCellCount}`} />
                    <td className={`${cacheStatsStyles.tableFooterCell} ${cacheStatsStyles.tableCellSize} text-amber-400`}>
                      {formatCacheBytes(footerTotals.loadedWasmBytes)}
                    </td>
                  </tr>
                )}
                <tr
                  className={cacheStatsStyles.tableFooter}
                  style={getCacheStatsJoinedFooterRowStyle(footerTotals.showWasm)}
                >
                  <td className={cacheStatsStyles.tableFooterCell}>
                    <span className={cacheStatsStyles.tableFooterLabel}>JS Loaded</span>
                  </td>
                  <td className={`${cacheStatsStyles.tableFooterCell} ${cacheStatsStyles.tableCellCount}`} />
                  <td className={`${cacheStatsStyles.tableFooterCell} ${cacheStatsStyles.tableCellSize} text-green-400`}>
                    {formatCacheBytes(footerTotals.loadedJsBytes)}
                  </td>
                </tr>
                {footerTotals.showLazy && (
                  <tr
                    className={cacheStatsStyles.tableFooter}
                    style={getCacheStatsJoinedFooterRowStyle(true)}
                  >
                    <td className={cacheStatsStyles.tableFooterCell}>
                      <span className={cacheStatsStyles.tableFooterLabel}>JS Lazy</span>
                    </td>
                    <td className={`${cacheStatsStyles.tableFooterCell} ${cacheStatsStyles.tableCellCount} text-blue-400`}>
                      {footerTotals.lazyJsCount.toLocaleString()}
                    </td>
                    <td className={`${cacheStatsStyles.tableFooterCell} ${cacheStatsStyles.tableCellSize} text-blue-400`}>
                      {formatCacheBytes(footerTotals.lazyJsBytes)}
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
