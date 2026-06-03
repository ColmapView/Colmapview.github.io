import type { ColmapManifest } from '../../types/manifest';
import { validateColmapManifest } from '../../utils/manifestValidation';

export type ManifestContentParseResult =
  | { success: true; manifest: ColmapManifest }
  | { success: false; errorMessage: string };

export function createExampleManifest(): ColmapManifest {
  return {
    version: 1,
    name: 'Example Dataset',
    baseUrl: 'https://example.com/colmap-data',
    files: {
      cameras: 'sparse/0/cameras.bin',
      images: 'sparse/0/images.bin',
      points3D: 'sparse/0/points3D.bin',
    },
    imagesPath: 'images/',
    masksPath: 'masks/',
  };
}

export function parseManifestContent(content: string): ManifestContentParseResult {
  let data: unknown;

  try {
    data = JSON.parse(content);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, errorMessage: `Failed to load manifest: ${message}` };
  }

  const result = validateColmapManifest(data);
  if (!result.success) {
    return { success: false, errorMessage: `Invalid manifest: ${result.details}` };
  }

  return { success: true, manifest: result.manifest };
}
