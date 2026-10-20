import { dump } from 'js-yaml';
import type { ColmapManifest } from '../../types/manifest';
import { HfError } from '../huggingface/http';
import { datasetFileUrl, validateRepositoryName } from './publicationPaths';
import { makePublicationViewerLink } from './publicationLinks';
import { publicationModelFiles, PUBLICATION_MODEL_DIRECTORY } from './publicationAssets';
import { publicationAssetSummary } from './publicationSummary';
import { PUBLICATION_JPEG_QUALITY, type PreparedPublication, type PublicationDetails, type PublicationReceipt, type PublicationVisibility } from './types';
import type { UploadFile } from '../huggingface/hubClient';
import { DATASET_VIEWER_SETTINGS_FILE } from '../../utils/datasetViewerSettings';
import { buildImageUrl } from '../../utils/imageFileLookupPolicy';
import { replaceControlCharacters } from '../../utils/controlCharacters';

/** Hugging Face repository-card license identifiers, with labels for the publish dialog and names and links for Hub cards. */
export const PUBLICATION_LICENSES = [
  { id: 'cc-by-4.0', label: 'CC BY 4.0 (attribution)', name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
  { id: 'cc-by-sa-4.0', label: 'CC BY-SA 4.0 (share alike)', name: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' },
  { id: 'cc-by-nc-4.0', label: 'CC BY-NC 4.0 (non-commercial)', name: 'CC BY-NC 4.0', url: 'https://creativecommons.org/licenses/by-nc/4.0/' },
  { id: 'cc-by-nc-sa-4.0', label: 'CC BY-NC-SA 4.0 (non-commercial, share alike)', name: 'CC BY-NC-SA 4.0', url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/' },
  { id: 'cc-by-nd-4.0', label: 'CC BY-ND 4.0 (no derivatives)', name: 'CC BY-ND 4.0', url: 'https://creativecommons.org/licenses/by-nd/4.0/' },
  { id: 'cc-by-nc-nd-4.0', label: 'CC BY-NC-ND 4.0 (non-commercial, no derivatives)', name: 'CC BY-NC-ND 4.0', url: 'https://creativecommons.org/licenses/by-nc-nd/4.0/' },
  { id: 'cc0-1.0', label: 'CC0 1.0 (public domain)', name: 'CC0 1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' },
  { id: 'mit', label: 'MIT', name: 'MIT', url: 'https://opensource.org/license/mit' },
  { id: 'apache-2.0', label: 'Apache 2.0', name: 'Apache 2.0', url: 'https://www.apache.org/licenses/LICENSE-2.0' },
  { id: 'other', label: 'Custom license' },
] as const;
export const PUBLICATION_LICENSE_NAME_LIMIT = 160;
export const PUBLICATION_LICENSE_URL_LIMIT = 2048;

/** A license as a name and an optional link, as the Hub card shows it. */
export interface PublicationLicense { name: string; url?: string }

/**
 * An HTTPS link without credentials whose normalized form fits `limit`. The Hub stores links normalized,
 * and percent-encoding can lengthen them past the cap.
 */
export function isPublicationLicenseUrl(value: string, limit = PUBLICATION_LICENSE_URL_LIMIT): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && url.href.length <= limit;
  } catch { return false; }
}

/** The license as a name and link, for the Hub card. */
export function publicationLicenseInfo(details: Pick<PublicationDetails, 'license' | 'licenseName' | 'licenseUrl'>): PublicationLicense | undefined {
  if (details.license === 'other') {
    const name = details.licenseName?.trim();
    return name ? { name, ...(details.licenseUrl ? { url: details.licenseUrl } : {}) } : undefined;
  }
  const known = PUBLICATION_LICENSES.find(option => option.id === details.license);
  return known && 'url' in known ? { name: known.name, url: known.url } : undefined;
}

/** Removes control characters from a form value; multi-line fields keep tabs and line breaks. */
export function stripControlCharacters(value: string, multiline = false): string {
  // A pasted tab separates words in a single-line field.
  return multiline ? replaceControlCharacters(value, '', { keepLineBreaks: true, keepTabs: true })
    : replaceControlCharacters(value.replaceAll('	', ' '), '');
}

export function validatePublicationDetails(details: PublicationDetails): PublicationDetails {
  if (details.format !== undefined && !['folder', 'zip'].includes(details.format)) throw new HfError('Choose Folder or ZIP archive format.');
  if (details.imageFormat !== undefined && !['original', 'jpeg'].includes(details.imageFormat)) throw new HfError('Choose Original images or JPEG copies.');
  if (details.imageFormat === 'jpeg' && details.format !== 'zip') throw new HfError('JPEG image conversion requires ZIP archive format.');
  if (!['private', 'public'].includes(details.visibility)) throw new HfError('Choose private or public access for this dataset.');
  const name = validateRepositoryName(details.name);
  if (details.description.length > 10_000) throw new HfError('Keep the description to 10,000 characters or fewer.');
  if (details.license !== '' && !PUBLICATION_LICENSES.some(license => license.id === details.license)) {
    throw new HfError('Choose the license you are authorized to use for this dataset.');
  }
  if (details.license === 'other') {
    const licenseUrl = details.licenseUrl ?? '';
    if (!details.licenseName?.trim() || !isPublicationLicenseUrl(licenseUrl, Infinity)) throw new HfError('Provide a custom license name and HTTPS license URL.');
    if (details.licenseName.trim().length > PUBLICATION_LICENSE_NAME_LIMIT || licenseUrl.length > PUBLICATION_LICENSE_URL_LIMIT
      || !isPublicationLicenseUrl(licenseUrl)) {
      throw new HfError(`Shorten the custom license name to ${PUBLICATION_LICENSE_NAME_LIMIT} characters and its URL to ${PUBLICATION_LICENSE_URL_LIMIT.toLocaleString('en-US')}.`);
    }
  }
  return { ...details, name };
}

export function publicationManifest(prepared: PreparedPublication, repoId: string, dataCommit: string, title: string): ColmapManifest {
  const baseUrl = new URL('.', datasetFileUrl(repoId, dataCommit, DATASET_VIEWER_SETTINGS_FILE)).href;
  // The viewer derives most image URLs from imagesPath; list only names it would resolve elsewhere.
  const imageNameToPath = Object.fromEntries(Object.entries(prepared.imageNameToPath).filter(([name, path]) =>
    buildImageUrl(`${baseUrl}images/`, name).url !== datasetFileUrl(repoId, dataCommit, path)));
  return {
    version: 1, name: title, baseUrl,
    files: publicationModelFiles(prepared.assets),
    viewerStatePath: DATASET_VIEWER_SETTINGS_FILE, imagesPath: 'images/', masksPath: 'masks/',
    skipImages: false, ...(Object.keys(imageNameToPath).length ? { imageNameToPath } : {}),
    // No `splats`: explicit entries download eagerly. Repository discovery lists them
    // lazily within the auto-load budget, and colmapview.yaml selects the active one.
  };
}

/**
 * Direct dataset links follow the repository page for folder publications;
 * ZIP publications open the archive pinned to its uploaded revision.
 */
export function publicationReceipt(prepared: PreparedPublication, repoId: string, dataCommit: string, metadataCommit: string,
  visibility: PublicationVisibility): PublicationReceipt {
  const repoUrl = `https://huggingface.co/datasets/${repoId}`;
  const sourceUrl = prepared.archive ? datasetFileUrl(repoId, dataCommit, prepared.archive.path) : repoUrl;
  return { repoId, repoUrl, dataCommit, metadataCommit, visibility, viewerUrl: makePublicationViewerLink(prepared.viewerBaseUrl, sourceUrl),
    assets: publicationAssetSummary(prepared) };
}

export function publicationMetadata(prepared: PreparedPublication, details: PublicationDetails, repoId: string, dataCommit: string,
  inventory: Array<{ path: string; size: number }>): UploadFile[] {
  const sourceUrl = prepared.archive ? datasetFileUrl(repoId, dataCommit, prepared.archive.path) : `https://huggingface.co/datasets/${repoId}`;
  const viewerLink = makePublicationViewerLink(prepared.viewerBaseUrl, sourceUrl);
  const payload = prepared.archive?.files ?? inventory;
  const markdown = (text: string) => text.replace(/[\\`*_[\]<>]/g, '\\$&');
  const card = dump({ ...(details.license ? { license: details.license } : {}),
    ...(details.license === 'other' ? { license_name: details.licenseName, license_link: details.licenseUrl } : {}),
    tags: ['colmap', 'photogrammetry', '3d', 'colmapview'],
    // Not a tabular dataset: without this, Hugging Face converts images/ to Parquet for its table viewer.
    viewer: false,
  }, { lineWidth: -1 });
  const readme = `---\n${card}---\n\n# ${markdown(details.name)}\n\n${markdown(details.description)}\n\n`
    + (prepared.previewPath ? `![Dataset preview](${datasetFileUrl(repoId, dataCommit, prepared.previewPath)})\n\n` : '')
    + `[Open in ColmapView](${viewerLink})\n\n`
    + `Viewer link: <${viewerLink}>\n\n`
    + (details.visibility === 'private' ? 'Private dataset. Sign in to Hugging Face in the viewer with an account that has access.\n\n' : '')
    + `Published by ${markdown(repoId.split('/')[0])} with ColmapView ${prepared.viewerState.viewerVersion}.\n\n`
    + `## Contents\n\n${prepared.counts.cameras} cameras, ${prepared.counts.images} registered images, ${prepared.counts.points} points.\n\n`
    + (prepared.archive ? `Download [${prepared.archive.path}](${sourceUrl}) for the complete dataset. Inside the ZIP, ` : '')
    + `COLMAP binary files are in ${PUBLICATION_MODEL_DIRECTORY}/. ${prepared.imageFormat === 'jpeg'
      ? `Full-resolution JPEG image copies (${Math.round(PUBLICATION_JPEG_QUALITY * 100)}% quality, without image metadata) are in images/.` : 'Original images are in images/.'}\n`
    + `${payload.filter(file => file.path.startsWith('masks/')).length} masks and ${prepared.splatPaths.length} original splat files were included.\n\n`
    + `The reviewed scene transform is baked into the COLMAP model. Original splat bytes retain their original coordinates; `
    + `their alignment and the saved camera view are recorded in colmapview.yaml at the dataset root. `
    + `ColmapView restores these settings when opening the dataset from a URL, local folder, or supported archive.\n\n`
    + `Dataset files are pinned to revision ${dataCommit}. See colmapview-inventory.json for filenames and sizes.\n`;
  const files: Record<string, string> = {
    'README.md': readme,
    ...(!prepared.archive ? { 'colmapview.json': JSON.stringify(publicationManifest(prepared, repoId, dataCommit, details.name), null, 2) } : {}),
    'colmapview-inventory.json': JSON.stringify({ version: 1, operationId: prepared.operationId,
      viewerVersion: prepared.viewerState.viewerVersion, dataCommit, counts: prepared.counts, files: inventory,
      ...(prepared.archive ? { archive: prepared.archive } : {}) }, null, 2),
  };
  return Object.entries(files).map(([path, text]) => ({ path, content: new Blob([text]) }));
}
