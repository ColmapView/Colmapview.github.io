import type { CSSProperties } from 'react';
import { CAMERA_MODEL_NAMES } from '../../../utils/cameraModelNames';

export type ExportFormat = 'binary' | 'text' | 'ply' | 'zip';

interface CameraModelSummaryCamera {
  modelId: number;
}

export const EXPORT_FORMAT_OPTIONS: { value: ExportFormat; label: string }[] = [
  { value: 'binary', label: 'Binary (.bin)' },
  { value: 'text', label: 'Text (.txt)' },
  { value: 'ply', label: 'Points (.ply)' },
  { value: 'zip', label: 'ZIP (.zip)' },
];

export const EXPORT_FORMAT_DESCRIPTIONS: Record<ExportFormat, string> = {
  binary: 'COLMAP binary format. Compact and fast to load.',
  text: 'COLMAP text format. Human-readable, useful for debugging.',
  ply: 'Point cloud only. Compatible with MeshLab, CloudCompare.',
  zip: 'Binary files (.bin) in a single archive.',
};

export function getCameraModelSummary(
  cameras: ReadonlyArray<readonly [unknown, CameraModelSummaryCamera]>
): string | null {
  if (cameras.length === 0) return null;

  const modelCounts = new Map<number, number>();
  for (const [, camera] of cameras) {
    modelCounts.set(camera.modelId, (modelCounts.get(camera.modelId) ?? 0) + 1);
  }

  if (modelCounts.size === 1) {
    const entries = Array.from(modelCounts.entries());
    const [modelId, count] = entries[0];
    const name = CAMERA_MODEL_NAMES[modelId] ?? 'Unknown';
    return count > 1 ? `${count}x ${name}` : name;
  }

  return `${cameras.length} cameras (mixed)`;
}

export function getExportProgressStyle(progress: number): CSSProperties {
  return { width: `${progress}%` };
}
