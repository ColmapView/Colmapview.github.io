import { describe, expect, it } from 'vitest';
import {
  containsEventTarget,
  isEventTargetOutside,
  isNodeTarget,
} from './domTargetGuards';

describe('DOM target guards', () => {
  it('identifies Node event targets', () => {
    expect(isNodeTarget(document.createElement('button'))).toBe(true);
    expect(isNodeTarget(null)).toBe(false);
    expect(isNodeTarget(new Event('mousedown'))).toBe(false);
  });

  it('checks containment only for Node targets', () => {
    const container = document.createElement('div');
    const child = document.createElement('button');
    const outside = document.createElement('button');
    container.appendChild(child);

    expect(containsEventTarget(container, child)).toBe(true);
    expect(containsEventTarget(container, outside)).toBe(false);
    expect(containsEventTarget(container, null)).toBe(false);
    expect(containsEventTarget(container, new Event('drag'))).toBe(false);
  });

  it('reports outside targets only when a container and Node target exist', () => {
    const container = document.createElement('div');
    const child = document.createElement('button');
    const outside = document.createElement('button');
    container.appendChild(child);

    expect(isEventTargetOutside(container, outside)).toBe(true);
    expect(isEventTargetOutside(container, child)).toBe(false);
    expect(isEventTargetOutside(container, container)).toBe(false);
    expect(isEventTargetOutside(null, outside)).toBe(false);
    expect(isEventTargetOutside(container, null)).toBe(false);
    expect(isEventTargetOutside(container, new Event('touchstart'))).toBe(false);
  });
});
