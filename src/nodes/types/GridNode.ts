import type { VisibleNode } from './base';

export interface GridNode extends VisibleNode {
  readonly nodeType: 'grid';
  scale: number;
}
