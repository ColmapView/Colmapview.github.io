import { resizeHandleStyles } from '../../theme';

export const RESIZE_DIRECTIONS = ['nw', 'ne', 'sw', 'se', 'n', 's', 'w', 'e'] as const;

export type ResizeDirection = (typeof RESIZE_DIRECTIONS)[number];

export interface ResizeHandleRenderState {
  ariaLabel: string;
  className: string;
  direction: ResizeDirection;
}

export function getResizeHandleRenderState(direction: ResizeDirection): ResizeHandleRenderState {
  const handleType = direction.length === 2 ? resizeHandleStyles.corner : resizeHandleStyles.edge;

  return {
    ariaLabel: `Resize ${direction}`,
    className: `${handleType} ${resizeHandleStyles[direction]}`,
    direction,
  };
}

export function getResizeHandleRenderStates(): ResizeHandleRenderState[] {
  return RESIZE_DIRECTIONS.map(getResizeHandleRenderState);
}
