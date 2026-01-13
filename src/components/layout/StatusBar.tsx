import { useMemo } from 'react';
import {
  useReconstructionStore,
  selectPointCount,
  selectImageCount,
  selectCameraCount
} from '../../store';

export function StatusBar() {
  const loading = useReconstructionStore((s) => s.loading);
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const pointCount = useReconstructionStore(selectPointCount);
  const imageCount = useReconstructionStore(selectImageCount);
  const cameraCount = useReconstructionStore(selectCameraCount);

  // Calculate additional statistics
  const stats = useMemo(() => {
    if (!reconstruction) return null;

    const points = Array.from(reconstruction.points3D.values());
    if (points.length === 0) return null;

    let sumError = 0;
    let errorCount = 0;
    let sumTrack = 0;
    let totalObservations = 0;

    for (const p of points) {
      if (p.error >= 0) {
        sumError += p.error;
        errorCount++;
      }
      sumTrack += p.track.length;
      totalObservations += p.track.length;
    }

    return {
      avgError: errorCount > 0 ? sumError / errorCount : 0,
      avgTrack: sumTrack / points.length,
      observations: totalObservations,
    };
  }, [reconstruction]);

  return (
    <footer className="h-10 border-t border-ds bg-ds-secondary text-ds-secondary text-base px-4 flex items-center gap-6">
      {reconstruction ? (
        <>
          <span>Points: {pointCount.toLocaleString()}</span>
          <span>Images: {imageCount.toLocaleString()}</span>
          <span>Cameras: {cameraCount.toLocaleString()}</span>
          {stats && (
            <>
              <span>Observations: {stats.observations.toLocaleString()}</span>
              <span>Avg Track: {stats.avgTrack.toFixed(2)}</span>
              <span>Avg Reproj Error: {stats.avgError.toFixed(3)}px</span>
            </>
          )}
        </>
      ) : (
        <span>{loading ? 'Loading...' : 'Drop COLMAP folder to load'}</span>
      )}
    </footer>
  );
}
