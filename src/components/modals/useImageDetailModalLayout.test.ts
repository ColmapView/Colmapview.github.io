import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MODAL, SIZE } from '../../theme';
import { buildCamera, buildPointerEvent } from '../../test/builders';
import type { Camera, ImageId } from '../../types/colmap';
import { getInitialImageModalBounds } from './imageDetailLayoutViewModel';
import { useImageDetailModalLayout } from './useImageDetailModalLayout';

interface HookProps {
  camera: Camera | null;
  imageDetailId: ImageId | null;
}

const originalInnerWidth = window.innerWidth;
const originalInnerHeight = window.innerHeight;

function setViewport(width: number, height: number): void {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: width,
  });
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: height,
  });
}

function expectedBounds(camera: Camera) {
  return getInitialImageModalBounds(
    camera,
    { width: window.innerWidth, height: window.innerHeight },
    {
      minWidth: SIZE.modalMinWidth,
      minHeight: SIZE.modalMinHeight,
      maxWidthPercent: MODAL.maxWidthPercent,
      maxHeightPercent: MODAL.maxHeightPercent,
      headerHeight: MODAL.headerHeight,
      footerHeight: MODAL.footerHeight,
      padding: MODAL.padding,
    }
  );
}

function createCapturedPointerElement(): { element: HTMLDivElement; setPointerCapture: ReturnType<typeof vi.fn> } {
  const element = document.createElement('div');
  const setPointerCapture = vi.fn();
  Object.defineProperty(element, 'setPointerCapture', {
    configurable: true,
    value: setPointerCapture,
  });
  return { element, setPointerCapture };
}

afterEach(() => {
  setViewport(originalInnerWidth, originalInnerHeight);
});

describe('useImageDetailModalLayout', () => {
  it('initializes modal bounds on the first open render', () => {
    setViewport(1200, 800);
    const camera = buildCamera({ width: 1000, height: 500 });
    const expected = expectedBounds(camera);

    const { result } = renderHook((props: HookProps) => useImageDetailModalLayout(props), {
      initialProps: { camera, imageDetailId: 1 },
    });

    expect(result.current.size).toEqual(expected.size);
    expect(result.current.position).toEqual(expected.position);
  });

  it('keeps existing bounds when the selected image changes while the modal remains open', () => {
    setViewport(1200, 800);
    const firstCamera = buildCamera({ width: 1000, height: 500 });
    const secondCamera = buildCamera({ width: 500, height: 1000 });
    const firstExpected = expectedBounds(firstCamera);
    const secondExpected = expectedBounds(secondCamera);

    const { result, rerender } = renderHook((props: HookProps) => useImageDetailModalLayout(props), {
      initialProps: { camera: firstCamera, imageDetailId: 1 },
    });

    rerender({ camera: secondCamera, imageDetailId: 2 });

    expect(result.current.size).toEqual(firstExpected.size);
    expect(result.current.position).toEqual(firstExpected.position);
    expect(result.current.size).not.toEqual(secondExpected.size);
  });

  it('resets bounds after the modal closes and opens again', () => {
    setViewport(1200, 800);
    const firstCamera = buildCamera({ width: 1000, height: 500 });
    const { result, rerender } = renderHook((props: HookProps) => useImageDetailModalLayout(props), {
      initialProps: { camera: firstCamera, imageDetailId: 1 },
    });

    rerender({ camera: null, imageDetailId: null });

    setViewport(900, 700);
    const secondCamera = buildCamera({ width: 500, height: 1000 });
    const secondExpected = expectedBounds(secondCamera);

    rerender({ camera: secondCamera, imageDetailId: 2 });

    expect(result.current.size).toEqual(secondExpected.size);
    expect(result.current.position).toEqual(secondExpected.position);
  });

  it('updates position during a captured header drag', () => {
    setViewport(1200, 800);
    const camera = buildCamera({ width: 1000, height: 500 });
    const expected = expectedBounds(camera);
    const { result } = renderHook((props: HookProps) => useImageDetailModalLayout(props), {
      initialProps: { camera, imageDetailId: 1 },
    });
    const { element, setPointerCapture } = createCapturedPointerElement();
    const preventDefault = vi.fn();

    act(() => {
      result.current.handleDragStart({
        clientX: 100,
        clientY: 120,
        currentTarget: element,
        pointerId: 4,
        preventDefault,
      });
    });
    act(() => {
      element.dispatchEvent(buildPointerEvent({ clientX: 130, clientY: 100 }));
    });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(setPointerCapture).toHaveBeenCalledWith(4);
    expect(result.current.position).toEqual({
      x: expected.position.x + 30,
      y: expected.position.y - 20,
    });
  });

  it('updates size and position during a captured resize drag', () => {
    setViewport(1200, 800);
    const camera = buildCamera({ width: 1000, height: 500 });
    const expected = expectedBounds(camera);
    const { result } = renderHook((props: HookProps) => useImageDetailModalLayout(props), {
      initialProps: { camera, imageDetailId: 1 },
    });
    const { element, setPointerCapture } = createCapturedPointerElement();
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();

    act(() => {
      result.current.handleResizeStart({
        clientX: 100,
        clientY: 120,
        currentTarget: element,
        pointerId: 5,
        preventDefault,
        stopPropagation,
      }, 'nw');
    });
    act(() => {
      element.dispatchEvent(buildPointerEvent({ clientX: 80, clientY: 90 }));
    });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(setPointerCapture).toHaveBeenCalledWith(5);
    expect(result.current.position).toEqual({
      x: expected.position.x - 20,
      y: expected.position.y - 30,
    });
    expect(result.current.size).toEqual({
      width: expected.size.width + 20,
      height: expected.size.height + 30,
    });
  });
});
