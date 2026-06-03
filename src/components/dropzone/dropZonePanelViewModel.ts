import type { CSSProperties } from 'react';
import { buttonStyles, Z_INDEX } from '../../theme';

export type HoveredDropZoneButton = 'url' | 'json' | 'toy' | null;

export interface DropZoneInfoLine {
  label?: string;
  text: string;
  muted?: boolean;
}

export const DROP_ZONE_DESKTOP_OVERLAY_CLASS = 'absolute inset-0 flex items-center justify-center';
export const DROP_ZONE_TOUCH_OVERLAY_CLASS = `${DROP_ZONE_DESKTOP_OVERLAY_CLASS} px-3`;
export const DROP_ZONE_ICON_BUTTON_CLASS = `${buttonStyles.base} w-8 h-8 ${buttonStyles.variants.ghost}`;
export const DROP_ZONE_TOUCH_CLOSE_BUTTON_CLASS = `${buttonStyles.base} w-11 h-11 ${buttonStyles.variants.ghost} text-xl`;
export const DROP_ZONE_BROWSE_BOX_CLASS =
  'w-32 h-32 mt-6 mb-6 flex items-center justify-center border-2 border-dashed border-ds-muted rounded-lg cursor-pointer hover-border-ds-primary transition-colors';
export const DROP_ZONE_DESKTOP_ACTION_BUTTON_ICON_CLASS = 'w-3.5 h-3.5';
export const DROP_ZONE_TOUCH_ACTION_ICON_CLASS = 'w-5 h-5 mr-2';

export const DROP_ZONE_UPLOAD_CONFIG_TOOLTIP = 'Upload configuration file (.yaml)';
export const DROP_ZONE_RESET_CONFIG_TOOLTIP = 'Reset all settings to defaults';
export const DROP_ZONE_DISMISS_TOOLTIP = 'Dismiss this panel';

export const DROP_ZONE_DESKTOP_TITLE = 'Load COLMAP Data';
export const DROP_ZONE_DESKTOP_MESSAGE = 'Drag and drop a COLMAP dataset folder here.\nOr click the box above to browse.';
export const DROP_ZONE_TOUCH_TITLE = 'ColmapView';
export const DROP_ZONE_TOUCH_SUBTITLE = 'View COLMAP 3D reconstructions';
export const DROP_ZONE_TOUCH_FOOTER = 'Load a URL or try a sample dataset';

export const DROP_ZONE_INFO_LINES: DropZoneInfoLine[] = [
  { label: 'Drop folder or ZIP file', text: '- subfolders are scanned automatically' },
  { label: 'Required:', text: 'cameras, images, points3D (.bin or .txt preferred)' },
  { label: 'Auto-detected:', text: 'sparse/0/, sparse/, or any subfolder' },
  { label: 'Optional:', text: 'source images (jpg, png, webp, tiff), config (.yaml), masks/' },
  { text: 'ZIP: max 2GB, images loaded lazily on-demand', muted: true },
];

export const DROP_ZONE_ACTION_LABELS = {
  loadUrl: 'Load URL',
  loadJson: 'Load JSON',
  loadFromUrl: 'Load from URL',
  tryToy: 'Try a Toy!',
  dismiss: 'Dismiss',
} as const;

function withOptionalDisabledClass(baseClass: string, isDisabled: boolean): string {
  return isDisabled ? `${baseClass} ${buttonStyles.disabled}` : baseClass;
}

export function getDesktopDropZoneActionButtonClass(isDisabled: boolean): string {
  return withOptionalDisabledClass(
    `${buttonStyles.base} ${buttonStyles.sizes.action} ${buttonStyles.variants.secondary}`,
    isDisabled,
  );
}

export function getTouchDropZoneUrlButtonClass(isDisabled: boolean): string {
  return withOptionalDisabledClass(
    `${buttonStyles.base} h-12 text-sm ${buttonStyles.variants.secondary} active:scale-98`,
    isDisabled,
  );
}

export function getTouchDropZoneToyButtonClass(isDisabled: boolean): string {
  return withOptionalDisabledClass(
    `${buttonStyles.base} h-12 text-sm ${buttonStyles.variants.primary} active:scale-98`,
    isDisabled,
  );
}

export function getDropZoneInfoLineClass(isMuted: boolean): string {
  return `info-line px-2 rounded${isMuted ? ' text-ds-muted/70' : ''}`;
}

export function getDropZonePanelOverlayStyle(): CSSProperties {
  return {
    zIndex: Z_INDEX.controls,
  };
}

export function getDropZoneBrowseIconStyle(): CSSProperties {
  return {
    fontSize: '72px',
  };
}
