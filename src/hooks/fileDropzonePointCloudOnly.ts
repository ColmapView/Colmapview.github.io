import type { LoadedFiles, Point3D, Point3DId, Reconstruction } from '../types/colmap';
import { parsePointCloudPlyFile } from '../parsers';
import { createEmptyReconstruction } from '../utils/fileClassification';
import { appLogger } from '../utils/logger';

interface ProgressUpdate {
  percent: number;
  message: string;
  currentFile?: string;
}

interface RunPointCloudOnlyLoadOptions {
  pointCloudFile: File;
  mapProgress: (localPercent: number) => number;
  setUrlProgress: (progress: ProgressUpdate) => void;
  setLoadedFiles: (files: LoadedFiles) => void;
  clearSplatPsnr?: () => void;
  clearCaches: (options: { preserveZip: true }) => void;
  setReconstruction: (reconstruction: Reconstruction) => void;
  resetView: () => void;
  parsePointCloudFile?: typeof parsePointCloudPlyFile;
  addNotification: (type: 'info', message: string, duration?: number) => void;
  log?: (message: string) => void;
}

export async function runPointCloudOnlyLoad({
  pointCloudFile,
  mapProgress,
  setUrlProgress,
  setLoadedFiles,
  clearSplatPsnr,
  clearCaches,
  setReconstruction,
  resetView,
  parsePointCloudFile = parsePointCloudPlyFile,
  addNotification,
  log = appLogger.info,
}: RunPointCloudOnlyLoadOptions): Promise<Reconstruction> {
  log(`[PointCloud] Creating point-cloud scene from ${pointCloudFile.name}`);

  setUrlProgress({
    percent: mapProgress(50),
    message: 'Loading point cloud...',
    currentFile: pointCloudFile.name,
  });

  const points3D = await parsePointCloudFile(pointCloudFile);
  const reconstruction = createPointCloudOnlyReconstruction(points3D);

  clearSplatPsnr?.();
  setLoadedFiles({
    camerasFile: undefined,
    imagesFile: undefined,
    points3DFile: pointCloudFile,
    splatFile: undefined,
    splatFiles: [],
    splatFileSources: [],
    databaseFile: undefined,
    rigsFile: undefined,
    framesFile: undefined,
    imageFiles: new Map(),
    hasMasks: false,
  });

  clearCaches({ preserveZip: true });

  setUrlProgress({
    percent: mapProgress(95),
    message: 'Finalizing point cloud...',
    currentFile: pointCloudFile.name,
  });
  setReconstruction(reconstruction);
  resetView();
  addNotification('info', `Loaded ${points3D.size.toLocaleString()} points`, 5000);

  log(`[PointCloud] Loaded ${points3D.size.toLocaleString()} points from ${pointCloudFile.name}`);

  return reconstruction;
}

export function createPointCloudOnlyReconstruction(
  points3D: Map<Point3DId, Point3D>
): Reconstruction {
  const reconstruction = createEmptyReconstruction();
  reconstruction.points3D = points3D;
  reconstruction.globalStats = {
    minError: 0,
    maxError: 0,
    avgError: 0,
    minTrackLength: 0,
    maxTrackLength: 0,
    avgTrackLength: 0,
    totalObservations: 0,
    totalPoints: points3D.size,
  };
  return reconstruction;
}
