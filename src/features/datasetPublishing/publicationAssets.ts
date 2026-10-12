import type { PublishAsset } from './types';
import type { ColmapManifest } from '../../types/manifest';

export const PUBLICATION_MODEL_DIRECTORY = 'sparse/0';

/** The model layout written by the publication exporter, including optional rig data. */
export function publicationModelFiles(assets: readonly PublishAsset[]): ColmapManifest['files'] {
  const paths = new Set(assets.filter(asset => asset.kind === 'colmap').map(asset => asset.path));
  const directory = PUBLICATION_MODEL_DIRECTORY;
  return {
    cameras: `${directory}/cameras.bin`, images: `${directory}/images.bin`, points3D: `${directory}/points3D.bin`,
    ...(paths.has(`${directory}/rigs.bin`) ? { rigs: `${directory}/rigs.bin` } : {}),
    ...(paths.has(`${directory}/frames.bin`) ? { frames: `${directory}/frames.bin` } : {}),
  };
}

/** Consumption and job disposal can both reach an asset; its owned buffer is released once. */
export function releasePublicationAsset(asset: PublishAsset): void {
  const release = asset.release;
  delete asset.release;
  release?.();
}

export function releasePublicationAssets(assets: readonly PublishAsset[]): void {
  assets.forEach(releasePublicationAsset);
}
