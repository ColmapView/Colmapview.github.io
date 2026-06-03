import { describe, expect, it } from 'vitest';
import {
  formatImageDetailNavigationLabel,
  getImageDetailNavigationControlsState,
} from './imageDetailNavigationViewModel';

describe('imageDetailNavigationViewModel', () => {
  it('formats one-based image navigation labels', () => {
    expect(formatImageDetailNavigationLabel(0, 3)).toBe('1 / 3');
    expect(formatImageDetailNavigationLabel(2, 3)).toBe('3 / 3');
  });

  it('derives touch navigation rendering state', () => {
    expect(getImageDetailNavigationControlsState({
      variant: 'touch',
      hasPrev: false,
      hasNext: true,
      currentIndex: 1,
      imageCount: 3,
    })).toEqual({
      containerClassName: 'flex items-center gap-1.5 px-2 py-1.5 border-t border-ds',
      previousButton: {
        label: '\u2190 Prev',
        disabled: true,
        className: 'flex-1 px-2 flex items-center justify-center rounded-md text-xs bg-ds-secondary text-ds-muted',
      },
      nextButton: {
        label: 'Next \u2192',
        disabled: false,
        className: 'flex-1 px-2 flex items-center justify-center rounded-md text-xs bg-ds-hover text-ds-primary',
      },
      label: '2 / 3',
      labelClassName: 'text-ds-primary text-xs px-1',
      buttonStyle: { minHeight: 36 },
      showJumpInput: false,
    });
  });

  it('derives desktop navigation rendering state', () => {
    const state = getImageDetailNavigationControlsState({
      variant: 'desktop',
      hasPrev: true,
      hasNext: false,
    });

    expect(state.containerClassName).toBe('flex items-center gap-2');
    expect(state.previousButton.label).toBe('\u2190 Prev');
    expect(state.previousButton.disabled).toBe(false);
    expect(state.previousButton.className).toContain('px-4 py-1 text-xs gap-1');
    expect(state.previousButton.className).toContain('bg-ds-hover text-ds-secondary');
    expect(state.nextButton.label).toBe('Next \u2192');
    expect(state.nextButton.disabled).toBe(true);
    expect(state.nextButton.className).toContain('opacity-50 cursor-not-allowed');
    expect(state.nextButton.className).toContain('bg-ds-secondary text-ds-muted');
    expect(state.label).toBeNull();
    expect(state.labelClassName).toBeNull();
    expect(state.buttonStyle).toBeUndefined();
    expect(state.showJumpInput).toBe(true);
  });
});
