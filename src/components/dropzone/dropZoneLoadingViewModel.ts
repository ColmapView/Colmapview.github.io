import type { CSSProperties } from 'react';

export function getDropZoneProgressFillStyle(percent: number): CSSProperties {
  return {
    width: `${Math.round(percent)}%`,
  };
}
