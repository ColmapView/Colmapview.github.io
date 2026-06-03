import { describe, expect, it } from 'vitest';
import {
  getTouchGalleryDrawerPanelStyle,
  TOUCH_GALLERY_DRAWER_BACKDROP_CLASS,
  TOUCH_GALLERY_DRAWER_BODY_OPEN_OVERFLOW,
  TOUCH_GALLERY_DRAWER_BODY_RESET_OVERFLOW,
  TOUCH_GALLERY_DRAWER_MAX_VIEWPORT_WIDTH,
  TOUCH_GALLERY_DRAWER_PANEL_CLASS,
  getTouchGalleryDrawerCloseThreshold,
  getTouchGalleryDrawerEndAction,
  getTouchGalleryDrawerMoveState,
} from './touchGalleryDrawerPolicy';

describe('touch gallery drawer policy', () => {
  it('uses the smaller of 100px or 30% of drawer width for the close threshold', () => {
    expect(getTouchGalleryDrawerCloseThreshold(200)).toBe(60);
    expect(getTouchGalleryDrawerCloseThreshold(500)).toBe(100);
  });

  it('tracks only rightward drawer swipes', () => {
    expect(getTouchGalleryDrawerMoveState({
      startX: null,
      clientX: 120,
    })).toEqual({ type: 'none' });

    expect(getTouchGalleryDrawerMoveState({
      startX: 120,
      clientX: 90,
    })).toEqual({ type: 'none' });

    expect(getTouchGalleryDrawerMoveState({
      startX: 120,
      clientX: 175,
    })).toEqual({
      type: 'dragging',
      deltaX: 55,
      transform: 'translateX(55px)',
    });
  });

  it('keeps missing gestures idle, snaps short swipes back, and closes long swipes', () => {
    expect(getTouchGalleryDrawerEndAction({
      startX: null,
      deltaX: 120,
      drawerWidth: 360,
    })).toBe('none');

    expect(getTouchGalleryDrawerEndAction({
      startX: 10,
      deltaX: 100,
      drawerWidth: 400,
    })).toBe('snapBack');

    expect(getTouchGalleryDrawerEndAction({
      startX: 10,
      deltaX: 101,
      drawerWidth: 400,
    })).toBe('close');
  });

  it('derives drawer render constants and width style', () => {
    expect(TOUCH_GALLERY_DRAWER_BACKDROP_CLASS).toContain('z-[997]');
    expect(TOUCH_GALLERY_DRAWER_PANEL_CLASS).toContain('z-[998]');
    expect(TOUCH_GALLERY_DRAWER_BODY_OPEN_OVERFLOW).toBe('hidden');
    expect(TOUCH_GALLERY_DRAWER_BODY_RESET_OVERFLOW).toBe('');
    expect(TOUCH_GALLERY_DRAWER_MAX_VIEWPORT_WIDTH).toBe('85vw');
    expect(getTouchGalleryDrawerPanelStyle(320)).toEqual({
      width: 'min(320px, 85vw)',
    });
    expect(getTouchGalleryDrawerPanelStyle(400, '90vw')).toEqual({
      width: 'min(400px, 90vw)',
    });
  });
});
