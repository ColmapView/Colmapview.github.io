import { describe, expect, it } from 'vitest';
import { statusBarStyles } from '../../theme';
import {
  HOTKEY_HELP_TITLE,
  getHotkeyHelpToggleKeyLabels,
} from '../modals/hotkeyHelpViewModel';
import {
  STATUS_BAR_HIDDEN_CLASS_NAME,
  STATUS_BAR_SHORTCUTS_BUTTON_CLASS,
  STATUS_BAR_SHORTCUTS_LABEL,
  STATUS_BAR_SHORTCUTS_TITLE,
  TOUCH_STATUS_BAR_HELP_BUTTON_CLASS,
  TOUCH_STATUS_BAR_HELP_LABEL,
  TOUCH_STATUS_BAR_HELP_TITLE,
  formatStatusBarFps,
  getDesktopEmptyStatusText,
  getStatusBarContainerClassName,
  getTouchEmptyStatusText,
  shouldShowStatusHistograms,
  shouldShowTouchStatusBar,
} from './statusBarViewModel';

describe('status bar view model', () => {
  it('formats FPS values consistently for desktop and touch status bars', () => {
    expect(formatStatusBarFps(0)).toBe('0 FPS');
    expect(formatStatusBarFps(59)).toBe('59 FPS');
  });

  it('selects desktop empty-state copy from reconstruction and URL loading state', () => {
    expect(getDesktopEmptyStatusText({
      hasReconstruction: true,
      urlLoading: false,
    })).toBeNull();

    expect(getDesktopEmptyStatusText({
      hasReconstruction: false,
      urlLoading: true,
    })).toBe('Loading...');

    expect(getDesktopEmptyStatusText({
      hasReconstruction: false,
      urlLoading: false,
    })).toBe('Drop dataset or images to load');
  });

  it('preserves the compact touch loading message behavior', () => {
    expect(getTouchEmptyStatusText({
      hasReconstruction: true,
      urlLoading: true,
    })).toBeNull();

    expect(getTouchEmptyStatusText({
      hasReconstruction: false,
      urlLoading: true,
    })).toBe('Loading...');

    expect(getTouchEmptyStatusText({
      hasReconstruction: false,
      urlLoading: false,
    })).toBe('');
  });

  it('derives histogram and touch-status visibility from explicit state', () => {
    expect(shouldShowStatusHistograms({
      hasReconstruction: true,
      hasGlobalStats: true,
    })).toBe(true);

    expect(shouldShowStatusHistograms({
      hasReconstruction: true,
      hasGlobalStats: false,
    })).toBe(false);

    expect(shouldShowStatusHistograms({
      hasReconstruction: false,
      hasGlobalStats: true,
    })).toBe(false);

    expect(shouldShowTouchStatusBar(true)).toBe(true);
    expect(shouldShowTouchStatusBar(false)).toBe(false);
  });

  it('offers a visible Shortcuts entry point', () => {
    expect(STATUS_BAR_SHORTCUTS_LABEL).toBe('⌨ Shortcuts');
    expect(STATUS_BAR_SHORTCUTS_TITLE).toBe('Help & keyboard shortcuts (I)');
    expect(STATUS_BAR_SHORTCUTS_BUTTON_CLASS).toBe(
      'text-ds-secondary hover-ds-text-primary cursor-pointer transition-colors'
    );
  });

  it('offers touch mode its own entry point into the same panel', () => {
    // Touch opens the panel on About: the shortcut tabs need a keyboard.
    expect(TOUCH_STATUS_BAR_HELP_LABEL).toBe('About');
    // No (I) suffix: the hotkey it names is unreachable without a keyboard.
    expect(TOUCH_STATUS_BAR_HELP_TITLE).not.toContain('(');
    // The bar is a 44px border box (TouchStatusBar h-11) whose 1px border-t
    // leaves 43px of content, and the button stretches to that — within 1px of
    // the 44px guideline, so it needs no synthetic tap box, and must not carry
    // one:
    // touch-hit-44 centered on the old 24px bar overhung 10px of live canvas
    // above the bar and stole orbit gestures.
    expect(TOUCH_STATUS_BAR_HELP_BUTTON_CLASS).toBe(STATUS_BAR_SHORTCUTS_BUTTON_CLASS);
  });

  it('keeps the Shortcuts tooltip agreeing with the panel it opens and its hotkey', () => {
    // The tooltip hardcodes both, so assert the agreement rather than aliasing
    // the constants across directories.
    expect(STATUS_BAR_SHORTCUTS_TITLE).toContain(HOTKEY_HELP_TITLE);

    const letterKey = getHotkeyHelpToggleKeyLabels().find((label) => /^[A-Z]$/.test(label));
    expect(letterKey).toBeDefined();
    expect(STATUS_BAR_SHORTCUTS_TITLE).toContain(`(${letterKey})`);
  });

  it('visually hides the desktop status bar while preserving its hover target', () => {
    expect(STATUS_BAR_HIDDEN_CLASS_NAME).toBe('opacity-0');
    expect(statusBarStyles.container).toContain('absolute');
    expect(statusBarStyles.container).toContain('bottom-0');
    expect(getStatusBarContainerClassName({
      baseClassName: 'h-10 footer',
      hidden: false,
    })).toBe('h-10 footer');
    expect(getStatusBarContainerClassName({
      baseClassName: 'h-10 footer',
      hidden: true,
    })).toBe('h-10 footer opacity-0');
  });
});
