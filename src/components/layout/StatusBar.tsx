import { useReconstructionStore } from '../../store';
import { statusBarStyles } from '../../theme';
import { StatWithHistogram } from './StatWithHistogram';
import { CacheStatsIndicator } from './CacheStatsIndicator';

export function StatusBar() {
  const urlLoading = useReconstructionStore((s) => s.urlLoading);
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const wasmReconstruction = useReconstructionStore((s) => s.wasmReconstruction);

  // Use pre-computed global stats instead of computing on every render
  const globalStats = reconstruction?.globalStats;

  return (
    <footer className={statusBarStyles.container}>
      <div className={statusBarStyles.group}>
        <CacheStatsIndicator />
        {reconstruction && globalStats && (
              <>
                <StatWithHistogram
                  label="Avg Track"
                  value={globalStats.avgTrackLength.toFixed(2)}
                  type="trackLength"
                  points3D={reconstruction.points3D}
                  wasmReconstruction={wasmReconstruction}
                />
                <StatWithHistogram
                  label="Avg Reproj Error"
                  value={`${globalStats.avgError.toFixed(3)}px`}
                  type="error"
                  points3D={reconstruction.points3D}
                  wasmReconstruction={wasmReconstruction}
                />
              </>
            )}
        {!reconstruction && (
          <span>{urlLoading ? 'Loading...' : 'Drop COLMAP folder to load'}</span>
        )}
      </div>
      <div className="flex items-center gap-2 text-ds-secondary">
        <span>ColmapView by OpsiClear</span>
        <span>|</span>
        <a
          href="https://github.com/ColmapView/colmapview.github.io"
          target="_blank"
          rel="noopener noreferrer"
          className="no-underline transition-colors"
          style={{ color: 'inherit' }}
          title="Star on GitHub"
          onMouseEnter={(e) => e.currentTarget.style.color = '#facc15'}
          onMouseLeave={(e) => e.currentTarget.style.color = 'inherit'}
        >
          ★ Star on GitHub
        </a>
        <span>|</span>
        <a
          href="https://github.com/ColmapView/colmapview.github.io/issues"
          target="_blank"
          rel="noopener noreferrer"
          className="no-underline transition-colors"
          style={{ color: 'inherit' }}
          title="Report Bugs"
          onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'}
          onMouseLeave={(e) => e.currentTarget.style.color = 'inherit'}
        >
          Report Bugs
        </a>
        <span>|</span>
        <span>AGPL 3.0</span>
        <span>|</span>
        <span>Based on{' '}
          <a
            href="https://github.com/colmap/colmap"
            target="_blank"
            rel="noopener noreferrer"
            className="no-underline transition-colors"
            style={{ color: 'inherit' }}
            title="COLMAP - Structure-from-Motion and Multi-View Stereo"
            onMouseEnter={(e) => e.currentTarget.style.color = '#60a5fa'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'inherit'}
          >
            COLMAP
          </a>
        </span>
        <span>|</span>
        <span>v{__APP_VERSION__}</span>
      </div>
    </footer>
  );
}
