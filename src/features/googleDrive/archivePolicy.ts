import { ARCHIVE_MIME_TYPES, hasArchiveExtension } from '../../utils/zipLoaderPolicy';
import { hasControlCharacters } from '../../utils/controlCharacters';
import { GoogleDrivePublishError } from './upload';

/** The publisher's file name limit, in UTF-16 units. */
export const DRIVE_FILE_NAME_MAX = 180;

export function normalizeDriveArchiveName(input: string): string {
  const name = input.trim();
  if (!name || name.length > DRIVE_FILE_NAME_MAX || /[\\/]/.test(name) || /^\.+$/.test(name) || hasControlCharacters(name)) {
    throw new GoogleDrivePublishError(`Choose a file name without slashes or control characters (up to ${DRIVE_FILE_NAME_MAX} characters).`);
  }
  return /\.zip$/i.test(name) ? name : `${name}.zip`;
}

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
