import { useMemo } from 'react';
import { useUIStore } from '../../store';
import type { MatchesNode } from '../types';

export function useMatchesNode(): MatchesNode {
  const showMatches = useUIStore((s) => s.showMatches);
  const matchesDisplayMode = useUIStore((s) => s.matchesDisplayMode);
  const matchesOpacity = useUIStore((s) => s.matchesOpacity);
  const matchesColor = useUIStore((s) => s.matchesColor);

  return useMemo<MatchesNode>(
    () => ({
      nodeType: 'matches',
      visible: showMatches,
      displayMode: matchesDisplayMode,
      opacity: matchesOpacity,
      color: matchesColor,
    }),
    [showMatches, matchesDisplayMode, matchesOpacity, matchesColor]
  );
}
