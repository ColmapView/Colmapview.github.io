import { describe, expect, it } from 'vitest';
import {
  getAppLayoutGuideTip,
  getDraggedGalleryPanelWidth,
  getGalleryCollapseHandleState,
  getGalleryPanelInnerStyle,
  getGalleryPanelStyle,
  getInitialGalleryPanelWidth,
  getWindowResizedGalleryPanelWidth,
  shouldHideInlineGallery,
  TOUCH_LAYOUT_ROOT_CLASS,
} from './appLayoutPolicy';
import { getGalleryToggleButtonState } from '../viewer3d/panels/galleryToggleButtonViewModel';

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

  it('keeps the divider (and its collapse handle) mounted while the gallery is collapsed', () => {
    expect(getGalleryCollapseHandleState({
      embedMode: false,
      touchMode: false,
      galleryCollapsed: false,
    })).toEqual({
      isVisible: true,
      isCollapsed: false,
      canResize: true,
      icon: 'collapse',
      tooltip: 'Hide gallery',
    });

    // The divider used to be gated on shouldHideInlineGallery, which folds
    // galleryCollapsed in — collapsing removed the only edge affordance.
    expect(shouldHideInlineGallery({
      embedMode: false,
      touchMode: false,
      galleryCollapsed: true,
    })).toBe(true);
    expect(getGalleryCollapseHandleState({
      embedMode: false,
      touchMode: false,
      galleryCollapsed: true,
    })).toEqual({
      isVisible: true,
      isCollapsed: true,
      canResize: false,
      icon: 'expand',
      tooltip: 'Show gallery',
    });
  });

  it('drops the divider entirely in embed and touch mode', () => {
    expect(getGalleryCollapseHandleState({
      embedMode: true,
      touchMode: false,
      galleryCollapsed: false,
    })).toMatchObject({ isVisible: false, canResize: false });

    expect(getGalleryCollapseHandleState({
      embedMode: false,
      touchMode: true,
      galleryCollapsed: false,
    })).toMatchObject({ isVisible: false, canResize: false });
  });

  it('labels the collapse handle with the same copy as the toolbar gallery button', () => {
    for (const galleryCollapsed of [false, true]) {
      expect(getGalleryCollapseHandleState({
        embedMode: false,
        touchMode: false,
        galleryCollapsed,
      }).tooltip).toBe(getGalleryToggleButtonState({
        embedMode: false,
        touchMode: false,
        galleryCollapsed,
        touchGalleryDrawer: false,
      }).tooltip);
    }
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

  it('selects the first-load guide tip in touch mode only', () => {
    expect(getAppLayoutGuideTip({
      hasReconstruction: false,
      urlLoading: false,
      touchMode: true,
      hasShownTip: false,
    })).toBeNull();

    expect(getAppLayoutGuideTip({
      hasReconstruction: true,
      urlLoading: true,
      touchMode: true,
      hasShownTip: false,
    })).toBeNull();

    expect(getAppLayoutGuideTip({
      hasReconstruction: true,
      urlLoading: false,
      touchMode: true,
      hasShownTip: true,
    })).toBeNull();

    // Desktop gets no first-load tip: the retired right-click instruction is
    // replaced by the alignment tools being visible in the toolbar.
    expect(getAppLayoutGuideTip({
      hasReconstruction: true,
      urlLoading: false,
      touchMode: false,
      hasShownTip: false,
    })).toBeNull();

    expect(getAppLayoutGuideTip({
      hasReconstruction: true,
      urlLoading: false,
      touchMode: true,
      hasShownTip: false,
    })).toEqual({
      id: 'touchCameraTaps',
      message: 'Tap a camera to select it, tap again to fly in. Long-press opens its photo.',
    });
  });

  describe('TOUCH_LAYOUT_ROOT_CLASS', () => {
    it('pins page containment and notch safe-area handling on the touch shell', () => {
      expect(TOUCH_LAYOUT_ROOT_CLASS).toContain('touch-none');
      expect(TOUCH_LAYOUT_ROOT_CLASS).toContain('safe-area-inset');
      expect(TOUCH_LAYOUT_ROOT_CLASS).toContain('h-screen');
    });
  });
});
