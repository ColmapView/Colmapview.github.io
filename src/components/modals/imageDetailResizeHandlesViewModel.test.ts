import { describe, expect, it } from 'vitest';
import { resizeHandleStyles } from '../../theme';
import {
  getResizeHandleRenderState,
  getResizeHandleRenderStates,
  RESIZE_DIRECTIONS,
} from './imageDetailResizeHandlesViewModel';

describe('imageDetailResizeHandlesViewModel', () => {
  it('keeps resize directions in the expected render order', () => {
    expect(RESIZE_DIRECTIONS).toEqual(['nw', 'ne', 'sw', 'se', 'n', 's', 'w', 'e']);
    expect(getResizeHandleRenderStates().map(({ direction }) => direction)).toEqual(RESIZE_DIRECTIONS);
  });

  it('builds corner handle state', () => {
    expect(getResizeHandleRenderState('nw')).toEqual({
      ariaLabel: 'Resize nw',
      className: `${resizeHandleStyles.corner} ${resizeHandleStyles.nw}`,
      direction: 'nw',
    });
  });

  it('builds edge handle state', () => {
    expect(getResizeHandleRenderState('e')).toEqual({
      ariaLabel: 'Resize e',
      className: `${resizeHandleStyles.edge} ${resizeHandleStyles.e}`,
      direction: 'e',
    });
  });
});
