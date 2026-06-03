import { useMemo, useState } from 'react';
import { inputStyles, tableStyles } from '../../theme';
import {
  DATA_PANEL_TABS,
  getDataPanelCameraRows,
  getDataPanelImageLimitMessage,
  getDataPanelImageRows,
  getDataPanelPointStatCards,
  type DataPanelTabId,
} from './dataPanelViewModel';
import {
  useDataPanelStoreFacade,
  type DataPanelReconstruction,
} from './useDataPanelStoreFacade';

const compactTableClass = `${tableStyles.table} table-fixed text-xs`;
const compactHeaderCellClass = `${tableStyles.headerCell} px-2 py-1 font-medium whitespace-nowrap`;
const compactCellClass = `${tableStyles.cell} px-2 py-1 align-middle`;

export function DataPanel() {
  const { reconstruction } = useDataPanelStoreFacade();
  const [activeTab, setActiveTab] = useState<DataPanelTabId>('cameras');

  if (!reconstruction) {
    return (
      <div className="h-full flex items-center justify-center text-ds-muted">
        Load COLMAP data to view details
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-ds px-2 py-1 bg-ds-secondary">
        <label htmlFor="data-panel-section" className="sr-only">
          Data section
        </label>
        <select
          id="data-panel-section"
          value={activeTab}
          onChange={(event) => setActiveTab(event.target.value as DataPanelTabId)}
          className={`${inputStyles.select} ${inputStyles.selectSizes.xs} w-full`}
        >
          {DATA_PANEL_TABS.map((tab) => (
            <option key={tab.id} value={tab.id}>
              {tab.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex-1 overflow-auto">
        {activeTab === 'cameras' && <CamerasTable reconstruction={reconstruction} />}
        {activeTab === 'images' && <ImagesTable reconstruction={reconstruction} />}
        {activeTab === 'points' && <PointsInfo reconstruction={reconstruction} />}
      </div>
    </div>
  );
}

function CamerasTable({ reconstruction }: { reconstruction: DataPanelReconstruction }) {
  const cameras = useMemo(() => getDataPanelCameraRows(reconstruction), [reconstruction]);

  return (
    <table className={compactTableClass}>
      <colgroup>
        <col className="w-14" />
        <col />
        <col className="w-24" />
        <col className="w-20" />
      </colgroup>
      <thead className={tableStyles.header}>
        <tr>
          <th className={compactHeaderCellClass}>ID</th>
          <th className={compactHeaderCellClass}>Model</th>
          <th className={compactHeaderCellClass}>Size</th>
          <th className={compactHeaderCellClass}>Focal</th>
        </tr>
      </thead>
      <tbody>
        {cameras.map((camera) => (
          <tr key={camera.cameraId} className={tableStyles.row}>
            <td className={compactCellClass}>{camera.cameraId}</td>
            <td
              className={`${compactCellClass} truncate`}
              title={`${camera.colmapModelName} (${camera.modelId})`}
            >
              {camera.modelName}
            </td>
            <td className={compactCellClass}>{camera.size}</td>
            <td className={compactCellClass}>{camera.focal}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ImagesTable({ reconstruction }: { reconstruction: DataPanelReconstruction }) {
  const images = useMemo(() => getDataPanelImageRows(reconstruction), [reconstruction]);
  const limitMessage = getDataPanelImageLimitMessage(reconstruction);

  return (
    <div>
      <table className={compactTableClass}>
        <colgroup>
          <col className="w-14" />
          <col />
          <col className="w-16" />
          <col className="w-16" />
        </colgroup>
        <thead className={tableStyles.header}>
          <tr>
            <th className={compactHeaderCellClass}>ID</th>
            <th className={compactHeaderCellClass}>Name</th>
            <th className={compactHeaderCellClass}>Camera</th>
            <th className={compactHeaderCellClass}>Points</th>
          </tr>
        </thead>
        <tbody>
          {images.map((image) => (
            <tr key={image.imageId} className={tableStyles.row}>
              <td className={compactCellClass}>{image.imageId}</td>
              <td className={`${compactCellClass} ${tableStyles.cellTruncate}`} title={image.name}>
                {image.name}
              </td>
              <td className={compactCellClass}>{image.cameraId}</td>
              <td className={compactCellClass}>{image.pointCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {limitMessage && (
        <div className="text-center text-ds-muted text-xs py-1">
          {limitMessage}
        </div>
      )}
    </div>
  );
}

function PointsInfo({ reconstruction }: { reconstruction: DataPanelReconstruction }) {
  const statCards = getDataPanelPointStatCards(reconstruction);

  if (statCards.length === 0) {
    return <div className="px-2 py-1 text-xs text-ds-muted">No points data</div>;
  }

  return (
    <table className={compactTableClass}>
      <colgroup>
        <col />
        <col className="w-28" />
      </colgroup>
      <thead className={tableStyles.header}>
        <tr>
          <th className={compactHeaderCellClass}>Metric</th>
          <th className={compactHeaderCellClass}>Value</th>
        </tr>
      </thead>
      <tbody>
        {statCards.map((statCard) => (
          <tr key={statCard.label} className={tableStyles.row}>
            <td className={compactCellClass}>{statCard.label}</td>
            <td className={`${compactCellClass} tabular-nums`}>{statCard.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
