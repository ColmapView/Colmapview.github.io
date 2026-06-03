import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DesktopImageDetailResizeHandles,
  type ResizeDirection,
} from './ImageDetailResizeHandles';
import { RESIZE_DIRECTIONS } from './imageDetailResizeHandlesViewModel';

afterEach(() => {
  cleanup();
});

describe('DesktopImageDetailResizeHandles', () => {
  it('renders every resize direction and reports the selected direction', () => {
    const onResizeStart = vi.fn();
    const directions: readonly ResizeDirection[] = RESIZE_DIRECTIONS;

    render(<DesktopImageDetailResizeHandles onResizeStart={onResizeStart} />);

    for (const direction of directions) {
      fireEvent.pointerDown(screen.getByLabelText(`Resize ${direction}`));
    }

    expect(onResizeStart).toHaveBeenCalledTimes(directions.length);
    expect(onResizeStart.mock.calls.map((call) => call[1])).toEqual(directions);
  });
});
