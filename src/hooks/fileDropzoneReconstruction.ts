import {
  computeImageStats,
  computeImageStatsFromWasm,
} from '../parsers';
import type { Point3D, Reconstruction } from '../types/colmap';
import type { ColmapParseResult } from './fileDropzoneColmapParser';
import { loadOptionalRigData } from './fileDropzoneRigData';

export interface ColmapReconstructionStatsComputers {
  computeImageStats: typeof computeImageStats;
  computeImageStatsFromWasm: typeof computeImageStatsFromWasm;
}

export interface BuildColmapReconstructionOptions {
  parseResult: ColmapParseResult;
  rigsFile?: File;
  framesFile?: File;
  statsComputers?: ColmapReconstructionStatsComputers;
  loadRigData?: typeof loadOptionalRigData;
  afterStatsComputed?: () => void;
}

export interface BuildColmapReconstructionResult {
  reconstruction: Reconstruction;
  pointCount: number;
}

const defaultStatsComputers: ColmapReconstructionStatsComputers = {
  computeImageStats,
  computeImageStatsFromWasm,
};

export async function buildColmapReconstruction({
  parseResult,
  rigsFile,
  framesFile,
  statsComputers = defaultStatsComputers,
  loadRigData = loadOptionalRigData,
  afterStatsComputed,
}: BuildColmapReconstructionOptions): Promise<BuildColmapReconstructionResult> {
  const stats = parseResult.usedWasmPath && parseResult.wasmWrapper
    ? statsComputers.computeImageStatsFromWasm(parseResult.images, parseResult.wasmWrapper)
    : statsComputers.computeImageStats(parseResult.images, requirePoints3D(parseResult.points3D));

  afterStatsComputed?.();

  const rigData = await loadRigData({
    wasmRigData: parseResult.wasmRigData,
    rigsFile,
    framesFile,
  });

  return {
    reconstruction: {
      cameras: parseResult.cameras,
      images: parseResult.images,
      ...(parseResult.points3D && { points3D: parseResult.points3D }),
      imageStats: stats.imageStats,
      connectedImagesIndex: stats.connectedImagesIndex,
      globalStats: stats.globalStats,
      imageToPoint3DIds: stats.imageToPoint3DIds,
      rigData,
    },
    pointCount: getColmapPointCount(parseResult),
  };
}

export function getColmapPointCount({
  wasmWrapper,
  points3D,
}: Pick<ColmapParseResult, 'wasmWrapper' | 'points3D'>): number {
  return wasmWrapper?.pointCount ?? points3D?.size ?? 0;
}

function requirePoints3D(points3D: Map<bigint, Point3D> | undefined): Map<bigint, Point3D> {
  if (!points3D) {
    throw new Error('COLMAP parser returned no points3D map for JS stats computation');
  }
  return points3D;
}
