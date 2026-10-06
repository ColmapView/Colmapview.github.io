import type { CSSProperties } from 'react';
import { Z_INDEX } from '../../theme';
import { GOOGLE_DRIVE_ENABLED_ORIGIN } from '../../features/googleDrive/config';
import { parseGoogleDriveFileUrl } from '../../utils/googleDriveUrl';

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
  'Enter a public Google Drive ZIP or TAR link, an archive URL (.zip, .tar), a manifest URL (.json), or a COLMAP folder URL';

export const URL_INPUT_PLACEHOLDER =
  'https://huggingface.co/.../resolve/main/reconstruction';

export const URL_INPUT_WARNING_TITLE_CLASS = 'font-medium text-ds-warning mb-1';
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
    title: 'Google Drive',
    items: [
      { code: 'https://drive.google.com/file/d/FILE_ID/view' },
      { text: 'Public ZIP or TAR files shared with Anyone with the link load without sign-in.', muted: true },
      { text: 'For private ZIP or TAR files, use the Google Drive account icon on the loading page and choose a file.', muted: true },
      { text: 'The complete archive downloads before loading. Maximum archive size: 2GB.', muted: true },
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

/** Only carry a canonical file link, never credentials or unrelated viewer state. */
export function getUrlInputDriveHandoffUrl(url: string, googleDriveEnabled: boolean): string | null {
  if (googleDriveEnabled) return null;
  try {
    const driveFile = parseGoogleDriveFileUrl(url.trim());
    if (!driveFile) return null;
    const destination = new URL(GOOGLE_DRIVE_ENABLED_ORIGIN);
    destination.searchParams.set('url', driveFile.sourceUrl);
    return destination.href;
  } catch {
    return null;
  }
}

export function getUrlInputHelpSections(googleDriveEnabled: boolean): readonly UrlInputHelpSection[] {
  if (googleDriveEnabled) return URL_INPUT_HELP_SECTIONS;
  return URL_INPUT_HELP_SECTIONS.map(section => section.title !== 'Google Drive' ? section : {
    ...section,
    items: [
      section.items[0],
      { text: 'Use Google Drive on colmapview.opsiclear.com to open ZIP or TAR archives.', muted: true },
      { text: 'Public links work without sign-in. For private files, sign in and choose a file.', muted: true },
      section.items[3],
    ],
  });
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
