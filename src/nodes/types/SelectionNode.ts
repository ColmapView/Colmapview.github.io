import type { SelectionColorMode } from '../../store/types';
import type { VisibleNode } from './base';

/**
 * SelectionNode extends VisibleNode (not VisualNode) because it manages
 * multiple opacity properties:
 * - `planeOpacity`: Selection highlight plane transparency
 * - `unselectedOpacity`: Cross-cutting effect on cameras/matches/rigs
 */
export interface SelectionNode extends VisibleNode {
  readonly nodeType: 'selection';
  colorMode: SelectionColorMode;
  color: string;
  animationSpeed: number;
  planeOpacity: number;
  unselectedOpacity: number; // Cross-cutting: affects cameras, matches, rigs
  selectedImageId: number | null;
}
