import type { CSSProperties } from 'react';
import { Z_INDEX } from '../../theme';

export type UrlInputHelpIconKind = 'open' | 'closed';

export interface UrlInputActionState {
  canLoad: boolean;
  cancelDisabled: boolean;
  loadDisabled: boolean;
  loadLabel: string;
  normalizedUrl: string;
}

export interface UrlInputHelpSection {
  title: string;
  items: readonly UrlInputHelpItem[];
  tone?: 'default' | 'warning';
}

export interface UrlInputHelpItem {
  code?: string;
  text?: string;
  suffix?: string;
  muted?: boolean;
}

export const URL_INPUT_DESCRIPTION =
  'Enter a manifest URL (.json), a ZIP file URL (.zip), or a direct path to a COLMAP folder';

export const URL_INPUT_PLACEHOLDER =
  'https://huggingface.co/.../resolve/main/reconstruction';

export const URL_INPUT_WARNING_TITLE_CLASS = 'font-medium text-amber-400 mb-1';
export const URL_INPUT_DEFAULT_TITLE_CLASS = 'font-medium text-ds-primary mb-2';
export const URL_INPUT_WARNING_TEXT_CLASS = 'text-ds-muted/80';
export const URL_INPUT_HELP_LIST_CLASS = 'space-y-1 mb-3';
export const URL_INPUT_HELP_ITEM_MUTED_CLASS = 'text-ds-muted/70';
export const URL_INPUT_HELP_CODE_CLASS = 'text-ds-accent';

export const URL_INPUT_HELP_SECTIONS: readonly UrlInputHelpSection[] = [
  {
    title: 'ZIP Files',
    items: [
      { code: 'https://example.com/reconstruction.zip' },
      { text: 'ZIP should contain cameras.bin, images.bin, points3D.bin', muted: true },
      { text: 'Images in ZIP are loaded lazily on-demand', muted: true },
      { text: 'Maximum ZIP size: 2GB', muted: true },
    ],
  },
  {
    title: 'Cloud Storage URLs',
    items: [
      { code: 's3://bucket/path', suffix: ' - AWS S3' },
      { code: 'gs://bucket/path', suffix: ' - Google Cloud Storage' },
      { code: 'https://bucket.s3.amazonaws.com/path' },
      { code: 'https://storage.googleapis.com/bucket/path' },
      { code: 'https://account.r2.cloudflarestorage.com/bucket/path' },
    ],
  },
  {
    title: 'Dropbox',
    items: [
      { code: 'https://www.dropbox.com/s/.../file.txt?dl=0' },
      { code: 'https://www.dropbox.com/scl/fi/.../file.txt?rlkey=...' },
      { text: 'Share links auto-converted to direct downloads', muted: true },
    ],
  },
  {
    title: 'Git Hosting URLs',
    items: [
      { code: 'https://huggingface.co/.../resolve/main/...' },
      { code: 'https://github.com/.../blob/main/...' },
      { code: 'https://gitlab.com/.../-/blob/main/...' },
    ],
  },
  {
    title: 'Local / Self-hosted Server',
    items: [
      { code: 'http://localhost:8080/' },
      { text: 'Start with:', code: 'npx http-server --cors -p 8080', muted: true },
    ],
  },
  {
    title: 'CORS Requirements',
    items: [
      {
        text: 'Cloud buckets must have CORS configured. Dropbox, pre-signed URLs, and same-origin servers work automatically.',
      },
    ],
    tone: 'warning',
  },
];

export function getUrlInputActionState(url: string, loading: boolean): UrlInputActionState {
  const normalizedUrl = url.trim();
  const canLoad = normalizedUrl !== '' && !loading;

  return {
    canLoad,
    cancelDisabled: loading,
    loadDisabled: !canLoad,
    loadLabel: loading ? 'Loading...' : 'Load',
    normalizedUrl,
  };
}

export function getUrlInputSubmitUrl(url: string, loading: boolean): string | null {
  const { canLoad, normalizedUrl } = getUrlInputActionState(url, loading);
  return canLoad ? normalizedUrl : null;
}

export function shouldSubmitUrlInputKey(key: string, loading: boolean): boolean {
  return key === 'Enter' && !loading;
}

export function shouldCloseUrlInputFromBackdrop(
  isBackdropTarget: boolean,
  loading: boolean
): boolean {
  return isBackdropTarget && !loading;
}

export function getUrlInputHelpIconKind(showHelp: boolean): UrlInputHelpIconKind {
  return showHelp ? 'open' : 'closed';
}

export function getUrlInputModalOverlayStyle(zIndex = Z_INDEX.modalOverlay): CSSProperties {
  return { zIndex };
}

export function getUrlInputHelpSectionTitleClassName(
  section: Pick<UrlInputHelpSection, 'tone'>
): string {
  return isUrlInputWarningHelpSection(section)
    ? URL_INPUT_WARNING_TITLE_CLASS
    : URL_INPUT_DEFAULT_TITLE_CLASS;
}

export function isUrlInputWarningHelpSection(
  section: Pick<UrlInputHelpSection, 'tone'>
): boolean {
  return section.tone === 'warning';
}

export function getUrlInputWarningHelpText(section: Pick<UrlInputHelpSection, 'items'>): string {
  return section.items[0]?.text ?? '';
}

export function getUrlInputHelpItemClassName(
  item: Pick<UrlInputHelpItem, 'muted'>
): string | undefined {
  return item.muted ? URL_INPUT_HELP_ITEM_MUTED_CLASS : undefined;
}

export function getUrlInputHelpItemKey(item: UrlInputHelpItem): string {
  return `${item.code ?? ''}${item.text ?? ''}${item.suffix ?? ''}`;
}
