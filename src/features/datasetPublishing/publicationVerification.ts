import type { HubClient } from '../huggingface/hubClient';
import { HfError, boundedFetch, delay } from '../huggingface/http';
import type { PreparedPublication, PublicationReceipt } from './types';
import { datasetFileUrl } from './publicationPaths';
import { validateColmapManifest } from '../../utils/manifestValidation';
import { readBoundedResponse } from '../../utils/publishedViewerState';
import { fetchPublishedViewerState } from '../../hooks/urlLoaderViewerState';
import { DATASET_VIEWER_SETTINGS_FILE } from '../../utils/datasetViewerSettings';

export function createPublicationVerifier(client: HubClient) {
  return async (receipt: PublicationReceipt, prepared: PreparedPublication, inventory: Array<{ path: string; size: number }>, signal: AbortSignal) => {
    for (let attempt = 0; ; attempt++) {
      signal.throwIfAborted();
      try {
        const request = boundedFetch(signal, 30_000);
        const response = await request(datasetFileUrl(receipt.repoId, receipt.metadataCommit, 'colmapview.json'));
        const document = JSON.parse(await (await readBoundedResponse(response, 16 * 1024 * 1024)).text());
        const result = validateColmapManifest(document);
        const expectedBase = new URL('.', datasetFileUrl(receipt.repoId, receipt.dataCommit, DATASET_VIEWER_SETTINGS_FILE)).href;
        if (!result.success || result.manifest.baseUrl !== expectedBase || result.manifest.viewerStatePath !== DATASET_VIEWER_SETTINGS_FILE) {
          throw new HfError('The published viewer manifest could not be verified. Retry verification.');
        }
        const view = await fetchPublishedViewerState(result.manifest, request);
        if (JSON.stringify(view) !== JSON.stringify(prepared.viewerState)) throw new HfError('The saved viewer state could not be verified.');
        const files = new Map((await client.files(receipt.repoId, receipt.dataCommit, signal)).map(file => [file.path, file]));
        for (const expected of inventory) {
          const file = files.get(expected.path);
          if (!file || file.size !== expected.size || !file.oid) throw new HfError(`Published file ${expected.path} could not be verified.`);
        }
        for (const path of Object.values(result.manifest.files)) {
          if (path && !files.has(path)) throw new HfError('The published reconstruction is incomplete.');
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
        if (attempt >= 2) throw error;
        await delay(500 * 2 ** attempt, signal);
      }
    }
  };
}
