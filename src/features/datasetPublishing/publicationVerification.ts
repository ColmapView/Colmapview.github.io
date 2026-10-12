import type { HubClient } from '../huggingface/hubClient';
import { HfError, delay, errorStatus } from '../huggingface/http';
import type { PreparedPublication, PublicationReceipt } from './types';
import { datasetFileUrl } from './publicationPaths';
import { validateColmapManifest } from '../../utils/manifestValidation';
import { readBoundedResponse } from '../../utils/publishedViewerState';
import { fetchPublishedViewerState } from '../../hooks/urlLoaderViewerState';
import { DATASET_VIEWER_SETTINGS_FILE } from '../../utils/datasetViewerSettings';
import { verifyPublicationZip } from './verifyPublicationZip';

/** Format-specific metadata checks return the loose model files the repository must contain. */
async function verifyPublicationMetadata(request: ReturnType<HubClient['request']>, receipt: PublicationReceipt,
  prepared: PreparedPublication, inventory: Array<{ path: string; size: number }>, expectedBase: string): Promise<string[]> {
  const archive = prepared.archive;
  const path = archive ? 'colmapview-inventory.json' : 'colmapview.json';
  const response = await request(datasetFileUrl(receipt.repoId, receipt.metadataCommit, path));
  const document = JSON.parse(await (await readBoundedResponse(response, 16 * 1024 * 1024)).text());
  if (archive) {
    if (document.operationId !== prepared.operationId || document.dataCommit !== receipt.dataCommit
      || JSON.stringify(document.archive) !== JSON.stringify(archive) || JSON.stringify(document.files) !== JSON.stringify(inventory)) {
      throw new HfError('The published archive inventory could not be verified. Retry verification.');
    }
    return [];
  }
  const result = validateColmapManifest(document);
  if (!result.success || result.manifest.baseUrl !== expectedBase || result.manifest.viewerStatePath !== DATASET_VIEWER_SETTINGS_FILE) {
    throw new HfError('The published viewer manifest could not be verified. Retry verification.');
  }
  return Object.values(result.manifest.files).filter((file): file is string => Boolean(file));
}

export function createPublicationVerifier(client: HubClient) {
  return async (receipt: PublicationReceipt, prepared: PreparedPublication, inventory: Array<{ path: string; size: number }>, signal: AbortSignal) => {
    for (let attempt = 0; ; attempt++) {
      signal.throwIfAborted();
      try {
        await client.assertVisibility(receipt.repoId, receipt.visibility, signal);
        const request = client.request(receipt.repoId, receipt.visibility, signal);
        const expectedBase = new URL('.', datasetFileUrl(receipt.repoId, receipt.dataCommit, DATASET_VIEWER_SETTINGS_FILE)).href;
        const modelFiles = await verifyPublicationMetadata(request, receipt, prepared, inventory, expectedBase);
        const view = await fetchPublishedViewerState({ baseUrl: expectedBase, viewerStatePath: DATASET_VIEWER_SETTINGS_FILE }, request);
        if (JSON.stringify(view) !== JSON.stringify(prepared.viewerState)) throw new HfError('The saved viewer state could not be verified.');
        const files = new Map((await client.files(receipt.repoId, receipt.dataCommit, receipt.visibility, signal)).map(file => [file.path, file]));
        for (const expected of inventory) {
          const file = files.get(expected.path);
          if (!file || file.size !== expected.size || !file.oid) throw new HfError(`Published file ${expected.path} could not be verified.`);
        }
        for (const path of modelFiles) {
          if (!files.has(path)) throw new HfError('The published reconstruction is incomplete.');
        }
        if (prepared.archive) {
          const archive = files.get(prepared.archive.path);
          if (!archive) throw new HfError('The published ZIP archive is missing.');
          await verifyPublicationZip(datasetFileUrl(receipt.repoId, receipt.dataCommit, prepared.archive.path), archive.size, request, signal);
        }
        const sample = prepared.assets.find(asset => ['image', 'mask', 'splat'].includes(asset.kind));
        const samplePaths = [sample?.path, prepared.previewPath].filter((path): path is string => !!path);
        for (const path of samplePaths) {
          const media = await request(datasetFileUrl(receipt.repoId, receipt.dataCommit, path), { headers: { Range: 'bytes=0-255' } });
          if (!media.ok) throw new HfError('Recipients cannot retrieve the selected dataset assets.');
          await media.body?.cancel();
        }
        return;
      } catch (error) {
        signal.throwIfAborted();
        if (attempt >= 2 || [401, 403].includes(errorStatus(error) ?? 0) || (error instanceof HfError && error.permanent)) throw error;
        await delay(500 * 2 ** attempt, signal);
      }
    }
  };
}
