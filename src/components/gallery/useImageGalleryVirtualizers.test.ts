import { renderHook } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { GAP, SIZE, TIMING } from '../../theme';

interface VirtualizerOptionsSnapshot {
  count: number;
  getScrollElement: () => HTMLDivElement | null;
  estimateSize: () => number;
  overscan: number;
}

const virtualizerMock = vi.hoisted(() => ({
  useVirtualizer: vi.fn((options: VirtualizerOptionsSnapshot) => ({
    getTotalSize: vi.fn(),
    getVirtualItems: vi.fn(),
    isScrolling: false,
    measureElement: vi.fn(),
    options,
    scrollToIndex: vi.fn(),
  })),
}));

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: virtualizerMock.useVirtualizer,
}));

import { useImageGalleryVirtualizers } from './useImageGalleryVirtualizers';

describe('useImageGalleryVirtualizers', () => {
  it('creates gallery and list virtualizers with shared scroll element access', () => {
    const containerRef = createRef<HTMLDivElement>();
    const container = document.createElement('div');
    containerRef.current = container;

    const { result } = renderHook(() => useImageGalleryVirtualizers({
      containerRef,
      rowCount: 12,
      listCount: 34,
    }));
    const [rowCall, listCall] = virtualizerMock.useVirtualizer.mock.calls;
    const rowOptions = rowCall[0];
    const listOptions = listCall[0];

    expect(result.current.rowVirtualizer).not.toBe(result.current.listVirtualizer);
    expect(rowOptions.count).toBe(12);
    expect(rowOptions.getScrollElement()).toBe(container);
    expect(rowOptions.estimateSize()).toBe(SIZE.defaultCellHeight + GAP.gallery);
    expect(rowOptions.overscan).toBe(TIMING.galleryOverscan);
    expect(listOptions.count).toBe(34);
    expect(listOptions.getScrollElement()).toBe(container);
    expect(listOptions.estimateSize()).toBe(SIZE.listRowHeight + GAP.gallery);
    expect(listOptions.overscan).toBe(TIMING.listOverscan);
  });
});
