import type { CSSProperties } from 'react';
import { buttonStyles, Z_INDEX } from '../../theme';

export type HoveredDropZoneButton = 'url' | 'json' | 'toy' | null;

export interface DropZoneInfoLine {
  label?: string;
  text: string;
  muted?: boolean;
}

export const DROP_ZONE_DESKTOP_OVERLAY_CLASS = 'absolute inset-0 flex items-center justify-center p-4 overflow-y-auto';
export const DROP_ZONE_TOUCH_OVERLAY_CLASS = DROP_ZONE_DESKTOP_OVERLAY_CLASS;
export const DROP_ZONE_ICON_BUTTON_CLASS = `${buttonStyles.base} w-8 h-8 ${buttonStyles.variants.ghost}`;
export const DROP_ZONE_TOUCH_CLOSE_BUTTON_CLASS = `${buttonStyles.base} w-11 h-11 ${buttonStyles.variants.ghost} text-xl`;
// The broad browse target is the primary action; supporting actions stay quiet.
export const DROP_ZONE_BROWSE_BOX_CLASS =
  `${buttonStyles.base} w-full mt-4 mb-4 flex-col gap-2 border border-dashed border-ds-accent rounded-lg bg-ds-tertiary text-ds-primary hover-ds-hover`;
export const DROP_ZONE_DESKTOP_ACTION_BUTTON_ICON_CLASS = 'w-4 h-4 flex-shrink-0';
export const DROP_ZONE_TOUCH_ACTION_ICON_CLASS = 'w-5 h-5 mr-2';

export const DROP_ZONE_BROWSE_LABEL = 'Browse for a COLMAP dataset folder';
export const DROP_ZONE_UPLOAD_CONFIG_TOOLTIP = 'Upload configuration file (.yaml)';
export const DROP_ZONE_RESET_CONFIG_TOOLTIP = 'Reset all settings to defaults';
export const DROP_ZONE_DISMISS_TOOLTIP = 'Dismiss this panel';

export const DROP_ZONE_DESKTOP_TITLE = 'Load Dataset';
export const DROP_ZONE_DESKTOP_MESSAGE = 'or drag and drop a COLMAP dataset or image-only folder';
export const DROP_ZONE_TOUCH_TITLE = 'ColmapView';
export const DROP_ZONE_TOUCH_SUBTITLE = 'View COLMAP reconstructions and image galleries';
export const DROP_ZONE_TOUCH_FOOTER = 'Load a URL or try a sample dataset';

export const DROP_ZONE_INFO_LINES: DropZoneInfoLine[] = [
  { label: 'Drop folder or ZIP file', text: '- subfolders are scanned automatically' },
  { label: 'COLMAP:', text: 'cameras, images, points3D (.bin or .txt preferred)' },
  { label: 'Image-only:', text: 'jpg, png, webp, tiff folders are supported' },
  { label: 'Auto-detected:', text: 'sparse/0/, sparse/, or any subfolder' },
  { label: 'Optional:', text: 'source images, masks/, splats (.spz, .ply), config (.yaml)' },
  { text: 'ZIP: max 2GB, images loaded lazily on-demand', muted: true },
];

export const DROP_ZONE_ACTION_LABELS = {
  loadUrl: 'Load URL',
  // The file behind this button is a manifest (.json is just its encoding).
  loadJson: 'Load manifest',
  loadFromUrl: 'Load from URL',
  tryToy: 'Try a Toy!',
  dismiss: 'Dismiss',
} as const;

function withOptionalDisabledClass(baseClass: string, isDisabled: boolean): string {
  return isDisabled ? `${baseClass} ${buttonStyles.disabled}` : baseClass;
}

export function getDesktopDropZoneActionButtonClass(isDisabled: boolean): string {
  return withOptionalDisabledClass(
    `${buttonStyles.base} ${buttonStyles.sizes.action} w-full ${buttonStyles.variants.secondary}`,
    isDisabled,
  );
}

export function getTouchDropZoneUrlButtonClass(isDisabled: boolean): string {
  return withOptionalDisabledClass(
    `${buttonStyles.base} button-standard px-4 py-2 text-sm ${buttonStyles.variants.secondary} active-scale-98`,
    isDisabled,
  );
}

export function getTouchDropZoneToyButtonClass(isDisabled: boolean): string {
  return withOptionalDisabledClass(
    `${buttonStyles.base} button-standard px-4 py-2 text-sm ${buttonStyles.variants.primary} active-scale-98`,
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
