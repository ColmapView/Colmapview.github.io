import { describe, expect, it } from 'vitest';
import {
  getAppLayoutGuideTip,
  getDraggedGalleryPanelWidth,
  getGalleryPanelInnerStyle,
  getGalleryPanelStyle,
  getInitialGalleryPanelWidth,
  getWindowResizedGalleryPanelWidth,
  shouldHideInlineGallery,
} from './appLayoutPolicy';

describe('app layout policy', () => {
  it('derives the initial gallery panel width from the configured percent', () => {
    expect(getInitialGalleryPanelWidth(1_200, 25)).toBe(300);
    expect(getInitialGalleryPanelWidth(1_001, 33)).toBe(330);
  });

  it('clamps dragged gallery panel width to the desktop bounds', () => {
    expect(getDraggedGalleryPanelWidth({
      windowWidth: 1_000,
      clientX: 100,
    })).toBe(600);

    expect(getDraggedGalleryPanelWidth({
      windowWidth: 1_000,
      clientX: 900,
    })).toBe(300);

    expect(getDraggedGalleryPanelWidth({
      windowWidth: 1_000,
      clientX: 500,
    })).toBe(500);
  });

  it('only shrinks the panel when the viewport max becomes smaller', () => {
    expect(getWindowResizedGalleryPanelWidth({
      currentWidth: 500,
      windowWidth: 1_000,
    })).toBe(500);

    expect(getWindowResizedGalleryPanelWidth({
      currentWidth: 500,
      windowWidth: 700,
    })).toBe(420);
  });

  it('hides the inline gallery in collapsed, touch, or embed mode', () => {
    expect(shouldHideInlineGallery({
      embedMode: false,
      touchMode: false,
      galleryCollapsed: false,
    })).toBe(false);

    expect(shouldHideInlineGallery({
      embedMode: true,
      touchMode: false,
      galleryCollapsed: false,
    })).toBe(true);

    expect(shouldHideInlineGallery({
      embedMode: false,
      touchMode: true,
      galleryCollapsed: false,
    })).toBe(true);

    expect(shouldHideInlineGallery({
      embedMode: false,
      touchMode: false,
      galleryCollapsed: true,
    })).toBe(true);
  });

  it('builds gallery panel styles from visibility and sizing state', () => {
    expect(getGalleryPanelStyle({
      hideGallery: false,
      panelWidth: 360,
    })).toEqual({
      width: 360,
    });

    expect(getGalleryPanelStyle({
      hideGallery: true,
      panelWidth: 360,
    })).toEqual({
      width: 0,
    });

    expect(getGalleryPanelInnerStyle()).toEqual({
      minWidth: '300px',
    });
    expect(getGalleryPanelInnerStyle(420)).toEqual({
      minWidth: '420px',
    });
  });

  it('selects the first-load guide tip for desktop or touch mode', () => {
    expect(getAppLayoutGuideTip({
      hasReconstruction: false,
      urlLoading: false,
      touchMode: false,
      hasShownTip: false,
    })).toBeNull();

    expect(getAppLayoutGuideTip({
      hasReconstruction: true,
      urlLoading: true,
      touchMode: false,
      hasShownTip: false,
    })).toBeNull();

    expect(getAppLayoutGuideTip({
      hasReconstruction: true,
      urlLoading: false,
      touchMode: false,
      hasShownTip: true,
    })).toBeNull();

    expect(getAppLayoutGuideTip({
      hasReconstruction: true,
      urlLoading: false,
      touchMode: false,
      hasShownTip: false,
    })).toEqual({
      id: 'contextMenu',
      message: 'Right-click anywhere for quick actions',
    });

    expect(getAppLayoutGuideTip({
      hasReconstruction: true,
      urlLoading: false,
      touchMode: true,
      hasShownTip: false,
    })).toEqual({
      id: 'touchMode',
      message: 'Tap to select, long-press for options',
    });
  });
});
