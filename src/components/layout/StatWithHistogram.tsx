import { useState, useMemo, useEffect } from 'react';
import type { Point3D, Point3DId } from '../../types/colmap';
import type { ReconstructionSource } from '../../wasm/reconstructionService';
import { isReconstructionSnapshot } from '../../wasm/reconstructionService';
import { appLogger } from '../../utils/logger';
import { StatHistogramTooltip } from './StatHistogramTooltip';
import {
  computeHistogramFromMap,
  computeHistogramFromPsnrMetrics,
  computeHistogramFromSsimMetrics,
  computeHistogramFromWasm,
  getStatHistogramTitle,
  type PsnrHistogramMetric,
  type HistogramType,
  type HistogramData,
} from './statHistogramViewModel';

export type { HistogramType } from './statHistogramViewModel';

interface StatWithHistogramProps {
  label: string;
  value: string;
  type: HistogramType;
  /** Optional points3D Map (for JS parser fallback) */
  points3D?: Map<Point3DId, Point3D>;
  /** Optional WASM reconstruction (preferred, avoids iterating Map) */
  wasmReconstruction?: ReconstructionSource | null;
  /** Optional PSNR metrics for splat/image comparison histogram */
  psnrMetrics?: ReadonlyMap<number, PsnrHistogramMetric>;
  /** Total image count used for image metric histogram coverage labels */
  psnrTotalCount?: number;
}

export function StatWithHistogram({
  label,
  value,
  type,
  points3D,
  wasmReconstruction,
  psnrMetrics,
  psnrTotalCount,
}: StatWithHistogramProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [remote, setRemote] = useState<{ generation: number; revision: number; type: HistogramType; result: HistogramData } | null>(null);
  const snapshot = isReconstructionSnapshot(wasmReconstruction) ? wasmReconstruction : null;
  const remoteMatches = snapshot && remote?.generation === snapshot.service.generation && remote.revision === snapshot.revision && remote.type === type;
  useEffect(() => {
    if (!isHovered || !snapshot || remoteMatches || type === 'psnr' || type === 'ssim') return;
    const controller = new AbortController();
    void snapshot.histogram(type, controller.signal).then(result => {
      if (!controller.signal.aborted) setRemote({ generation: snapshot.service.generation, revision: snapshot.revision, type, result });
    }).catch(error => { if (!controller.signal.aborted) appLogger.warn('Histogram computation failed:', error); });
    return () => controller.abort();
  }, [isHovered, snapshot, type, remoteMatches]);

  // Lazily compute histogram only when hovered (and cache it)
  // Prefer WASM arrays over points3D Map for better performance
  const histogramData = useMemo(() => {
    if (!isHovered) return null;

    if (type === 'psnr') {
      return psnrMetrics && psnrMetrics.size > 0
        ? computeHistogramFromPsnrMetrics(psnrMetrics)
        : null;
    }

    if (type === 'ssim') {
      return psnrMetrics && psnrMetrics.size > 0
        ? computeHistogramFromSsimMetrics(psnrMetrics)
        : null;
    }

    // Prefer WASM arrays if available
    if (wasmReconstruction?.hasPoints()) {
      if (snapshot) return remoteMatches ? remote!.result : null;
      return computeHistogramFromWasm(wasmReconstruction, type);
    }

    // Fallback to points3D Map
    if (points3D && points3D.size > 0) {
      return computeHistogramFromMap(points3D, type);
    }

    return null;
  }, [isHovered, points3D, psnrMetrics, wasmReconstruction, type, snapshot, remoteMatches, remote]);

  return (
    <span
      className="relative cursor-help overflow-visible"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {label}: <span className="text-ds-primary">{value}</span>
      {isHovered && histogramData && (
        <StatHistogramTooltip
          title={getStatHistogramTitle(type, {
            sampleCount: type === 'psnr' || type === 'ssim' ? histogramData.total : null,
            totalCount: type === 'psnr' || type === 'ssim' ? psnrTotalCount : null,
          })}
          bins={histogramData.bins}
        />
      )}
    </span>
  );
}
