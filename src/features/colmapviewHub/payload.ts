import type { PublicationAssetSummary } from '../datasetPublishing/types';
import { replaceControlCharacters } from '../../utils/controlCharacters';
import { isPublicationLicenseUrl, PUBLICATION_LICENSE_NAME_LIMIT, type PublicationLicense } from '../datasetPublishing/publicationMetadata';

/** The Hub's creation limits, in UTF-16 units. */
export const HUB_TITLE_LIMIT = 120;
export const HUB_DESCRIPTION_LIMIT = 280;

export type HubAccess = 'public' | 'private';
export interface HubMetadata { title: string; description?: string; license?: PublicationLicense; assets?: PublicationAssetSummary }
export interface HubLinkPayload {
  viewerUrl: string;
  title: string;
  description: string;
  thumbnailBase64: string;
  managementSecret: string;
  /** Sent only for private links: a missing access means public, and the older Hub rejects the key. */
  access?: HubAccess;
  publicAcknowledged: true;
  license?: PublicationLicense;
  assets?: PublicationAssetSummary;
}

/** Control characters become spaces, then whitespace collapses the way the Hub collapses it. */
function collapse(value: string): string {
  return replaceControlCharacters(value, ' ').trim().replace(/\s+/g, ' ');
}

/** Code points that belong to the character before them: marks, the zero-width joiner, variation selectors, skin tones. */
function joinsPrevious(codePoint: number): boolean {
  return codePoint === 0x200d || codePoint === 0xfe0e || codePoint === 0xfe0f || (codePoint >= 0x1f3fb && codePoint <= 0x1f3ff)
    || /\p{M}/u.test(String.fromCodePoint(codePoint));
}

/** The last grapheme boundary at or before `room` UTF-16 units. */
function graphemeCut(text: string, room: number): number {
  let end = 0;
  if (typeof Intl.Segmenter === 'function') {
    for (const { index, segment } of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)) {
      if (index + segment.length > room) break;
      end = index + segment.length;
    }
    return end;
  }
  // Without Intl.Segmenter: cut at a code point, then step back while the cut would split a sequence.
  for (const character of text) {
    if (end + character.length > room) break;
    end += character.length;
  }
  while (end > 0) {
    const next = text.codePointAt(end);
    const previous = text.charCodeAt(end - 1);
    if (!(next !== undefined && joinsPrevious(next)) && previous !== 0x200d) break;
    end -= end > 1 && previous >= 0xdc00 && previous <= 0xdfff ? 2 : 1;
  }
  return end;
}

/**
 * Text the Hub accepts, within `limit` UTF-16 units. A cut ends at the last space when that keeps
 * at least 60% of the limit, otherwise at a grapheme boundary, and gets an ellipsis.
 */
export function hubText(value: string, limit: number): string {
  const text = collapse(value);
  if (text.length <= limit) return text;
  const room = limit - 1;
  const space = text.lastIndexOf(' ', room);
  const end = space >= Math.ceil(limit * 0.6) ? space : graphemeCut(text, room);
  return `${text.slice(0, end).trimEnd()}…`;
}

function hubLicense({ name, url }: PublicationLicense): PublicationLicense | undefined {
  const text = hubText(name, PUBLICATION_LICENSE_NAME_LIMIT);
  if (!text) return undefined;
  return { name: text, ...(url && isPublicationLicenseUrl(url) ? { url } : {}) };
}

/** The request body for POST /api/links. */
export function buildHubPayload({ viewerUrl, metadata, access, thumbnailBase64, managementSecret }: {
  viewerUrl: string; metadata: HubMetadata; access: HubAccess; thumbnailBase64: string; managementSecret: string;
}): HubLinkPayload {
  const license = metadata.license && hubLicense(metadata.license);
  return {
    viewerUrl,
    title: hubText(metadata.title, HUB_TITLE_LIMIT) || 'ColmapView dataset',
    description: hubText(metadata.description ?? '', HUB_DESCRIPTION_LIMIT),
    thumbnailBase64, managementSecret, publicAcknowledged: true,
    ...(access === 'private' ? { access } : {}),
    ...(license ? { license } : {}),
    ...(metadata.assets ? { assets: metadata.assets } : {}),
  };
}
