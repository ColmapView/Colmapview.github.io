import { ARCHIVE_MIME_TYPES, hasArchiveExtension } from '../../utils/zipLoaderPolicy';

/** Drive imports offer ZIP and every TAR variant supported by the shared loader. */
export function isGoogleDriveArchiveFilename(filename: string): boolean {
  return hasArchiveExtension(filename) && !filename.toLowerCase().endsWith('.7z');
}

/** Include binary MIME types because Drive may classify uploaded TARs as generic files. */
export const GOOGLE_DRIVE_ARCHIVE_MIME_TYPES = [
  ...Array.from(ARCHIVE_MIME_TYPES).filter(type => type !== 'application/x-7z-compressed'),
  'application/x-zip-compressed',
  'application/x-compressed-tar',
  'application/octet-stream',
].join(',');
