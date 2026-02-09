import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useModalDrag } from './useModalDrag';

// Mock window dimensions for predictable tests
const MOCK_WIDTH = 1920;
const MOCK_HEIGHT = 1080;

beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', { value: MOCK_WIDTH, writable: true });
  Object.defineProperty(window, 'innerHeight', { value: MOCK_HEIGHT, writable: true });
});

describe('useModalDrag', () => {
  describe('initial centered positioning', () => {
    it('centers modal in viewport when opened without initialPosition', () => {
      const { result, rerender } = renderHook(
        ({ isOpen }) => useModalDrag({ estimatedWidth: 400, estimatedHeight: 300, isOpen }),
        { initialProps: { isOpen: false } },
      );

      // Initially at 0,0 before open
      expect(result.current.position.x).toBe(0);
      expect(result.current.position.y).toBe(0);

      // Open the modal
      rerender({ isOpen: true });

      // Should be centered: (1920-400)/2 = 760, (1080-300)/2 = 390
      expect(result.current.position.x).toBe(760);
      expect(result.current.position.y).toBe(390);
    });

    it('respects minTop when modal is very tall', () => {
      const { result, rerender } = renderHook(
        ({ isOpen }) => useModalDrag({ estimatedWidth: 200, estimatedHeight: 2000, isOpen }),
        { initialProps: { isOpen: false } },
      );

      rerender({ isOpen: true });

      // Centering would give (1080-2000)/2 = -460, clamped to minTop (20)
      expect(result.current.position.y).toBe(20);
    });
  });

  describe('cursor-relative positioning', () => {
    it('positions near cursor when initialPosition is provided', () => {
      const { result, rerender } = renderHook(
        ({ isOpen, initialPosition }) =>
          useModalDrag({ estimatedWidth: 200, estimatedHeight: 80, isOpen, initialPosition }),
        { initialProps: { isOpen: false, initialPosition: null as { x: number; y: number } | null } },
      );

      rerender({ isOpen: true, initialPosition: { x: 500, y: 400 } });

      // cursorOffset is 12, so position = (500+12, 400-12) = (512, 388)
      // Both within viewport, so no clamping
      expect(result.current.position.x).toBe(512);
      expect(result.current.position.y).toBe(388);
    });

    it('clamps to right edge of viewport', () => {
      const { result, rerender } = renderHook(
        ({ isOpen, initialPosition }) =>
          useModalDrag({ estimatedWidth: 200, estimatedHeight: 80, isOpen, initialPosition }),
        { initialProps: { isOpen: false, initialPosition: null as { x: number; y: number } | null } },
      );

      // Click near right edge: x=1800 + offset(12) + width(200) > 1920
      rerender({ isOpen: true, initialPosition: { x: 1800, y: 400 } });

      // padding=16, clamped to: 1920 - 200 - 16 = 1704
      expect(result.current.position.x).toBe(1704);
    });

    it('clamps to bottom edge of viewport', () => {
      const { result, rerender } = renderHook(
        ({ isOpen, initialPosition }) =>
          useModalDrag({ estimatedWidth: 200, estimatedHeight: 80, isOpen, initialPosition }),
        { initialProps: { isOpen: false, initialPosition: null as { x: number; y: number } | null } },
      );

      // Click near bottom: y=1060 - offset(12) = 1048, + height(80) > 1080
      rerender({ isOpen: true, initialPosition: { x: 500, y: 1060 } });

      // padding=16, clamped to: 1080 - 80 - 16 = 984
      expect(result.current.position.y).toBe(984);
    });

    it('clamps to top-left when cursor is near origin', () => {
      const { result, rerender } = renderHook(
        ({ isOpen, initialPosition }) =>
          useModalDrag({ estimatedWidth: 200, estimatedHeight: 80, isOpen, initialPosition }),
        { initialProps: { isOpen: false, initialPosition: null as { x: number; y: number } | null } },
      );

      // Click at (0,0): x=0+12=12 < padding(16), y=0-12=-12 < padding(16)
      rerender({ isOpen: true, initialPosition: { x: 0, y: 0 } });

      // Both clamped to padding
      expect(result.current.position.x).toBe(16);
      expect(result.current.position.y).toBe(16);
    });
  });

  describe('returned refs and handlers', () => {
    it('returns panelRef, handleDragStart, and centerModal', () => {
      const { result } = renderHook(() =>
        useModalDrag({ estimatedWidth: 200, estimatedHeight: 100, isOpen: true }),
      );

      expect(result.current.panelRef).toBeDefined();
      expect(typeof result.current.handleDragStart).toBe('function');
      expect(typeof result.current.centerModal).toBe('function');
    });
  });
});
