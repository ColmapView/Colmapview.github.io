import type { Camera, Image, Reconstruction } from '../../types/colmap';
import { CAMERA_MODEL_COLMAP_NAMES, CAMERA_MODEL_NAMES } from '../../utils/cameraModelNames';

export type DataPanelTabId = 'cameras' | 'images' | 'points';

export interface DataPanelTab {
  id: DataPanelTabId;
  label: string;
}

export interface DataPanelCameraRow {
  cameraId: Camera['cameraId'];
  modelId: Camera['modelId'];
  modelName: string;
  colmapModelName: string;
  size: string;
  focal: string | undefined;
}

export interface DataPanelImageRow {
  imageId: Image['imageId'];
  name: string;
  cameraId: Image['cameraId'];
  pointCount: number;
}

export interface DataPanelPointStatCard {
  label: string;
  value: string;
}

export const DATA_PANEL_TABS: DataPanelTab[] = [
  { id: 'cameras', label: 'Cameras' },
  { id: 'images', label: 'Images' },
  { id: 'points', label: 'Points' },
];

export const DATA_PANEL_IMAGE_LIMIT = 100;

export function getDataPanelCameraRows(
  reconstruction: Reconstruction | null | undefined
): DataPanelCameraRow[] {
  if (!reconstruction) {
    return [];
  }

  return Array.from(reconstruction.cameras.values()).map((camera) => ({
    cameraId: camera.cameraId,
    modelId: camera.modelId,
    modelName: CAMERA_MODEL_NAMES[camera.modelId] ?? `Unknown (${camera.modelId})`,
    colmapModelName: CAMERA_MODEL_COLMAP_NAMES[camera.modelId] ?? `MODEL_${camera.modelId}`,
    size: `${camera.width}x${camera.height}`,
    focal: camera.params[0]?.toFixed(2),
  }));
}

export function getDataPanelImageRows(
  reconstruction: Reconstruction | null | undefined,
  limit = DATA_PANEL_IMAGE_LIMIT
): DataPanelImageRow[] {
  if (!reconstruction) {
    return [];
  }

  return Array.from(reconstruction.images.values())
    .slice(0, limit)
    .map((image) => ({
      imageId: image.imageId,
      name: image.name,
      cameraId: image.cameraId,
      pointCount: image.numPoints2D ?? image.points2D.length,
    }));
}

export function getDataPanelImageLimitMessage(
  reconstruction: Reconstruction | null | undefined,
  limit = DATA_PANEL_IMAGE_LIMIT
): string | null {
  const imageCount = reconstruction?.images.size ?? 0;
  if (imageCount <= limit) {
    return null;
  }

  return `Showing ${limit} of ${imageCount} images`;
}

export function getDataPanelPointStatCards(
  reconstruction: Reconstruction | null | undefined
): DataPanelPointStatCard[] {
  const globalStats = reconstruction?.globalStats;

  if (!globalStats || globalStats.totalPoints === 0) {
    return [];
  }

  return [
    { label: 'Total Points', value: globalStats.totalPoints.toLocaleString() },
    { label: 'Avg Track Length', value: globalStats.avgTrackLength.toFixed(2) },
    { label: 'Min Track Length', value: globalStats.minTrackLength.toString() },
    { label: 'Max Track Length', value: globalStats.maxTrackLength.toString() },
    { label: 'Avg Error (px)', value: globalStats.avgError.toFixed(3) },
    { label: 'Max Error (px)', value: globalStats.maxError.toFixed(3) },
  ];
}
