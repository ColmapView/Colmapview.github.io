import {
  useReconstructionStore,
  selectPointCount,
  selectImageCount,
  selectCameraCount
} from '../../store';
import { statusBarStyles } from '../../theme';

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
            <span>Points: {pointCount.toLocaleString()}</span>
            <span>Images: {imageCount.toLocaleString()}</span>
            <span>Cameras: {cameraCount.toLocaleString()}</span>
            {globalStats && (
              <>
                <span>Observations: {globalStats.totalObservations.toLocaleString()}</span>
                <span>Avg Track: {globalStats.avgTrackLength.toFixed(2)}</span>
                <span>Avg Reproj Error: {globalStats.avgError.toFixed(3)}px</span>
              </>
            )}
          </>
        ) : (
          <span>{loading ? 'Loading...' : 'Drop COLMAP folder to load'}</span>
        )}
      </div>
      <span className="text-ds-muted">
        ColmapView by OpsiClear | v{__APP_VERSION__}
      </span>
    </footer>
  );
}
