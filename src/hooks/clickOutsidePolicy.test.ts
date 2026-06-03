import { describe, expect, it } from 'vitest';
import {
  shouldCloseForEscapeKey,
  shouldCloseForOutsideMouseDown,
} from './clickOutsidePolicy';

describe('click outside policy', () => {
  it('closes only when the mousedown target is outside the container', () => {
    const container = document.createElement('div');
    const child = document.createElement('button');
    const outside = document.createElement('button');
    container.appendChild(child);

    expect(shouldCloseForOutsideMouseDown(container, outside)).toBe(true);
    expect(shouldCloseForOutsideMouseDown(container, child)).toBe(false);
    expect(shouldCloseForOutsideMouseDown(container, container)).toBe(false);
  });

  it('does not close without a container or DOM node target', () => {
    expect(shouldCloseForOutsideMouseDown(null, document.body)).toBe(false);
    expect(shouldCloseForOutsideMouseDown(document.body, null)).toBe(false);
    expect(shouldCloseForOutsideMouseDown(document.body, new Event('mousedown'))).toBe(false);
  });

  it('closes only for Escape key presses', () => {
    expect(shouldCloseForEscapeKey('Escape')).toBe(true);
    expect(shouldCloseForEscapeKey('Enter')).toBe(false);
  });
});
