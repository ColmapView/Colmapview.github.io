import { buttonStyles } from '../../theme';
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
        label: 'Prev',
        disabled: true,
        className: `${buttonStyles.base} flex-1 px-2 text-xs relative touch-hit-44 ${buttonStyles.variants.secondary} ${buttonStyles.disabled}`,
      },
      nextButton: {
        label: 'Next',
        disabled: false,
        className: `${buttonStyles.base} flex-1 px-2 text-xs relative touch-hit-44 ${buttonStyles.variants.secondary}`,
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
    expect(state.previousButton.label).toBe('Prev');
    expect(state.previousButton.disabled).toBe(false);
    expect(state.previousButton.className).toContain(buttonStyles.sizes.toggleResponsive);
    expect(state.previousButton.className).toContain(buttonStyles.variants.secondary);
    expect(state.nextButton.label).toBe('Next');
    expect(state.nextButton.disabled).toBe(true);
    expect(state.nextButton.className).toContain('opacity-50 cursor-not-allowed');
    expect(state.nextButton.className).toContain(buttonStyles.variants.secondary);
    expect(state.label).toBeNull();
    expect(state.labelClassName).toBeNull();
    expect(state.buttonStyle).toBeUndefined();
    expect(state.showJumpInput).toBe(true);
  });
});
