import type { ColmapManifest } from '../types/manifest';
import { resolveImageSource } from '../utils/imageSourceResolution';
import { IMAGE_SOURCE_STRATEGIES } from '../utils/imageSourceStrategies';
import { discoverBucketManifest } from '../features/bucketStorage/discovery';
import { readBoundedResponseBytes } from '../dataset/importers/sourceAccess';
import { MAX_CAMERA_METADATA_BYTES } from '../dataset/importers/types';
import { nativeSceneRoot, nativePhotoVariantMatchesModel } from '../utils/colmapPathResolver';
import { detectTouchDevice } from './useIsTouchDevice';
import { fetchDatasetResource } from '../utils/fetchDatasetResource';
import { fetchHuggingFaceTreeEntries } from './urlLoaderHuggingFaceListing';
import {
  getHuggingFaceColmapPaths, getHuggingFaceColmapTotalBytes, getHuggingFaceDatasetTreeRequest,
  getHuggingFaceImagesPath, getLargeColmapDatasetWarning, getRelativeHuggingFaceTreePaths,
  joinManifestUrlPath, type HuggingFaceColmapPaths,
} from './urlLoaderPolicy';

type FetchUrl = (url: string, init?: RequestInit) => Promise<Response>;

export interface DiscoverColmapDeps {
  fetchImpl?: FetchUrl;
  log?: (message: string) => void;
  isTouchDevice?: boolean;
  onLargeDatasetWarning?: (message: string) => void;
}

function defaultFetchUrl(url: string, init?: RequestInit): Promise<Response> {
  return fetchDatasetResource(url, undefined, init);
}

export interface HuggingFaceLayout {
  colmap: HuggingFaceColmapPaths | null;
  /** Manifest-ready image root; absolute when sibling media use a different base. */
  imagesPath: string | null;
  /** Per-image overrides relative to mediaBaseUrl (or absolute resource URLs), or null. */
  imageNameToPath: Record<string, string> | null;
  /** Combined cameras+images+points3D size from the tree, or null if any is unknown. */
  colmapTotalBytes: number | null;
  /** Media listing and model directory are relative to this source, which may be the owning scene. */
  mediaBaseUrl: string;
  mediaModelDir: string;
  filePaths: readonly string[];
}

const nativeManifestMedia = new WeakMap<ColmapManifest, {
  baseUrl: string;
  modelDir: string;
  paths: readonly string[];
  overrides?: Readonly<Record<string, string>>;
}>();

function dirnameOf(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash >= 0 ? path.slice(0, slash) : '';
}

/**
 * Discover a HuggingFace dataset's COLMAP model location and images directory in
 * a paginated tree read. A URL scoped to a conventional model container also
 * reads its owning scene for sibling media, without changing the selected model.
 * Returns null when the base URL is not a HuggingFace dataset.
 */
export async function discoverHuggingFaceLayout(
  baseUrl: string,
  deps: Pick<DiscoverColmapDeps, 'fetchImpl'> = {}
): Promise<HuggingFaceLayout | null> {
  const request = getHuggingFaceDatasetTreeRequest(baseUrl);
  if (!request) {
    return null;
  }

  const fetchImpl = deps.fetchImpl ?? defaultFetchUrl;
  const entries = await fetchHuggingFaceTreeEntries(request.apiUrl, fetchImpl);
  const colmap = getHuggingFaceColmapPaths(entries, request.treePath);
  const colmapTotalBytes = colmap ? getHuggingFaceColmapTotalBytes(entries, request.treePath, colmap) : null;
  let mediaBaseUrl = baseUrl;
  let mediaTreePath = request.treePath;
  let mediaModelDir = colmap ? dirnameOf(colmap.cameras) : '';
  let mediaEntries = entries;
  const sceneRoot = nativeSceneRoot(request.treePath);
  if (colmap && sceneRoot !== request.treePath) {
    // Remove only recognised model containers (e.g. sparse/0 or triangulated_model).
    // Never climb an arbitrary named scene or reselect a model from its siblings.
    const modelPrefix = request.treePath.slice(sceneRoot ? sceneRoot.length + 1 : 0);
    const sceneUrl = new URL(baseUrl);
    const segments = sceneUrl.pathname.split('/').filter(Boolean);
    sceneUrl.pathname = '/' + segments.slice(0, -modelPrefix.split('/').length).join('/');
    const sceneRequest = getHuggingFaceDatasetTreeRequest(sceneUrl.href);
    if (sceneRequest) {
      try {
        const sceneEntries = await fetchHuggingFaceTreeEntries(sceneRequest.apiUrl, fetchImpl);
        // Retain the selected subtree even if an eventually consistent parent listing omits it.
        const byPath = new Map(entries.map(entry => [entry.path, entry]));
        for (const entry of sceneEntries) if (!byPath.has(entry.path)) byPath.set(entry.path, entry);
        mediaEntries = [...byPath.values()];
        mediaBaseUrl = sceneUrl.href;
        mediaTreePath = sceneRequest.treePath;
        mediaModelDir = [modelPrefix, mediaModelDir].filter(Boolean).join('/');
      } catch {
        // Optional sibling discovery must not prevent the explicitly selected model loading.
      }
    }
  }
  const modelPath = colmap ? [request.treePath, dirnameOf(colmap.cameras)].filter(Boolean).join('/') : '';
  const photoEntries = mediaEntries.filter(entry => typeof entry.path !== 'string' || nativePhotoVariantMatchesModel(entry.path, modelPath));
  const discoveredImagesPath = getHuggingFaceImagesPath(photoEntries, mediaTreePath, mediaModelDir);
  const imagesPath = discoveredImagesPath !== null && mediaBaseUrl !== baseUrl
    ? joinManifestUrlPath(mediaBaseUrl, discoveredImagesPath) : discoveredImagesPath;

  // Run the pluggable image-source resolver for special conventions (e.g. an
  // image_mapping.csv that renamed images before COLMAP). Only the per-image
  // override map is taken here; the base directory stays sourced from
  // getHuggingFaceImagesPath so there is a single source of truth for it.
  const relativePaths = getRelativeHuggingFaceTreePaths(mediaEntries, mediaTreePath);
  const fetchText = async (relativePath: string): Promise<string | null> => {
    try {
      const response = await fetchImpl(joinManifestUrlPath(mediaBaseUrl, relativePath));
      if (!response.ok) { await response.body?.cancel().catch(() => {}); return null; }
      const chunks = await readBoundedResponseBytes(response, relativePath, MAX_CAMERA_METADATA_BYTES);
      const decoder = new TextDecoder();
      return chunks.map(chunk => decoder.decode(chunk, { stream: true })).join('') + decoder.decode();
    } catch {
      return null;
    }
  };
  const imageSource = await resolveImageSource(
    { filePaths: relativePaths, modelDir: mediaModelDir, fetchText },
    IMAGE_SOURCE_STRATEGIES
  );

  const imageNameToPath = imageSource?.imageNameToPath ?? null;
  return { colmap, colmapTotalBytes, imagesPath, imageNameToPath, mediaBaseUrl, mediaModelDir, filePaths: relativePaths };
}

/**
 * Discover where the COLMAP bins actually live in a HuggingFace dataset by
 * reading its file tree, rather than assuming the conventional sparse/0 layout.
 * Returns paths relative to the dataset base URL, or null when the base URL is
 * not a HuggingFace dataset or no complete model is present.
 */
export async function discoverHuggingFaceColmapPaths(
  baseUrl: string,
  deps: Pick<DiscoverColmapDeps, 'fetchImpl'> = {}
): Promise<HuggingFaceColmapPaths | null> {
  return (await discoverHuggingFaceLayout(baseUrl, deps))?.colmap ?? null;
}

/**
 * Derive the masks directory as a sibling of a discovered images directory
 * (e.g. `corrected/images` -> `corrected/masks`). Returns null when the path
 * doesn't end in an `images` segment, so we don't guess for unusual layouts.
 */
export function deriveMasksPathFromImages(imagesPath: string): string | null {
  const trimmed = imagesPath.replace(/\/+$/, '');
  const slash = trimmed.lastIndexOf('/');
  const leaf = (slash >= 0 ? trimmed.slice(slash + 1) : trimmed).toLowerCase();
  if (leaf !== 'images') {
    return null;
  }
  const parent = slash >= 0 ? trimmed.slice(0, slash + 1) : '';
  return `${parent}masks`;
}

/**
 * Best-effort rewrite of a manifest's COLMAP file paths to the locations
 * actually present in the remote dataset. Falls back to the original manifest
 * (e.g. the sparse/0 defaults) when discovery is unavailable or finds nothing,
 * so explicit manifests and conventional layouts are unaffected.
 */
export async function withDiscoveredColmapPaths(
  manifest: ColmapManifest,
  deps: DiscoverColmapDeps = {}
): Promise<ColmapManifest> {
  try {
    const bucketManifest = await discoverBucketManifest(manifest.baseUrl, deps.fetchImpl);
    if (bucketManifest) return { ...manifest, ...bucketManifest };
  } catch {
    // Public object access does not imply ListBucket permission; conventional paths still load.
  }
  try {
    const layout = await discoverHuggingFaceLayout(manifest.baseUrl, {
      fetchImpl: deps.fetchImpl,
    });
    if (!layout) {
      return manifest;
    }

    const warning = getLargeColmapDatasetWarning(
      layout.colmapTotalBytes,
      deps.isTouchDevice ?? detectTouchDevice()
    );
    if (warning) {
      deps.log?.(`[URL Loader] ${warning}`);
      deps.onLargeDatasetWarning?.(warning);
    }

    let result = manifest;
    if (layout.colmap) {
      const { cameras, images, points3D, rigs, frames } = layout.colmap;
      deps.log?.(
        `[URL Loader] Discovered COLMAP files: cameras=${cameras}, images=${images}, points3D=${points3D}`
      );
      result = {
        ...result,
        files: {
          ...result.files,
          cameras,
          images,
          points3D,
          // Use the optional files from the discovered model dir (undefined when
          // absent), not the sparse/0 defaults which won't exist there.
          rigs,
          frames,
        },
      };
    }
    if (layout.imagesPath !== null && layout.imagesPath !== result.imagesPath) {
      deps.log?.(`[URL Loader] Discovered images directory: ${layout.imagesPath}`);
      result = { ...result, imagesPath: layout.imagesPath };
      // Masks conventionally sit beside images; without this they'd stay at the
      // sparse/0 default `masks/` and 404 for relocated layouts.
      const masksPath = deriveMasksPathFromImages(layout.imagesPath);
      if (masksPath && masksPath !== result.masksPath) {
        deps.log?.(`[URL Loader] Using masks directory alongside images: ${masksPath}`);
        result = { ...result, masksPath };
      }
    }
    if (layout.imageNameToPath && Object.keys(layout.imageNameToPath).length > 0) {
      deps.log?.(
        `[URL Loader] Discovered per-image path mapping for ${Object.keys(layout.imageNameToPath).length} images`
      );
      const imageNameToPath = layout.mediaBaseUrl !== manifest.baseUrl
        ? Object.fromEntries(Object.entries(layout.imageNameToPath).map(([name, path]) => [name, joinManifestUrlPath(layout.mediaBaseUrl, path)]))
        : layout.imageNameToPath;
      result = { ...result, imageNameToPath };
    }
    nativeManifestMedia.set(result, { baseUrl: layout.mediaBaseUrl, modelDir: layout.colmap ? layout.mediaModelDir : dirnameOf(result.files.cameras),
      paths: layout.filePaths, overrides: layout.imageNameToPath ?? undefined });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    deps.log?.(`[URL Loader] COLMAP layout discovery skipped: ${message}`);
  }

  return manifest;
}

/** Retain discovery scope without adding inferred media fields to serialized manifests. */
export function getDiscoveredManifestMedia(manifest: ColmapManifest) {
  return nativeManifestMedia.get(manifest);
}
