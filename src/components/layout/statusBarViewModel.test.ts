import { describe, expect, it } from 'vitest';
import {
  STATUS_BAR_COLMAP_LINK,
  STATUS_BAR_LINK_CLASS_NAME,
  STATUS_BAR_PROJECT_LINKS,
  formatStatusBarFps,
  getDesktopEmptyStatusText,
  getStatusBarLinkHoverColor,
  getStatusBarLinkRestColor,
  getStatusBarLinkStyle,
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
    })).toBe('Drop COLMAP folder to load');
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

  it('defines footer links and hover-color ownership data', () => {
    expect(STATUS_BAR_PROJECT_LINKS).toEqual([
      expect.objectContaining({
        label: '★ Star on GitHub',
        href: 'https://github.com/ColmapView/colmapview.github.io',
        color: 'github',
      }),
      expect.objectContaining({
        label: 'Report Bugs',
        href: 'https://github.com/ColmapView/colmapview.github.io/issues',
        color: 'bugs',
      }),
    ]);

    expect(STATUS_BAR_COLMAP_LINK).toEqual(expect.objectContaining({
      label: 'COLMAP',
      href: 'https://github.com/colmap/colmap',
      color: 'colmap',
    }));
  });

  it('derives link classes and color styles from link ownership data', () => {
    expect(STATUS_BAR_LINK_CLASS_NAME).toBe('no-underline transition-colors');
    expect(getStatusBarLinkStyle()).toEqual({ color: 'inherit' });
    expect(getStatusBarLinkStyle('#123456')).toEqual({ color: '#123456' });
    expect(getStatusBarLinkHoverColor(STATUS_BAR_PROJECT_LINKS[0])).toBe('#facc15');
    expect(getStatusBarLinkHoverColor(STATUS_BAR_PROJECT_LINKS[1])).toBe('#ef4444');
    expect(getStatusBarLinkHoverColor(STATUS_BAR_COLMAP_LINK)).toBe('#60a5fa');
    expect(getStatusBarLinkRestColor()).toBe('inherit');
  });
});
