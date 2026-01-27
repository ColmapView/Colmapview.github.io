import type { AxesCoordinateSystem, AxisLabelMode } from '../../store/types';
import type { VisibleNode } from './base';

export interface AxesNode extends VisibleNode {
  readonly nodeType: 'axes';
  coordinateSystem: AxesCoordinateSystem;
  scale: number;
  labelMode: AxisLabelMode;
}
