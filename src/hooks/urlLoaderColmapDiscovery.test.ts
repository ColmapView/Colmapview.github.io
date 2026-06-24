import { describe, expect, it, vi } from 'vitest';
import type { ColmapManifest } from '../types/manifest';
import {
  getHuggingFaceColmapPaths,
  getHuggingFaceImagesPath,
  createDefaultManifest,
} from './urlLoaderPolicy';
import {
  discoverHuggingFaceColmapPaths,
  discoverHuggingFaceLayout,
  discoverHuggingFaceSplatPaths,
  withDiscoveredColmapPaths,
} from './urlLoaderManifestFetch';

const TREE_PATH = '_indonesia_tabuhan_p1_20250210';
const RESOLVE_BASE =
  'https://huggingface.co/datasets/wildflow/sweet-corals/resolve/main/_indonesia_tabuhan_p1_20250210';
const TREE_API =
  'https://huggingface.co/api/datasets/wildflow/sweet-corals/tree/main/_indonesia_tabuhan_p1_20250210?recursive=true';

// Mirrors the real HuggingFace recursive tree for the sweet-corals dataset:
// COLMAP bins live under colmap/, images under corrected/images/.
const sweetCoralsTree = [
  { type: 'directory', path: `${TREE_PATH}/colmap` },
  { type: 'file', path: `${TREE_PATH}/colmap/cameras.bin`, size: 104 },
  { type: 'file', path: `${TREE_PATH}/colmap/images.bin`, size: 169516726 },
  { type: 'file', path: `${TREE_PATH}/colmap/points3D.bin`, size: 165387515 },
  { type: 'directory', path: `${TREE_PATH}/corrected/images` },
  { type: 'file', path: `${TREE_PATH}/corrected/images/GPAA0483.jpg`, size: 1000 },
];

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function jsonResponseWithNext(data: unknown, nextUrl: string): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json', Link: `<${nextUrl}>; rel="next"` },
  });
}

describe('getHuggingFaceColmapPaths', () => {
  it('locates COLMAP bins in a colmap/ subdirectory relative to the tree path', () => {
    expect(getHuggingFaceColmapPaths(sweetCoralsTree, TREE_PATH)).toEqual({
      cameras: 'colmap/cameras.bin',
      images: 'colmap/images.bin',
      points3D: 'colmap/points3D.bin',
      rigs: undefined,
      frames: undefined,
    });
  });

  it('returns null when the tree has no complete COLMAP model', () => {
    expect(
      getHuggingFaceColmapPaths(
        [{ type: 'file', path: `${TREE_PATH}/corrected/images/a.jpg`, size: 1 }],
        TREE_PATH
      )
    ).toBeNull();
  });
});

describe('getHuggingFaceImagesPath', () => {
  it('finds an images directory that is not at the root, with a trailing slash', () => {
    expect(getHuggingFaceImagesPath(sweetCoralsTree, TREE_PATH, 'colmap')).toBe('corrected/images/');
  });

  it('returns null when there are no images', () => {
    expect(
      getHuggingFaceImagesPath(
        [{ type: 'file', path: `${TREE_PATH}/colmap/cameras.bin`, size: 1 }],
        TREE_PATH
      )
    ).toBeNull();
  });
});

describe('discoverHuggingFaceLayout', () => {
  it('discovers COLMAP paths and the images directory in one tree read', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(sweetCoralsTree));
    const layout = await discoverHuggingFaceLayout(RESOLVE_BASE, { fetchImpl });
    expect(layout?.colmap?.cameras).toBe('colmap/cameras.bin');
    expect(layout?.imagesPath).toBe('corrected/images/');
  });
});

describe('discoverHuggingFaceSplatPaths pagination', () => {
  it('follows Link rel="next" so splats on later pages are discovered', async () => {
    const page2Url = `${TREE_API}&cursor=PAGE2`;
    const page1 = [
      { type: 'file', path: `${TREE_PATH}/corrected/images/GPAA0483.jpg`, size: 1000 },
    ];
    const page2 = [
      { type: 'file', path: `${TREE_PATH}/splats/tileA.ply`, size: 100 },
      { type: 'file', path: `${TREE_PATH}/splats/tileB.ply`, size: 200 },
    ];
    const fetchImpl = vi.fn(async (url: string) =>
      url === TREE_API ? jsonResponseWithNext(page1, page2Url) : jsonResponse(page2)
    );

    const splats = await discoverHuggingFaceSplatPaths(RESOLVE_BASE, { fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith(TREE_API);
    expect(fetchImpl).toHaveBeenCalledWith(page2Url);
    expect(splats.map((c) => c.path).sort()).toEqual(['splats/tileA.ply', 'splats/tileB.ply']);
  });

  it('excludes .ply candidates that are not gaussian splats (e.g. a raw point cloud)', async () => {
    const tree = [
      { type: 'file', path: `${TREE_PATH}/point_cloud.ply`, size: 9_999_999 },
      { type: 'file', path: `${TREE_PATH}/splats/tileA.ply`, size: 100 },
    ];
    const fetchImpl = vi.fn(async () => jsonResponse(tree));
    // Classifier rejects the raw point cloud, keeps the real splat tile.
    const classifySplatUrl = vi.fn(async (url: string) => !url.endsWith('/point_cloud.ply'));

    const splats = await discoverHuggingFaceSplatPaths(RESOLVE_BASE, { fetchImpl, classifySplatUrl });

    expect(splats.map((c) => c.path)).toEqual(['splats/tileA.ply']);
  });
});

describe('discoverHuggingFaceColmapPaths', () => {
  it('fetches the tree and resolves the COLMAP bin paths', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(sweetCoralsTree));
    const result = await discoverHuggingFaceColmapPaths(RESOLVE_BASE, { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledWith(TREE_API);
    expect(result).toEqual({
      cameras: 'colmap/cameras.bin',
      images: 'colmap/images.bin',
      points3D: 'colmap/points3D.bin',
      rigs: undefined,
      frames: undefined,
    });
  });

  it('returns null for non-HuggingFace base URLs without fetching', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(sweetCoralsTree));
    const result = await discoverHuggingFaceColmapPaths('https://example.com/dataset', { fetchImpl });
    expect(result).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('withDiscoveredColmapPaths', () => {
  it('rewrites the manifest COLMAP paths to the discovered locations', async () => {
    const manifest = createDefaultManifest(RESOLVE_BASE);
    expect(manifest.files.cameras).toBe('sparse/0/cameras.bin'); // default before discovery

    const fetchImpl = vi.fn(async () => jsonResponse(sweetCoralsTree));
    const updated = await withDiscoveredColmapPaths(manifest, { fetchImpl });

    expect(updated.files.cameras).toBe('colmap/cameras.bin');
    expect(updated.files.images).toBe('colmap/images.bin');
    expect(updated.files.points3D).toBe('colmap/points3D.bin');
    expect(updated.imagesPath).toBe('corrected/images/');
  });

  it('leaves the manifest unchanged when discovery finds nothing', async () => {
    const manifest: ColmapManifest = createDefaultManifest('https://example.com/dataset');
    const fetchImpl = vi.fn(async () => jsonResponse([]));
    const updated = await withDiscoveredColmapPaths(manifest, { fetchImpl });
    expect(updated.files).toEqual(manifest.files);
  });

  it('leaves the manifest unchanged when the tree fetch fails', async () => {
    const manifest = createDefaultManifest(RESOLVE_BASE);
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 500 }));
    const updated = await withDiscoveredColmapPaths(manifest, { fetchImpl });
    expect(updated.files).toEqual(manifest.files);
  });
});

// Mirrors the wildflow/soneva-corals Maldives dataset: images were renamed to
// 0.jpg..N.jpg before COLMAP, and colmap/image_mapping.csv maps them back to the
// real raw/ paths (split across two dated folders, names contain spaces).
const MALDIVES_BASE =
  'https://huggingface.co/datasets/wildflow/soneva-corals/resolve/main/maldives_soneva_hb_20250710';
const MALDIVES_TREE_PATH = 'maldives_soneva_hb_20250710';
const maldivesTree = [
  { type: 'file', path: `${MALDIVES_TREE_PATH}/colmap/cameras.bin`, size: 100 },
  { type: 'file', path: `${MALDIVES_TREE_PATH}/colmap/images.bin`, size: 200 },
  { type: 'file', path: `${MALDIVES_TREE_PATH}/colmap/points3D.bin`, size: 300 },
  { type: 'file', path: `${MALDIVES_TREE_PATH}/colmap/image_mapping.csv`, size: 50 },
  { type: 'file', path: `${MALDIVES_TREE_PATH}/raw/10.07.25 LHS/G0019585.JPG`, size: 1000 },
  { type: 'file', path: `${MALDIVES_TREE_PATH}/raw/10.07.25 RHS/G0019586.JPG`, size: 1000 },
];
const maldivesCsv =
  'colmap_id,colmap_image,raw_path\n' +
  '0,0.jpg,raw/10.07.25 LHS/G0019585.JPG\n' +
  '1,1.jpg,raw/10.07.25 RHS/G0019586.JPG\n';

function maldivesFetchImpl() {
  return vi.fn(async (url: string) => {
    if (url.includes('/api/datasets/')) return jsonResponse(maldivesTree);
    if (url.endsWith('/colmap/image_mapping.csv')) {
      return new Response(maldivesCsv, { status: 200 });
    }
    return new Response('not found', { status: 404 });
  });
}

const MALDIVES_MAPPING = {
  '0.jpg': 'raw/10.07.25 LHS/G0019585.JPG',
  '1.jpg': 'raw/10.07.25 RHS/G0019586.JPG',
};

describe('discoverHuggingFaceLayout with an image_mapping.csv add-on', () => {
  it('resolves COLMAP placeholder names to real dataset-relative paths', async () => {
    const layout = await discoverHuggingFaceLayout(MALDIVES_BASE, { fetchImpl: maldivesFetchImpl() });
    expect(layout?.imageNameToPath).toEqual(MALDIVES_MAPPING);
  });

  it('writes the per-image mapping onto the manifest', async () => {
    const manifest = createDefaultManifest(MALDIVES_BASE);
    const updated = await withDiscoveredColmapPaths(manifest, { fetchImpl: maldivesFetchImpl() });
    expect(updated.imageNameToPath).toEqual(MALDIVES_MAPPING);
  });

  it('leaves imageNameToPath null when no mapping CSV is present', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(sweetCoralsTree));
    const layout = await discoverHuggingFaceLayout(RESOLVE_BASE, { fetchImpl });
    expect(layout?.imageNameToPath).toBeNull();
  });
});
