import { describe, expect, it, vi } from 'vitest';
import {
  formatImageDetailNavigationLabel,
  formatImageDetailOpacityPercent,
  formatImageDetailMatchSelectOptionLabel,
  getImageDetailControlVisibilityState,
  getImageDetailMatchOpacityControlState,
  getImageDetailMatchSelectState,
  getImageDetailMatchesToggleButtonState,
  getImageDetailPointToggleDescriptors,
  getImageDetailPointToggleButtonState,
  getImageJumpInputKeyAction,
  getImageJumpInputResetValue,
  getImageJumpInputState,
  getPointCountClass,
  parseMatchLineOpacityValue,
  parseOptionalImageId,
  shouldShowImageDetailMatchOpacity,
  shouldShowImageDetailMatchSelector,
  shouldShowImageDetailNavigation,
  shouldShowImageDetailPointToggles,
} from './imageDetailControlsViewModel';

describe('imageDetailControlsViewModel', () => {
  it('formats opacity and navigation labels for compact controls', () => {
    expect(formatImageDetailOpacityPercent(0)).toBe('0%');
    expect(formatImageDetailOpacityPercent(0.555)).toBe('56%');
    expect(formatImageDetailOpacityPercent(1)).toBe('100%');
    expect(formatImageDetailNavigationLabel(0, 3)).toBe('1 / 3');
    expect(formatImageDetailNavigationLabel(2, 3)).toBe('3 / 3');
  });

  it('parses optional image ids and opacity slider values', () => {
    expect(parseOptionalImageId('')).toBeNull();
    expect(parseOptionalImageId('8')).toBe(8);
    expect(parseOptionalImageId(' 8 ')).toBe(8);
    expect(parseOptionalImageId('08')).toBe(8);
    expect(parseOptionalImageId('12.jpg')).toBeNull();
    expect(parseOptionalImageId('not-an-id')).toBeNull();
    expect(parseMatchLineOpacityValue('0.35')).toBe(0.35);
    expect(parseMatchLineOpacityValue('0.35px')).toBeNull();
  });

  it('derives image jump input rendering state', () => {
    expect(getImageJumpInputState({
      imageDetailId: 7,
      imageCount: 12,
    })).toEqual({
      containerClassName: 'flex items-center text-xs',
      inputClassName: 'bg-ds-input text-ds-primary border border-ds rounded focus-ds transition-colors py-1 w-14 rounded-l rounded-r-none text-center text-xs',
      countClassName: 'w-14 px-2 py-1 text-center bg-ds-secondary text-ds-muted border-y border-r border-ds rounded-r',
      inputKey: '7',
      resetValue: '7',
      countLabel: '12',
    });

    expect(getImageJumpInputState({
      imageDetailId: null,
      imageCount: 0,
    })).toMatchObject({
      inputKey: 'none',
      resetValue: '',
      countLabel: '0',
    });
  });

  it('derives match-select rendering state for touch and desktop controls', () => {
    expect(formatImageDetailMatchSelectOptionLabel('touch', 'image-a.jpg', 4)).toBe('image-a.jpg (4)');
    expect(formatImageDetailMatchSelectOptionLabel('desktop', 'image-a.jpg', 4)).toBe('image-a.jpg (4 matches)');

    expect(getImageDetailMatchSelectState({
      variant: 'touch',
      matchedImageId: 8,
      connectedImages: [
        { imageId: 8, matchCount: 4, name: 'match-a.jpg' },
        { imageId: 9, matchCount: 2, name: 'match-b.jpg' },
      ],
    })).toEqual({
      value: '8',
      placeholderLabel: 'Select image...',
      className: 'bg-ds-input text-ds-primary border border-ds-subtle rounded focus-ds cursor-pointer px-2 py-1 flex-1 min-w-0 py-1.5 text-xs',
      minHeight: 36,
      options: [
        { value: '8', label: 'match-a.jpg (4)' },
        { value: '9', label: 'match-b.jpg (2)' },
      ],
    });

    expect(getImageDetailMatchSelectState({
      variant: 'desktop',
      matchedImageId: null,
      connectedImages: [
        { imageId: 8, matchCount: 4, name: 'match-a.jpg' },
      ],
    })).toEqual({
      value: '',
      placeholderLabel: 'Select connected image...',
      className: 'bg-ds-input text-ds-primary border border-ds-subtle rounded focus-ds cursor-pointer px-2 py-1 py-1 pl-2 pr-1 text-xs',
      options: [
        { value: '8', label: 'match-a.jpg (4 matches)' },
      ],
    });
  });

  it('derives match-opacity rendering state for touch and desktop controls', () => {
    expect(getImageDetailMatchOpacityControlState({
      variant: 'touch',
      opacity: 0.555,
    })).toEqual({
      containerClassName: 'flex items-center gap-2 px-2 pb-1.5',
      label: 'Opacity',
      labelClassName: 'text-ds-secondary text-xs',
      sliderClassName: 'flex-1 accent-ds-success h-6',
      sliderMin: '0',
      sliderMax: '1',
      sliderStep: '0.1',
      valueLabel: '56%',
      valueClassName: 'text-ds-primary text-xs w-8 text-right',
      editorInputClassName: 'bg-transparent text-ds-primary text-xs w-8 text-right flex-shrink-0 border-none p-0 m-0 focus-outline-none',
      showEditor: false,
      showDisplayValue: true,
      displayValueTitle: undefined,
    });

    expect(getImageDetailMatchOpacityControlState({
      variant: 'desktop',
      opacity: 0.5,
    })).toEqual({
      containerClassName: 'flex items-center gap-2',
      label: 'Opacity',
      labelClassName: 'text-ds-secondary whitespace-nowrap text-xs pl-1',
      sliderClassName: 'w-14 accent-ds-success',
      sliderMin: '0',
      sliderMax: '1',
      sliderStep: '0.05',
      valueLabel: '50%',
      valueClassName: 'text-ds-primary text-xs w-8 text-right flex-shrink-0 cursor-pointer hover-bg-ds-accent',
      editorInputClassName: 'bg-transparent text-ds-primary text-xs w-8 text-right flex-shrink-0 border-none p-0 m-0 focus-outline-none',
      showEditor: false,
      showDisplayValue: true,
      displayValueTitle: 'Double-click to edit',
    });

    expect(getImageDetailMatchOpacityControlState({
      variant: 'desktop',
      opacity: 0.5,
      isEditing: true,
    })).toMatchObject({
      showEditor: true,
      showDisplayValue: false,
      valueLabel: '50%',
    });
  });

  it('derives point count accent classes only for inactive visible points', () => {
    expect(getPointCountClass(false, false, 'text-ds-success')).toBe('text-ds-success');
    expect(getPointCountClass(false, true, 'text-ds-success')).toBe('');
    expect(getPointCountClass(true, false, 'text-ds-success')).toBe('');
  });

  it('derives variant-aware point-toggle descriptors', () => {
    expect(getImageDetailPointToggleDescriptors('touch')).toEqual([
      { key: 'points2D', label: '2D', inactiveCountClass: 'text-ds-success' },
      { key: 'points3D', label: '3D', inactiveCountClass: 'text-ds-error' },
    ]);

    expect(getImageDetailPointToggleDescriptors('desktop')).toEqual([
      { key: 'points2D', label: 'Points2D', inactiveCountClass: 'text-ds-success' },
      { key: 'points3D', label: 'Points3D', inactiveCountClass: 'text-ds-error' },
    ]);
  });

  it('derives point-toggle button state for touch and desktop controls', () => {
    expect(getImageDetailPointToggleButtonState({
      variant: 'touch',
      isActive: false,
      isMarkedForDeletion: false,
      inactiveCountClass: 'text-ds-success',
    })).toEqual({
      disabled: false,
      className: 'flex-1 px-2 flex items-center justify-center rounded-md text-xs bg-ds-hover text-ds-primary',
      countClass: 'text-ds-success',
      nextActive: true,
      minHeight: 36,
    });

    expect(getImageDetailPointToggleButtonState({
      variant: 'touch',
      isActive: true,
      isMarkedForDeletion: false,
      inactiveCountClass: 'text-ds-success',
    })).toEqual({
      disabled: false,
      className: 'flex-1 px-2 flex items-center justify-center rounded-md text-xs bg-ds-accent text-ds-void',
      countClass: '',
      nextActive: false,
      minHeight: 36,
    });

    const disabledDesktop = getImageDetailPointToggleButtonState({
      variant: 'desktop',
      isActive: false,
      isMarkedForDeletion: true,
      inactiveCountClass: 'text-ds-success',
    });
    expect(disabledDesktop.disabled).toBe(true);
    expect(disabledDesktop.nextActive).toBe(true);
    expect(disabledDesktop.countClass).toBe('');
    expect(disabledDesktop.minHeight).toBeUndefined();
    expect(disabledDesktop.className).toContain('opacity-50 cursor-not-allowed');
    expect(disabledDesktop.className).toContain('bg-ds-secondary text-ds-muted');
  });

  it('derives matches-toggle button state for touch and desktop controls', () => {
    expect(getImageDetailMatchesToggleButtonState({
      variant: 'touch',
      isActive: false,
      isMarkedForDeletion: false,
    })).toEqual({
      label: 'Matches',
      disabled: false,
      className: 'flex-1 px-3 flex items-center justify-center rounded-md text-xs whitespace-nowrap bg-ds-hover text-ds-primary',
      nextActive: true,
      minHeight: 36,
    });

    expect(getImageDetailMatchesToggleButtonState({
      variant: 'touch',
      isActive: true,
      isMarkedForDeletion: false,
    })).toEqual({
      label: 'Matches',
      disabled: false,
      className: 'px-3 flex items-center justify-center rounded-md text-xs whitespace-nowrap bg-ds-accent text-ds-void',
      nextActive: false,
      minHeight: 36,
    });

    const disabledDesktop = getImageDetailMatchesToggleButtonState({
      variant: 'desktop',
      isActive: false,
      isMarkedForDeletion: true,
    });
    expect(disabledDesktop.label).toBe('Show Matches');
    expect(disabledDesktop.disabled).toBe(true);
    expect(disabledDesktop.nextActive).toBe(true);
    expect(disabledDesktop.minHeight).toBeUndefined();
    expect(disabledDesktop.className).toContain('opacity-50 cursor-not-allowed');
    expect(disabledDesktop.className).toContain('bg-ds-secondary text-ds-muted');
  });

  it('derives control visibility by mode and deletion state', () => {
    expect(shouldShowImageDetailPointToggles(false)).toBe(true);
    expect(shouldShowImageDetailPointToggles(true)).toBe(false);
    expect(shouldShowImageDetailMatchSelector(true, false)).toBe(true);
    expect(shouldShowImageDetailMatchSelector(true, true)).toBe(false);
    expect(shouldShowImageDetailMatchOpacity(true, false, 9)).toBe(true);
    expect(shouldShowImageDetailMatchOpacity(true, false, null)).toBe(false);
    expect(shouldShowImageDetailNavigation(false)).toBe(true);
    expect(shouldShowImageDetailNavigation(true)).toBe(false);
  });

  it('derives variant-aware control visibility state', () => {
    expect(getImageDetailControlVisibilityState({
      variant: 'touch',
      showMatchesInModal: false,
      isMarkedForDeletion: false,
      matchedImageId: null,
    })).toEqual({
      showPointToggles: true,
      showMatchSelector: false,
      showMatchOpacity: false,
      showNavigation: true,
    });

    expect(getImageDetailControlVisibilityState({
      variant: 'touch',
      showMatchesInModal: true,
      isMarkedForDeletion: false,
      matchedImageId: null,
    })).toEqual({
      showPointToggles: false,
      showMatchSelector: true,
      showMatchOpacity: false,
      showNavigation: false,
    });

    expect(getImageDetailControlVisibilityState({
      variant: 'desktop',
      showMatchesInModal: true,
      isMarkedForDeletion: false,
      matchedImageId: null,
    })).toEqual({
      showPointToggles: false,
      showMatchSelector: true,
      showMatchOpacity: true,
      showNavigation: true,
    });

    expect(getImageDetailControlVisibilityState({
      variant: 'desktop',
      showMatchesInModal: true,
      isMarkedForDeletion: true,
      matchedImageId: 8,
    })).toEqual({
      showPointToggles: false,
      showMatchSelector: false,
      showMatchOpacity: false,
      showNavigation: true,
    });
  });

  it('plans jump-input key actions without touching the DOM', () => {
    const imageExists = vi.fn((imageId: number) => imageId === 7);

    expect(getImageJumpInputKeyAction({
      key: 'Enter',
      value: '7',
      currentImageId: 3,
      imageExists,
    })).toEqual({ type: 'openAndBlur', imageId: 7 });
    expect(imageExists).toHaveBeenCalledWith(7);

    expect(getImageJumpInputKeyAction({
      key: 'Enter',
      value: '8',
      currentImageId: 3,
      imageExists,
    })).toEqual({ type: 'blur' });

    expect(getImageJumpInputKeyAction({
      key: 'Enter',
      value: 'bad',
      currentImageId: 3,
      imageExists,
    })).toEqual({ type: 'blur' });

    expect(getImageJumpInputKeyAction({
      key: 'Escape',
      value: '99',
      currentImageId: 3,
      imageExists,
    })).toEqual({ type: 'resetAndBlur', value: '3' });

    expect(getImageJumpInputKeyAction({
      key: 'Tab',
      value: '7',
      currentImageId: 3,
      imageExists,
    })).toEqual({ type: 'none' });
  });

  it('formats the jump-input reset value for missing and selected images', () => {
    expect(getImageJumpInputResetValue(null)).toBe('');
    expect(getImageJumpInputResetValue(42)).toBe('42');
  });
});
