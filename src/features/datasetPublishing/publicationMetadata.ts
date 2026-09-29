import { dump } from 'js-yaml';
import type { ColmapManifest } from '../../types/manifest';
import { HfError } from '../huggingface/http';
import { datasetFileUrl, validateRepositoryName } from './publicationPaths';
import type { PreparedPublication, PublicationDetails, PublicationReceipt } from './types';
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
  const name = validateRepositoryName(details.name);
  const title = details.title.trim();
  if (!title || title.length > 200 || details.description.length > 10_000) throw new HfError('Enter a title of 1–200 characters and a description under 10,000 characters.');
  if (!PUBLICATION_LICENSES.some(license => license.id === details.license)) throw new HfError('Choose the license you are authorized to use for this dataset.');
  if (details.license === 'other') {
    let validUrl = false;
    try { const url = new URL(details.licenseUrl ?? ''); validUrl = url.protocol === 'https:' && !url.username && !url.password; } catch { /* Invalid custom license. */ }
    if (!details.licenseName?.trim() || !validUrl) throw new HfError('Provide a custom license name and HTTPS license URL.');
  }
  return { ...details, name, title };
}

export function publicationManifest(prepared: PreparedPublication, repoId: string, dataCommit: string, title: string): ColmapManifest {
  const coreFiles = new Set(prepared.assets.filter(asset => asset.kind === 'colmap').map(asset => asset.path));
  const baseUrl = new URL('.', datasetFileUrl(repoId, dataCommit, DATASET_VIEWER_SETTINGS_FILE)).href;
  // The viewer derives most image URLs from imagesPath; list only names it would resolve elsewhere.
  const imageNameToPath = Object.fromEntries(Object.entries(prepared.imageNameToPath).filter(([name, path]) =>
    buildImageUrl(`${baseUrl}images/`, name).url !== datasetFileUrl(repoId, dataCommit, path)));
  return {
    version: 1, name: title, baseUrl,
    files: { cameras: 'sparse/0/cameras.bin', images: 'sparse/0/images.bin', points3D: 'sparse/0/points3D.bin',
      ...(coreFiles.has('sparse/0/rigs.bin') ? { rigs: 'sparse/0/rigs.bin' } : {}),
      ...(coreFiles.has('sparse/0/frames.bin') ? { frames: 'sparse/0/frames.bin' } : {}) },
    viewerStatePath: DATASET_VIEWER_SETTINGS_FILE, imagesPath: 'images/', masksPath: 'masks/',
    skipImages: false, ...(Object.keys(imageNameToPath).length ? { imageNameToPath } : {}),
    // No `splats`: explicit entries download eagerly. Repository discovery lists them
    // lazily within the auto-load budget, and colmapview.yaml selects the active one.
  };
}

/**
 * The viewer a published dataset links to. On colmapview.github.io that is /latest/ (the root's
 * redirect drops the query), so links keep opening the current viewer rather than the version
 * that published them; /dev/ stays on /dev/, and other hosts link to the page they run on.
 */
export function getPublicationViewerBaseUrl(location: Pick<Location, 'origin' | 'hostname' | 'pathname'>): string {
  if (location.hostname !== 'colmapview.github.io') return location.origin + location.pathname;
  return `${location.origin}/${location.pathname.startsWith('/dev/') ? 'dev' : 'latest'}/`;
}

/**
 * The shareable link, used by the dialog and the dataset card: the viewer followed by the dataset
 * page, which follows the repository's latest revision and its saved colmapview.yaml settings.
 * The page URL stays unescaped for readability; repository ids contain no query-significant characters.
 */
export function makeRepositoryViewerLink(prepared: PreparedPublication, repoUrl: string): string {
  const url = new URL(prepared.viewerBaseUrl);
  url.search = ''; url.hash = '';
  return `${url.href}?url=${repoUrl}`;
}

export function publicationReceipt(prepared: PreparedPublication, repoId: string, dataCommit: string, metadataCommit: string): PublicationReceipt {
  const repoUrl = `https://huggingface.co/datasets/${repoId}`;
  return { repoId, repoUrl, dataCommit, metadataCommit, viewerUrl: makeRepositoryViewerLink(prepared, repoUrl) };
}

export function publicationMetadata(prepared: PreparedPublication, details: PublicationDetails, repoId: string, dataCommit: string,
  inventory: Array<{ path: string; size: number }>): UploadFile[] {
  const manifest = publicationManifest(prepared, repoId, dataCommit, details.title);
  const viewerLink = makeRepositoryViewerLink(prepared, `https://huggingface.co/datasets/${repoId}`);
  const markdown = (text: string) => text.replace(/[\\`*_[\]<>]/g, '\\$&');
  const card = dump({ license: details.license,
    ...(details.license === 'other' ? { license_name: details.licenseName, license_link: details.licenseUrl } : {}),
    tags: ['colmap', 'photogrammetry', '3d', 'colmapview'],
  }, { lineWidth: -1 });
  const readme = `---\n${card}---\n\n# ${markdown(details.title)}\n\n${markdown(details.description)}\n\n`
    + (prepared.previewPath ? `![Dataset preview](${datasetFileUrl(repoId, dataCommit, prepared.previewPath)})\n\n` : '')
    + `[Open in ColmapView](${viewerLink})\n\n`
    + `Viewer link: <${viewerLink}>\n\n`
    + `Published by ${markdown(repoId.split('/')[0])} with ColmapView ${prepared.viewerState.viewerVersion}.\n\n`
    + `## Contents\n\n${prepared.counts.cameras} cameras, ${prepared.counts.images} registered images, ${prepared.counts.points} points.\n\n`
    + `COLMAP binary files are in sparse/0/. Original images are in images/.\n`
    + `${inventory.filter(file => file.path.startsWith('masks/')).length} masks and ${prepared.splatPaths.length} original splat files were included.\n\n`
    + `The reviewed scene transform is baked into the COLMAP model. Original splat bytes retain their original coordinates; `
    + `their alignment and the saved camera view are recorded in colmapview.yaml at the dataset root. `
    + `ColmapView restores these settings when opening the dataset from a URL, local folder, or supported archive.\n\n`
    + `Dataset files are pinned to revision ${dataCommit}. See colmapview-inventory.json for filenames and sizes.\n`;
  const files: Record<string, string> = {
    'README.md': readme, 'colmapview.json': JSON.stringify(manifest, null, 2),
    'colmapview-inventory.json': JSON.stringify({ version: 1, operationId: prepared.operationId,
      viewerVersion: prepared.viewerState.viewerVersion, dataCommit, counts: prepared.counts, files: inventory }, null, 2),
  };
  return Object.entries(files).map(([path, text]) => ({ path, content: new Blob([text]) }));
}
