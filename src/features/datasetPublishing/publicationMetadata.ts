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

/** Hugging Face repository-card license identifiers, with labels for the publish dialog. */
export const PUBLICATION_LICENSES = [
  { id: 'cc-by-4.0', label: 'CC BY 4.0 (attribution)' },
  { id: 'cc-by-sa-4.0', label: 'CC BY-SA 4.0 (share alike)' },
  { id: 'cc-by-nc-4.0', label: 'CC BY-NC 4.0 (non-commercial)' },
  { id: 'cc-by-nc-sa-4.0', label: 'CC BY-NC-SA 4.0 (non-commercial, share alike)' },
  { id: 'cc-by-nd-4.0', label: 'CC BY-ND 4.0 (no derivatives)' },
  { id: 'cc-by-nc-nd-4.0', label: 'CC BY-NC-ND 4.0 (non-commercial, no derivatives)' },
  { id: 'cc0-1.0', label: 'CC0 1.0 (public domain)' },
  { id: 'mit', label: 'MIT' },
  { id: 'apache-2.0', label: 'Apache 2.0' },
  { id: 'other', label: 'Custom license' },
] as const;
export function validatePublicationDetails(details: PublicationDetails): PublicationDetails {
  if (details.format !== undefined && !['folder', 'zip'].includes(details.format)) throw new HfError('Choose Folder or ZIP archive format.');
  if (details.imageFormat !== undefined && !['original', 'jpeg'].includes(details.imageFormat)) throw new HfError('Choose Original images or JPEG copies.');
  if (details.imageFormat === 'jpeg' && details.format !== 'zip') throw new HfError('JPEG image conversion requires ZIP archive format.');
  if (!['private', 'public'].includes(details.visibility)) throw new HfError('Choose private or public access for this dataset.');
  const name = validateRepositoryName(details.name);
  const title = details.title.trim();
  if (!title || title.length > 200 || details.description.length > 10_000) throw new HfError('Enter a title of 1–200 characters and a description under 10,000 characters.');
  if (!(details.visibility === 'private' && details.license === '') && !PUBLICATION_LICENSES.some(license => license.id === details.license)) {
    throw new HfError('Choose the license you are authorized to use for this dataset.');
  }
  if (details.license === 'other') {
    let validUrl = false;
    try { const url = new URL(details.licenseUrl ?? ''); validUrl = url.protocol === 'https:' && !url.username && !url.password; } catch { /* Invalid custom license. */ }
    if (!details.licenseName?.trim() || !validUrl) throw new HfError('Provide a custom license name and HTTPS license URL.');
  }
  return { ...details, name, title };
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
  const readme = `---\n${card}---\n\n# ${markdown(details.title)}\n\n${markdown(details.description)}\n\n`
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
    ...(!prepared.archive ? { 'colmapview.json': JSON.stringify(publicationManifest(prepared, repoId, dataCommit, details.title), null, 2) } : {}),
    'colmapview-inventory.json': JSON.stringify({ version: 1, operationId: prepared.operationId,
      viewerVersion: prepared.viewerState.viewerVersion, dataCommit, counts: prepared.counts, files: inventory,
      ...(prepared.archive ? { archive: prepared.archive } : {}) }, null, 2),
  };
  return Object.entries(files).map(([path, text]) => ({ path, content: new Blob([text]) }));
}
