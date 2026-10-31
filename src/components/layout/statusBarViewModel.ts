import { HOTKEY_HELP_TITLE } from '../modals/hotkeyHelpViewModel';

export const STATUS_BAR_HIDDEN_CLASS_NAME = 'opacity-0';

export const STATUS_BAR_SHORTCUTS_LABEL = '⌨ Shortcuts';
// Agrees with HOTKEY_HELP_TITLE and the showHelp binding by literal, not by
// import (statusBarViewModel.test.ts asserts both) — this is the desktop bar's
// pointer entry point; touch mode has its own below.
export const STATUS_BAR_SHORTCUTS_TITLE = 'Help & keyboard shortcuts (I)';
// Plain text button: the global `button` reset in index.css already clears the
// background, border, padding, and font-size, so the class only has to state
// the muted-to-bright text behavior the rest of the bar uses.
export const STATUS_BAR_SHORTCUTS_BUTTON_CLASS =
  'text-ds-secondary hover-ds-text-primary cursor-pointer transition-colors';

// Touch mode's entry into the same panel. It is the only pointer route there on
// a phone or tablet — the desktop status bar is not rendered and the I / Shift+?
// bindings need a keyboard — so the label advertises Help rather than the
// desktop bar's keyboard-shortcuts framing, and the title drops the (I) suffix
// that nothing on a touch device can press.
export const TOUCH_STATUS_BAR_HELP_LABEL = 'About';
// Aliased, not re-typed: renaming the panel must rename this tooltip with it.
export const TOUCH_STATUS_BAR_HELP_TITLE = HOTKEY_HELP_TITLE;
// No synthetic tap box: the touch bar is a 44px border box (h-11 in
// TouchStatusBar) whose 1px border-t leaves a 43px content box, and the button
// stretches to fill that (self-stretch, applied at the usage site) — its real
// box is 43px, above the 40px desktop status bar and within 1px of the 44px
// guideline, so the remaining pixel is not worth buying.
// touch-hit-44 is BANNED here — centered on a bottom-of-screen bar it can
// only overhang upward, over the live canvas, where it steals orbit
// gestures (found by adversarial review 2026-08-29).
export const TOUCH_STATUS_BAR_HELP_BUTTON_CLASS = STATUS_BAR_SHORTCUTS_BUTTON_CLASS;

export function formatStatusBarFps(fps: number): string {
  return `${fps} FPS`;
}

export function getStatusBarContainerClassName({
  baseClassName,
  hidden,
}: {
  baseClassName: string;
  hidden: boolean;
}): string {
  return hidden ? `${baseClassName} ${STATUS_BAR_HIDDEN_CLASS_NAME}` : baseClassName;
}

export function getDesktopEmptyStatusText({
  hasReconstruction,
  urlLoading,
}: {
  hasReconstruction: boolean;
  urlLoading: boolean;
}): string | null {
  if (hasReconstruction) return null;
  return urlLoading ? 'Loading...' : 'Drop dataset or images to load';
}

export function getTouchEmptyStatusText({
  hasReconstruction,
  urlLoading,
}: {
  hasReconstruction: boolean;
  urlLoading: boolean;
}): string | null {
  if (hasReconstruction) return null;
  return urlLoading ? 'Loading...' : '';
}

export function shouldShowStatusHistograms({
  hasReconstruction,
  hasGlobalStats,
}: {
  hasReconstruction: boolean;
  hasGlobalStats: boolean;
}): boolean {
  return hasReconstruction && hasGlobalStats;
}

export function shouldShowTouchStatusBar(statusBarVisible: boolean): boolean {
  return statusBarVisible;
}
