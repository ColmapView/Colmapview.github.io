import { stripArchiveExtension } from '../../utils/zipLoaderPolicy';
import { replaceControlCharacters } from '../../utils/controlCharacters';
import { DRIVE_FILE_NAME_MAX } from '../googleDrive/archivePolicy';
import { BUCKET_FOLDER_MAX_BYTES } from '../bucketStorage/paths';

interface PublicationNameSource {
  sourceManifest?: { name?: string } | null;
  sourceName?: string | null;
  sourceUrl?: string | null;
}

/** URL segments that name a file format rather than a dataset. */
const GENERIC_SEGMENTS = new Set(['view', 'manifest', 'colmapview', 'download', 'index', 'resolve', 'main']);

/** The Drive file name limit less the ".zip" the default appends. */
export const PUBLICATION_DATASET_NAME_MAX = DRIVE_FILE_NAME_MAX - '.zip'.length;
/** The bucket folder limit in UTF-8 bytes, which the shared default name also fits. */
export const PUBLICATION_DATASET_NAME_MAX_BYTES = BUCKET_FOLDER_MAX_BYTES;

/** The last URL segment, without an archive or JSON extension; dotted names stay whole. */
function urlName(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const segment = stripArchiveExtension(decodeURIComponent(new URL(value).pathname.split('/').filter(Boolean).at(-1) ?? ''))?.replace(/\.json$/i, '');
    return segment && !GENERIC_SEGMENTS.has(segment.toLowerCase()) ? segment : null;
  } catch { return null; }
}

/** A default name within both providers' limits, cut between characters. */
function cleanDatasetName(value: string | null | undefined): string | null {
  if (!value) return null;
  let name = '';
  let bytes = 0;
  for (const char of replaceControlCharacters(value, ' ').replace(/[\\/]+/g, '-').replace(/\s+/g, ' ').trim()) {
    // UTF-8 length from the code point; a lone surrogate encodes as U+FFFD, three bytes.
    const codePoint = char.codePointAt(0)!;
    const charBytes = codePoint < 0x80 ? 1 : codePoint < 0x800 ? 2 : codePoint < 0x10000 ? 3 : 4;
    if (name.length + char.length > PUBLICATION_DATASET_NAME_MAX || bytes + charBytes > PUBLICATION_DATASET_NAME_MAX_BYTES) break;
    name += char;
    bytes += charBytes;
  }
  name = name.trim();
  return name && !/^\.+$/.test(name) ? name : null;
}

/** The manifest name, recorded local name, source URL name, or "colmap-dataset". Also usable as a store selector. */
export function getPublicationDatasetName(source: PublicationNameSource): string {
  for (const candidate of [source.sourceManifest?.name, source.sourceName, urlName(source.sourceUrl)]) {
    const name = cleanDatasetName(candidate);
    if (name) return name;
  }
  return 'colmap-dataset';
}
