import type { CacheStatsEntry } from '../../cache';
import type { LoadStrategy, MemoryType } from '../../dataset';
import { cacheStatsStyles } from '../../theme';
import {
  formatCacheBytes,
  getEffectiveResourceStrategy,
  type CacheStatsResourceRow,
} from './cacheStatsIndicatorViewModel';

export function SourceIcon({ sourceType, className = '' }: { sourceType: string | null; className?: string }) {
  switch (sourceType) {
    case 'local': return <FolderIcon className={className} />;
    case 'url': return <LinkIcon className={className} />;
    case 'manifest': return <FileTextIcon className={className} />;
    case 'zip': return <ArchiveIcon className={className} />;
    default: return <FolderIcon className={className} />;
  }
}

export function StatusDot({
  strategy,
  memoryType = 'js',
}: {
  strategy: LoadStrategy;
  memoryType?: MemoryType;
}) {
  if (strategy === 'lazy') {
    return <span className={cacheStatsStyles.dotLazy} />;
  }
  if (strategy === 'unavailable') {
    return <span className={cacheStatsStyles.dotUnavailable} />;
  }
  return <span className={memoryType === 'wasm' ? cacheStatsStyles.dotMemoryWasm : cacheStatsStyles.dotMemoryJs} />;
}

export function ResourceRow({ row }: { row: CacheStatsResourceRow }) {
  const effectiveStrategy = getEffectiveResourceStrategy(row.available, row.strategy);
  const rowClass = row.available ? '' : cacheStatsStyles.tableRowDimmed;

  return (
    <tr className={rowClass}>
      <td className={cacheStatsStyles.tableCellLabel}>
        <div className={cacheStatsStyles.tableCellLabelInner}>
          <StatusDot strategy={effectiveStrategy} memoryType={row.memoryType} />
          <span className={cacheStatsStyles.tableCellLabelText}>{row.label}</span>
        </div>
      </td>
      <td className={cacheStatsStyles.tableCellCount}>
        {row.available ? row.count.toLocaleString() : '-'}
      </td>
      <td className={cacheStatsStyles.tableCellSize}>
        {row.available ? row.size : '-'}
      </td>
    </tr>
  );
}

export function CacheRow({ entry }: { entry: CacheStatsEntry }) {
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
        {formatCacheBytes(entry.stats.sizeBytes)}
      </td>
    </tr>
  );
}

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
