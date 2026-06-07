import { useState, useMemo } from 'react';
import type { Point3D, Point3DId } from '../../types/colmap';
import type { WasmReconstructionWrapper } from '../../wasm/reconstruction';
import { StatHistogramTooltip } from './StatHistogramTooltip';
import {
  computeHistogramFromMap,
  computeHistogramFromPsnrMetrics,
  computeHistogramFromSsimMetrics,
  computeHistogramFromWasm,
  getStatHistogramTitle,
  type PsnrHistogramMetric,
  type HistogramType,
} from './statHistogramViewModel';

export type { HistogramType } from './statHistogramViewModel';

interface StatWithHistogramProps {
  label: string;
  value: string;
  type: HistogramType;
  /** Optional points3D Map (for JS parser fallback) */
  points3D?: Map<Point3DId, Point3D>;
  /** Optional WASM reconstruction (preferred, avoids iterating Map) */
  wasmReconstruction?: WasmReconstructionWrapper | null;
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
      return computeHistogramFromWasm(wasmReconstruction, type);
    }

    // Fallback to points3D Map
    if (points3D && points3D.size > 0) {
      return computeHistogramFromMap(points3D, type);
    }

    return null;
  }, [isHovered, points3D, psnrMetrics, wasmReconstruction, type]);

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
