import type { MatchesDisplayMode } from '../../store/types';
import type { VisualNode } from './base';

export interface MatchesNode extends VisualNode {
  readonly nodeType: 'matches';
  displayMode: MatchesDisplayMode;
  color: string;
}
