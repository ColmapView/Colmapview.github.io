import { describe, it, expect } from 'vitest';
import {
  isVisibleNode,
  isVisualNode,
  type BaseNode,
  type VisibleNode,
  type VisualNode,
} from './base';

describe('Type Guards', () => {
  describe('isVisibleNode', () => {
    it('returns true for nodes with visible property', () => {
      const node: VisibleNode = { nodeType: 'axes', visible: true };
      expect(isVisibleNode(node)).toBe(true);
    });

    it('returns true for VisualNode (which extends VisibleNode)', () => {
      const node: VisualNode = { nodeType: 'points', visible: true, opacity: 0.5 };
      expect(isVisibleNode(node)).toBe(true);
    });

    it('returns false for BaseNode without visible property', () => {
      const node: BaseNode = { nodeType: 'navigation' };
      expect(isVisibleNode(node)).toBe(false);
    });

    it('returns true regardless of visible value', () => {
      const visibleTrue: VisibleNode = { nodeType: 'grid', visible: true };
      const visibleFalse: VisibleNode = { nodeType: 'grid', visible: false };
      expect(isVisibleNode(visibleTrue)).toBe(true);
      expect(isVisibleNode(visibleFalse)).toBe(true);
    });
  });

  describe('isVisualNode', () => {
    it('returns true for nodes with both visible and opacity', () => {
      const node: VisualNode = { nodeType: 'points', visible: true, opacity: 1 };
      expect(isVisualNode(node)).toBe(true);
    });

    it('returns false for VisibleNode without opacity', () => {
      const node: VisibleNode = { nodeType: 'axes', visible: true };
      expect(isVisualNode(node)).toBe(false);
    });

    it('returns false for BaseNode', () => {
      const node: BaseNode = { nodeType: 'navigation' };
      expect(isVisualNode(node)).toBe(false);
    });

    it('returns true regardless of opacity value', () => {
      const full: VisualNode = { nodeType: 'points', visible: true, opacity: 1 };
      const zero: VisualNode = { nodeType: 'points', visible: true, opacity: 0 };
      const half: VisualNode = { nodeType: 'points', visible: true, opacity: 0.5 };
      expect(isVisualNode(full)).toBe(true);
      expect(isVisualNode(zero)).toBe(true);
      expect(isVisualNode(half)).toBe(true);
    });
  });

  describe('Type Hierarchy', () => {
    it('VisualNode is a superset of VisibleNode', () => {
      const visualNode: VisualNode = { nodeType: 'points', visible: true, opacity: 0.8 };
      // A VisualNode should pass both guards
      expect(isVisibleNode(visualNode)).toBe(true);
      expect(isVisualNode(visualNode)).toBe(true);
    });

    it('VisibleNode is not necessarily a VisualNode', () => {
      const visibleNode: VisibleNode = { nodeType: 'axes', visible: true };
      expect(isVisibleNode(visibleNode)).toBe(true);
      expect(isVisualNode(visibleNode)).toBe(false);
    });
  });
});
