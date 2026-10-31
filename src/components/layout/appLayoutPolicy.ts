import type { CSSProperties } from 'react';
import {
  GALLERY_TOGGLE_TOOLTIP_COLLAPSED,
  GALLERY_TOGGLE_TOOLTIP_OPEN,
} from '../viewer3d/panels/galleryToggleButtonViewModel';

export const APP_LAYOUT_MIN_PANEL_WIDTH = 300;
export const APP_LAYOUT_MAX_PANEL_WIDTH_PERCENT = 0.6;
export const APP_LAYOUT_CURSOR_OWNER = 'app-layout';

/**
 * Touch-layout shell classes. `safe-area-inset` pads the UI clear of notches
 * and the home indicator (requires viewport-fit=cover in index.html);
 * `touch-none` disables browser gestures inside the app shell.
 */
export const TOUCH_LAYOUT_ROOT_CLASS = 'h-screen flex flex-col bg-ds-primary touch-none safe-area-inset';

/**
 * First-load guide tip. Touch only: the desktop right-click instruction was
 * retired once the alignment tools became visible in the toolbar, so the
 * context menu no longer needs to be advertised on load.
 */
export type AppLayoutGuideTip = { id: 'touchCameraTaps'; message: 'Tap a camera to select it, tap again to fly in. Long-press opens its photo.' };

export function getInitialGalleryPanelWidth(
  windowWidth: number,
  defaultWidthPercent: number
): number {
  return Math.round(windowWidth * (defaultWidthPercent / 100));
}

export function getDraggedGalleryPanelWidth({
  windowWidth,
  clientX,
  minWidth = APP_LAYOUT_MIN_PANEL_WIDTH,
  maxWidthPercent = APP_LAYOUT_MAX_PANEL_WIDTH_PERCENT,
}: {
  windowWidth: number;
  clientX: number;
  minWidth?: number;
  maxWidthPercent?: number;
}): number {
  const requestedWidth = windowWidth - clientX;
  const maxWidth = windowWidth * maxWidthPercent;
  return Math.max(minWidth, Math.min(maxWidth, requestedWidth));
}

export function getWindowResizedGalleryPanelWidth({
  currentWidth,
  windowWidth,
  maxWidthPercent = APP_LAYOUT_MAX_PANEL_WIDTH_PERCENT,
}: {
  currentWidth: number;
  windowWidth: number;
  maxWidthPercent?: number;
}): number {
  return Math.min(currentWidth, windowWidth * maxWidthPercent);
}

export function shouldHideInlineGallery({
  embedMode,
  touchMode,
  galleryCollapsed,
}: {
  embedMode: boolean;
  touchMode: boolean;
  galleryCollapsed: boolean;
}): boolean {
  return embedMode || touchMode || galleryCollapsed;
}

export type GalleryCollapseHandleIcon = 'collapse' | 'expand';

export interface GalleryCollapseHandleState {
  /** The divider (and with it the handle) renders at all. */
  isVisible: boolean;
  isCollapsed: boolean;
  /** Drag-to-resize is only meaningful while the gallery has a width to drag. */
  canResize: boolean;
  icon: GalleryCollapseHandleIcon;
  tooltip: string;
}

/**
 * The viewer↔gallery divider and the collapse handle it carries.
 *
 * Deliberately NOT keyed off `shouldHideInlineGallery`: that predicate folds
 * `galleryCollapsed` in, and the divider used to be gated on it — which meant
 * the moment the gallery collapsed, the divider (and any affordance mounted on
 * it) unmounted, leaving no edge control to bring the gallery back. The divider
 * therefore survives collapse; only the drag-to-resize behaviour goes away with
 * the panel width.
 *
 * Touch mode never reaches here — AppLayout returns the touch shell before the
 * desktop tree renders — so the handle needs no touch-target sizing.
 */
export function getGalleryCollapseHandleState({
  embedMode,
  touchMode,
  galleryCollapsed,
}: {
  embedMode: boolean;
  touchMode: boolean;
  galleryCollapsed: boolean;
}): GalleryCollapseHandleState {
  const isVisible = !embedMode && !touchMode;

  return {
    isVisible,
    isCollapsed: galleryCollapsed,
    canResize: isVisible && !galleryCollapsed,
    icon: galleryCollapsed ? 'expand' : 'collapse',
    tooltip: galleryCollapsed ? GALLERY_TOGGLE_TOOLTIP_COLLAPSED : GALLERY_TOGGLE_TOOLTIP_OPEN,
  };
}

export function getGalleryPanelStyle({
  hideGallery,
  panelWidth,
}: {
  hideGallery: boolean;
  panelWidth: number;
}): CSSProperties {
  return {
    width: hideGallery ? 0 : panelWidth,
  };
}

export function getGalleryPanelInnerStyle(
  minWidth = APP_LAYOUT_MIN_PANEL_WIDTH
): CSSProperties {
  return {
    minWidth: `${minWidth}px`,
  };
}

export function getAppLayoutGuideTip({
  hasReconstruction,
  urlLoading,
  touchMode,
  hasShownTip,
}: {
  hasReconstruction: boolean;
  urlLoading: boolean;
  touchMode: boolean;
  hasShownTip: boolean;
}): AppLayoutGuideTip | null {
  if (!hasReconstruction || urlLoading || hasShownTip || !touchMode) {
    return null;
  }

  return { id: 'touchCameraTaps', message: 'Tap a camera to select it, tap again to fly in. Long-press opens its photo.' };
}
