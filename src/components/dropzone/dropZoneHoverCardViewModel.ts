import type { CSSProperties } from 'react';
import { Z_INDEX } from '../../theme';
import { ARCHIVE_EXTENSIONS } from '../../utils/zipLoader';

export type DropZoneHoverCardHintIcon = 'mouse-left' | 'mouse-right';

export interface DropZoneHoverCardHintRow {
  icon: DropZoneHoverCardHintIcon;
  label: string;
}

export const DROP_ZONE_HOVER_CARD_POSITION_CLASS =
  'absolute left-1/2 -translate-x-1/2 bottom-full mb-2';

export const LOAD_URL_HOVER_CARD_TITLE = 'Load from URL';
export const LOAD_URL_DIRECT_EXAMPLE = `Direct URL expects:
  <baseUrl>/sparse/0/cameras.bin
  <baseUrl>/sparse/0/images.bin
  <baseUrl>/sparse/0/points3D.bin
  <baseUrl>/images/  (optional)
  <baseUrl>/masks/   (optional)
  <baseUrl>/splats/  (optional .spz/.ply)`;
export const LOAD_URL_SUPPORTED_SOURCES = 'Supports: S3, GCS, R2, Dropbox, HuggingFace, GitHub';
export const LOAD_URL_LOCAL_SERVER_HINT = 'Local server: npx http-server --cors -p 8080';
export const LOAD_URL_HINT_ROWS: DropZoneHoverCardHintRow[] = [
  { icon: 'mouse-left', label: 'Left: open URL dialog' },
  { icon: 'mouse-right', label: 'Right: open NGS dataset' },
];

export const LOAD_JSON_HOVER_CARD_TITLE = 'Load manifest.json';
export const LOAD_JSON_MANIFEST_EXAMPLE = `{
  "version": 1,
  "baseUrl": "https://...",
  "files": {
    "cameras": "sparse/0/cameras.bin",
    "images": "sparse/0/images.bin",
    "points3D": "sparse/0/points3D.bin"
  },
  "imagesPath": "images/",
  "masksPath": "masks/",
  "splats": ["splats/model.spz"]
}`;
export const LOAD_JSON_HINT_ROWS: DropZoneHoverCardHintRow[] = [
  { icon: 'mouse-left', label: 'Left: browse manifest file' },
  { icon: 'mouse-right', label: 'Right: download example' },
];

export const TOY_HOVER_CARD_TITLE = 'Load random 3D scan';
export const TOY_HOVER_CARD_SUBTITLE = 'Multiview data from OpsiClear NGS dataset';
export const TOY_HOVER_CARD_SOURCE = 'huggingface.co/datasets/OpsiClear/NGS';
export const TOY_HOVER_CARD_INCLUDES = 'Includes: images, masks, sparse reconstruction';
export const TOY_HINT_ROWS: DropZoneHoverCardHintRow[] = [
  { icon: 'mouse-left', label: 'Left: load random scan' },
];

export function getArchiveFormatsHint(archiveExtensions: readonly string[] = ARCHIVE_EXTENSIONS): string {
  return `${archiveExtensions.join(' / ')} / manifest.json`;
}

export function getArchiveUrlCopy(archiveExtensions?: readonly string[]): string {
  return `Or provide a ${getArchiveFormatsHint(archiveExtensions)} URL`;
}

export function getDropZoneHoverCardStyle(): CSSProperties {
  return {
    zIndex: Z_INDEX.dropdown,
  };
}
