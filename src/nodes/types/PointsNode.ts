import type { ColorMode } from '../../store/types';
import type { VisualNode } from './base';

export interface PointsNode extends VisualNode {
  readonly nodeType: 'points';
  size: number;
  colorMode: ColorMode;
  minTrackLength: number;
  maxReprojectionError: number | null; // null = no filter (Infinity in store)
  thinning: number;
  selectedPointId: bigint | null;
}
