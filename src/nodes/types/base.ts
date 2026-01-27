export type NodeType =
  | 'points'
  | 'cameras'
  | 'selection'
  | 'navigation'
  | 'matches'
  | 'rig'
  | 'axes'
  | 'grid'
  | 'gizmo';

export interface BaseNode {
  readonly nodeType: NodeType;
}

/** Nodes that can be shown/hidden in the scene. */
export interface VisibleNode extends BaseNode {
  visible: boolean;
}

/**
 * Nodes with standard opacity control (0-1).
 *
 * Note: Some nodes use domain-specific opacity instead:
 * - CamerasNode: standbyOpacity (non-selected camera opacity)
 * - SelectionNode: planeOpacity, unselectedOpacity (highlight + dim effect)
 */
export interface VisualNode extends VisibleNode {
  opacity: number;
}

// Type guards
export function isVisibleNode(node: BaseNode): node is VisibleNode {
  return 'visible' in node;
}

export function isVisualNode(node: BaseNode): node is VisualNode {
  return 'visible' in node && 'opacity' in node;
}
