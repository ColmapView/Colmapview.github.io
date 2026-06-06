import type { CacheStatsEntry } from '../../cache';
import type { LoadStrategy, MemoryType } from '../../dataset';
import { cacheStatsStyles } from '../../theme';
import {
  formatCacheBytes,
  getEffectiveResourceStrategy,
  type CacheStatsResourceRow,
} from './cacheStatsIndicatorViewModel';

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
