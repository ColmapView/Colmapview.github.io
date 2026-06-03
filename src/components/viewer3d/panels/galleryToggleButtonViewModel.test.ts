import { describe, expect, it } from 'vitest';
import { getGalleryToggleButtonState } from './galleryToggleButtonViewModel';

describe('gallery toggle button view-model helpers', () => {
  it('hides the gallery toggle in embed mode', () => {
    expect(getGalleryToggleButtonState({
      embedMode: true,
      touchMode: false,
      galleryCollapsed: false,
      touchGalleryDrawer: false,
    })).toEqual({
      isVisible: false,
      isOpen: false,
      icon: 'expand',
      tooltip: 'Show gallery',
      action: null,
    });
  });

  it('uses desktop gallery collapsed state outside touch mode', () => {
    expect(getGalleryToggleButtonState({
      embedMode: false,
      touchMode: false,
      galleryCollapsed: false,
      touchGalleryDrawer: false,
    })).toEqual({
      isVisible: true,
      isOpen: true,
      icon: 'collapse',
      tooltip: 'Hide gallery',
      action: 'toggleDesktopGallery',
    });

    expect(getGalleryToggleButtonState({
      embedMode: false,
      touchMode: false,
      galleryCollapsed: true,
      touchGalleryDrawer: true,
    })).toEqual({
      isVisible: true,
      isOpen: false,
      icon: 'expand',
      tooltip: 'Show gallery',
      action: 'toggleDesktopGallery',
    });
  });

  it('uses touch drawer state in touch mode', () => {
    expect(getGalleryToggleButtonState({
      embedMode: false,
      touchMode: true,
      galleryCollapsed: false,
      touchGalleryDrawer: true,
    })).toEqual({
      isVisible: true,
      isOpen: true,
      icon: 'collapse',
      tooltip: 'Hide gallery',
      action: 'toggleTouchGalleryDrawer',
    });

    expect(getGalleryToggleButtonState({
      embedMode: false,
      touchMode: true,
      galleryCollapsed: false,
      touchGalleryDrawer: false,
    })).toEqual({
      isVisible: true,
      isOpen: false,
      icon: 'expand',
      tooltip: 'Show gallery',
      action: 'toggleTouchGalleryDrawer',
    });
  });
});
