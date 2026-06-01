import type { Point3D, Point3DId, Reconstruction } from '../types/colmap';
import { appLogger } from '../utils/logger';
import type { WasmReconstructionWrapper } from '../wasm/reconstruction';

export type ExportPointSource = Pick<WasmReconstructionWrapper, 'buildPoints3DMap' | 'hasPoints'>;

/**
 * Get points3D for export, building them on demand from WASM when JS memory
 * only contains lightweight reconstruction data.
 */
export function getPoints3DForExport(
  reconstruction: Reconstruction,
  wasmReconstruction?: ExportPointSource | null
): Map<Point3DId, Point3D> {
  if (reconstruction.points3D && reconstruction.points3D.size > 0) {
    return reconstruction.points3D;
  }

  if (wasmReconstruction?.hasPoints()) {
    appLogger.info('[Export] Building points3D Map on-demand from WASM...');
    const startTime = performance.now();
    const points3D = wasmReconstruction.buildPoints3DMap();
    const elapsed = performance.now() - startTime;
    appLogger.info(`[Export] Built ${points3D.size.toLocaleString()} points in ${elapsed.toFixed(0)}ms`);
    return points3D;
  }

  appLogger.warn('[Export] No points3D data available for export');
  return new Map();
}
