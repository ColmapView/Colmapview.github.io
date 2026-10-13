import type { PreparedPublication, PublicationAssetSummary, PublicationFormat } from './types';

/** Use the prepared inventory, including masks actually found and the selected splats. */
export function summarizePublicationAssets(prepared: PreparedPublication, format: PublicationFormat): PublicationAssetSummary {
  const counts: Record<PreparedPublication['assets'][number]['kind'], number> = {
    colmap: 0, image: 0, mask: 0, splat: 0, 'viewer-state': 0, preview: 0, archive: 0,
  };
  for (const asset of prepared.assets) counts[asset.kind]++;
  return {
    format, imageFormat: format === 'zip' ? prepared.imageFormat ?? 'original' : 'original',
    colmap: { files: counts.colmap, cameras: prepared.counts.cameras, points: prepared.counts.points },
    images: counts.image, masks: counts.mask, splats: counts.splat,
    viewerSettings: counts['viewer-state'] > 0, preview: counts.preview > 0,
  };
}

/** A packaged ZIP retains its inner inventory; older external archives may have no summary. */
export function publicationAssetSummary(prepared: PreparedPublication): PublicationAssetSummary | undefined {
  return prepared.archive ? prepared.archive.summary : summarizePublicationAssets(prepared, 'folder');
}
