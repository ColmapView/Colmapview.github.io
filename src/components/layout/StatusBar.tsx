import {
  useReconstructionStore,
  selectPointCount,
  selectImageCount,
  selectCameraCount
} from '../../store';
import { statusBarStyles } from '../../theme';
import { StatWithHistogram } from './StatWithHistogram';

export function StatusBar() {
  const loading = useReconstructionStore((s) => s.loading);
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const pointCount = useReconstructionStore(selectPointCount);
  const imageCount = useReconstructionStore(selectImageCount);
  const cameraCount = useReconstructionStore(selectCameraCount);

  // Use pre-computed global stats instead of computing on every render
  const globalStats = reconstruction?.globalStats;

  return (
    <footer className={statusBarStyles.container}>
      <div className={statusBarStyles.group}>
        {reconstruction ? (
          <>
            <span>Points: <span className="text-ds-primary">{pointCount.toLocaleString()}</span></span>
            <span>Images: <span className="text-ds-primary">{imageCount.toLocaleString()}</span></span>
            <span>Cameras: <span className="text-ds-primary">{cameraCount.toLocaleString()}</span></span>
            {globalStats && (
              <>
                <span>Observations: <span className="text-ds-primary">{globalStats.totalObservations.toLocaleString()}</span></span>
                <StatWithHistogram
                  label="Avg Track"
                  value={globalStats.avgTrackLength.toFixed(2)}
                  type="trackLength"
                  points3D={reconstruction.points3D}
                />
                <StatWithHistogram
                  label="Avg Reproj Error"
                  value={`${globalStats.avgError.toFixed(3)}px`}
                  type="error"
                  points3D={reconstruction.points3D}
                />
              </>
            )}
          </>
        ) : (
          <span>{loading ? 'Loading...' : 'Drop COLMAP folder to load'}</span>
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
        <span>v{__APP_VERSION__}</span>
      </div>
    </footer>
  );
}
