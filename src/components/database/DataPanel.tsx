import { useMemo, useState } from 'react';
import { useReconstructionStore } from '../../store';

type TabId = 'cameras' | 'images' | 'points';

export function DataPanel() {
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const [activeTab, setActiveTab] = useState<TabId>('cameras');

  if (!reconstruction) {
    return (
      <div className="h-full flex items-center justify-center text-ds-muted">
        Load COLMAP data to view details
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Tabs */}
      <div className="flex border-b border-ds">
        {(['cameras', 'images', 'points'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`
              px-4 py-2 text-base font-medium transition-colors
              ${activeTab === tab
                ? 'text-ds-accent border-b-2 border-ds-accent bg-ds-tertiary'
                : 'text-ds-secondary hover:text-ds-primary hover:bg-ds-tertiary/50'
              }
            `}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'cameras' && <CamerasTable />}
        {activeTab === 'images' && <ImagesTable />}
        {activeTab === 'points' && <PointsInfo />}
      </div>
    </div>
  );
}

function CamerasTable() {
  const reconstruction = useReconstructionStore((s) => s.reconstruction);

  const cameras = useMemo(() => {
    if (!reconstruction) return [];
    return Array.from(reconstruction.cameras.values());
  }, [reconstruction]);

  return (
    <table className="w-full text-base">
      <thead className="bg-ds-tertiary sticky top-0">
        <tr>
          <th className="text-left px-3 py-2 text-ds-secondary">ID</th>
          <th className="text-left px-3 py-2 text-ds-secondary">Model</th>
          <th className="text-left px-3 py-2 text-ds-secondary">Size</th>
          <th className="text-left px-3 py-2 text-ds-secondary">Focal</th>
        </tr>
      </thead>
      <tbody>
        {cameras.map((cam) => (
          <tr key={cam.cameraId} className="border-b border-ds-subtle hover:bg-ds-tertiary/50">
            <td className="px-3 py-2 text-ds-primary">{cam.cameraId}</td>
            <td className="px-3 py-2 text-ds-primary">{cam.modelId}</td>
            <td className="px-3 py-2 text-ds-primary">{cam.width}x{cam.height}</td>
            <td className="px-3 py-2 text-ds-primary">{cam.params[0]?.toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ImagesTable() {
  const reconstruction = useReconstructionStore((s) => s.reconstruction);

  const images = useMemo(() => {
    if (!reconstruction) return [];
    return Array.from(reconstruction.images.values()).slice(0, 100); // Limit for performance
  }, [reconstruction]);

  return (
    <div>
      <table className="w-full text-base">
        <thead className="bg-ds-tertiary sticky top-0">
          <tr>
            <th className="text-left px-3 py-2 text-ds-secondary">ID</th>
            <th className="text-left px-3 py-2 text-ds-secondary">Name</th>
            <th className="text-left px-3 py-2 text-ds-secondary">Camera</th>
            <th className="text-left px-3 py-2 text-ds-secondary">Points</th>
          </tr>
        </thead>
        <tbody>
          {images.map((img) => (
            <tr key={img.imageId} className="border-b border-ds-subtle hover:bg-ds-tertiary/50">
              <td className="px-3 py-2 text-ds-primary">{img.imageId}</td>
              <td className="px-3 py-2 text-ds-primary truncate max-w-[200px]" title={img.name}>
                {img.name}
              </td>
              <td className="px-3 py-2 text-ds-primary">{img.cameraId}</td>
              <td className="px-3 py-2 text-ds-primary">{img.points2D.length}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {reconstruction && reconstruction.images.size > 100 && (
        <div className="text-center text-ds-muted text-base py-2">
          Showing 100 of {reconstruction.images.size} images
        </div>
      )}
    </div>
  );
}

function PointsInfo() {
  const reconstruction = useReconstructionStore((s) => s.reconstruction);

  const stats = useMemo(() => {
    if (!reconstruction) return null;

    const points = Array.from(reconstruction.points3D.values());
    if (points.length === 0) return null;

    let minError = Infinity, maxError = -Infinity, sumError = 0;
    let minTrack = Infinity, maxTrack = -Infinity, sumTrack = 0;
    let errorCount = 0;

    for (const p of points) {
      if (p.error >= 0) {
        minError = Math.min(minError, p.error);
        maxError = Math.max(maxError, p.error);
        sumError += p.error;
        errorCount++;
      }
      minTrack = Math.min(minTrack, p.track.length);
      maxTrack = Math.max(maxTrack, p.track.length);
      sumTrack += p.track.length;
    }

    return {
      count: points.length,
      minError: errorCount > 0 ? minError : 0,
      maxError: errorCount > 0 ? maxError : 0,
      avgError: errorCount > 0 ? sumError / errorCount : 0,
      minTrack,
      maxTrack,
      avgTrack: sumTrack / points.length,
    };
  }, [reconstruction]);

  if (!stats) {
    return <div className="p-4 text-ds-muted">No points data</div>;
  }

  return (
    <div className="p-4 space-y-4">
      <h3 className="font-semibold text-ds-primary">Point Cloud Statistics</h3>

      <div className="grid grid-cols-2 gap-4">
        <StatCard label="Total Points" value={stats.count.toLocaleString()} />
        <StatCard label="Avg Track Length" value={stats.avgTrack.toFixed(2)} />
        <StatCard label="Min Track Length" value={stats.minTrack.toString()} />
        <StatCard label="Max Track Length" value={stats.maxTrack.toString()} />
        <StatCard label="Avg Error (px)" value={stats.avgError.toFixed(3)} />
        <StatCard label="Max Error (px)" value={stats.maxError.toFixed(3)} />
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-ds-tertiary rounded p-3">
      <div className="text-ds-secondary text-base">{label}</div>
      <div className="text-ds-primary text-lg font-semibold">{value}</div>
    </div>
  );
}
