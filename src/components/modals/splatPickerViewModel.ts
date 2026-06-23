import type { CSSProperties } from 'react';
import { Z_INDEX } from '../../theme/zIndex';
import type { SplatFileSource } from '../../types/colmap';

export interface SplatPickerItem {
  id: string;
  name: string;
  sizeLabel: string;
}

// Row classes for the picker. This project has NO Tailwind — only the hand-written
// utilities in src/index.css exist — so use the hyphen-form hover utility
// (`hover-ds-hover`) and `flex-shrink-0`. Tailwind-style `hover:bg-*` and
// `shrink-0` are silent no-ops here (see the no-tailwind project note).
export const SPLAT_PICKER_NONE_ROW_CLASS =
  'text-left px-3 py-2 rounded text-ds-secondary hover-ds-hover cursor-pointer text-sm';
export const SPLAT_PICKER_ROW_CLASS =
  'flex items-center justify-between gap-3 px-3 py-2 rounded text-ds-primary hover-ds-hover cursor-pointer text-sm';
export const SPLAT_PICKER_SIZE_CLASS = 'flex-shrink-0 text-ds-muted text-xs';

/**
 * Overlay z-index for the splat picker. Matches UrlInputModal (both are
 * load-time dialogs that must sit above the loading overlay, Z_INDEX.overlay).
 * Applied inline because this project's Tailwind does not generate arbitrary
 * z-index utilities (e.g. `z-[600]`).
 */
export function getSplatPickerOverlayStyle(): CSSProperties {
  return { zIndex: Z_INDEX.modalOverlay };
}

/**
 * Panel sizing for the splat picker. maxHeight caps the list so it scrolls
 * internally instead of overflowing the viewport; maxWidth keeps it on-screen
 * on narrow viewports. Applied inline because this project's Tailwind does not
 * generate arbitrary viewport-unit utilities (e.g. `max-h-[70vh]`, `max-w-[90vw]`).
 */
export function getSplatPickerPanelStyle(): CSSProperties {
  return { maxWidth: '90vw', maxHeight: '70vh' };
}

/** Human-readable size for the splat picker (e.g. "91 MB", "4.3 GB"). */
export function formatSplatSize(bytes: number | undefined): string {
  if (bytes === undefined || !Number.isFinite(bytes) || bytes <= 0) {
    return '';
  }
  const mb = bytes / 1_000_000;
  if (mb >= 1000) {
    return `${(mb / 1000).toFixed(1)} GB`;
  }
  if (mb >= 1) {
    return `${Math.round(mb)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1000))} KB`;
}

/** Build the picker rows from splat sources (filename + size). */
export function getSplatPickerItems(sources: readonly SplatFileSource[]): SplatPickerItem[] {
  return sources.map((source) => ({
    id: source.id,
    name: source.path.split('/').pop() || source.path,
    sizeLabel: formatSplatSize(source.size),
  }));
}
