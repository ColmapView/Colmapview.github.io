import { describe, expect, it } from 'vitest';
import {
  getMouseTooltipStyle,
  getMouseTooltipTarget,
  parseMouseTooltipContent,
  shouldClearMouseTooltipOnMouseOut,
  shouldUpdateMouseTooltipTarget,
} from './mouseTooltipPolicy';
import { MODAL_POSITION, Z_INDEX } from '../../theme';

describe('mouse tooltip policy', () => {
  it('splits tooltip text into text and icon marker parts', () => {
    expect(parseMouseTooltipContent('Drag {LMB}, pan {RMB}, zoom {SCROLL}')).toEqual([
      { type: 'text', text: 'Drag ' },
      { type: 'icon', marker: 'LMB', key: 'icon-5' },
      { type: 'text', text: ', pan ' },
      { type: 'icon', marker: 'RMB', key: 'icon-16' },
      { type: 'text', text: ', zoom ' },
      { type: 'icon', marker: 'SCROLL', key: 'icon-28' },
    ]);
  });

  it('keeps unknown markers and empty text as plain text', () => {
    expect(parseMouseTooltipContent('Press {KEY}')).toEqual([
      { type: 'text', text: 'Press {KEY}' },
    ]);
    expect(parseMouseTooltipContent('')).toEqual([
      { type: 'text', text: '' },
    ]);
  });

  it('finds the nearest tooltip element from an event target', () => {
    const wrapper = document.createElement('div');
    wrapper.dataset.tooltip = 'Open file';
    const child = document.createElement('span');
    wrapper.append(child);

    expect(getMouseTooltipTarget(child)).toEqual({
      element: wrapper,
      text: 'Open file',
    });
    expect(getMouseTooltipTarget(document.createElement('button'))).toBeNull();
    expect(getMouseTooltipTarget(null)).toBeNull();
  });

  it('detects whether the visible tooltip target should update', () => {
    const currentElement = document.createElement('button');
    const nextElement = document.createElement('button');

    expect(shouldUpdateMouseTooltipTarget({
      next: { element: currentElement, text: 'Same' },
      currentElement,
      currentText: 'Same',
    })).toBe(false);

    expect(shouldUpdateMouseTooltipTarget({
      next: { element: currentElement, text: 'Changed' },
      currentElement,
      currentText: 'Same',
    })).toBe(true);

    expect(shouldUpdateMouseTooltipTarget({
      next: { element: nextElement, text: 'Same' },
      currentElement,
      currentText: 'Same',
    })).toBe(true);
  });

  it('clears mouseout only when the related target has no tooltip owner', () => {
    const tooltip = document.createElement('div');
    tooltip.dataset.tooltip = 'Keep';
    const tooltipChild = document.createElement('span');
    tooltip.append(tooltipChild);

    expect(shouldClearMouseTooltipOnMouseOut(null)).toBe(true);
    expect(shouldClearMouseTooltipOnMouseOut(document.createElement('button'))).toBe(true);
    expect(shouldClearMouseTooltipOnMouseOut(tooltipChild)).toBe(false);
  });

  it('derives mouse-following tooltip position style', () => {
    expect(getMouseTooltipStyle({ x: 120, y: 45 })).toEqual({
      zIndex: Z_INDEX.mouseTooltip,
      right: `calc(100vw - 120px + ${MODAL_POSITION.cursorOffset}px)`,
      top: 45 + MODAL_POSITION.cursorOffset,
    });

    expect(getMouseTooltipStyle({ x: 12, y: 8 }, 4, 99)).toEqual({
      zIndex: 99,
      right: 'calc(100vw - 12px + 4px)',
      top: 12,
    });
  });
});
