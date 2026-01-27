import type { RigDisplayMode, RigColorMode } from '../../store/types';
import type { VisualNode } from './base';

export interface RigNode extends VisualNode {
  readonly nodeType: 'rig';
  displayMode: RigDisplayMode;
  colorMode: RigColorMode;
  color: string;
}
