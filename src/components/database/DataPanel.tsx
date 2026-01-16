import { useMemo, useState } from 'react';
import { useReconstructionStore } from '../../store';
import { tabStyles, tableStyles, cardStyles } from '../../theme';

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
      <div className={tabStyles.container}>
        {(['cameras', 'images', 'points'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={activeTab === tab ? tabStyles.tabActive : tabStyles.tab}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

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
    <table className={tableStyles.table}>
      <thead className={tableStyles.header}>
        <tr>
          <th className={tableStyles.headerCell}>ID</th>
          <th className={tableStyles.headerCell}>Model</th>
          <th className={tableStyles.headerCell}>Size</th>
          <th className={tableStyles.headerCell}>Focal</th>
        </tr>
      </thead>
      <tbody>
        {cameras.map((cam) => (
          <tr key={cam.cameraId} className={tableStyles.row}>
            <td className={tableStyles.cell}>{cam.cameraId}</td>
            <td className={tableStyles.cell}>{cam.modelId}</td>
            <td className={tableStyles.cell}>{cam.width}x{cam.height}</td>
            <td className={tableStyles.cell}>{cam.params[0]?.toFixed(2)}</td>
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
      <table className={tableStyles.table}>
        <thead className={tableStyles.header}>
          <tr>
            <th className={tableStyles.headerCell}>ID</th>
            <th className={tableStyles.headerCell}>Name</th>
            <th className={tableStyles.headerCell}>Camera</th>
            <th className={tableStyles.headerCell}>Points</th>
          </tr>
        </thead>
        <tbody>
          {images.map((img) => (
            <tr key={img.imageId} className={tableStyles.row}>
              <td className={tableStyles.cell}>{img.imageId}</td>
              <td className={`${tableStyles.cell} ${tableStyles.cellTruncate}`} title={img.name}>
                {img.name}
              </td>
              <td className={tableStyles.cell}>{img.cameraId}</td>
              <td className={tableStyles.cell}>{img.points2D.length}</td>
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

  // Use pre-computed global stats instead of computing on every render
  const globalStats = reconstruction?.globalStats;

  if (!globalStats || globalStats.totalPoints === 0) {
    return <div className="p-4 text-ds-muted">No points data</div>;
  }

  return (
    <div className="p-4 space-y-4">
      <h3 className="font-semibold text-ds-primary">Point Cloud Statistics</h3>

      <div className="grid grid-cols-2 gap-4">
        <StatCard label="Total Points" value={globalStats.totalPoints.toLocaleString()} />
        <StatCard label="Avg Track Length" value={globalStats.avgTrackLength.toFixed(2)} />
        <StatCard label="Min Track Length" value={globalStats.minTrackLength.toString()} />
        <StatCard label="Max Track Length" value={globalStats.maxTrackLength.toString()} />
        <StatCard label="Avg Error (px)" value={globalStats.avgError.toFixed(3)} />
        <StatCard label="Max Error (px)" value={globalStats.maxError.toFixed(3)} />
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className={cardStyles.container}>
      <div className={cardStyles.label}>{label}</div>
      <div className={cardStyles.value}>{value}</div>
    </div>
  );
}
