import type { VisibleNode } from './base';

export interface GizmoNode extends VisibleNode {
  readonly nodeType: 'gizmo';
}
