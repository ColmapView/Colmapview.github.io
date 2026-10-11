import { boundedFetch, HfError } from './http';
import { datasetFileUrl } from '../datasetPublishing/publicationPaths';
import { readBoundedResponse } from '../../utils/publishedViewerState';
import { awaitWithAbort } from '../../utils/awaitWithAbort';
import { timeoutSignal } from '../../utils/abortSignals';
import { createTransferTimeout } from './transferTimeout';
import { huggingFaceDatasetReadRepoId } from '../../utils/huggingFaceUrl';
import type { PublicationVisibility } from '../datasetPublishing/types';

export interface UploadFile { path: string; content: Blob }
export interface HubFile { path: string; size: number; oid?: string }
export interface HubHead { oid: string; title: string; previous?: string }
export interface HubClient {
  create: (repoId: string, operationId: string, visibility: PublicationVisibility, signal: AbortSignal) => Promise<string>;
  assertVisibility: (repoId: string, visibility: PublicationVisibility, signal: AbortSignal) => Promise<void>;
  /** Private verification is authenticated; public verification must prove anonymous access. */
  request: (repoId: string, visibility: PublicationVisibility, signal: AbortSignal) => typeof fetch;
  head: (repoId: string, signal: AbortSignal) => Promise<HubHead>;
  upload: (repoId: string, files: UploadFile[], parent: string, marker: string, signal: AbortSignal, progress: (message: string) => void) => Promise<string>;
  reconcile: (repoId: string, parent: string, marker: string, receipt: string, signal: AbortSignal) => Promise<string | null>;
  /** Lists the complete inventory with the same access used to verify the publication. */
  files: (repoId: string, revision: string, visibility: PublicationVisibility, signal: AbortSignal) => Promise<HubFile[]>;
}

export const BATCH_RECEIPT_PATH = 'colmapview-upload.json';
export const CREATION_MARKER_PATH = 'colmapview-publication.json';
export const commitTitle = (marker: string) => `ColmapView publication ${marker}`;

export function createHubClient(getAccessToken: (username: string) => string): HubClient {
  const sdk = () => import('@huggingface/hub');
  const repo = (name: string) => ({ type: 'dataset' as const, name });
  const token = (repoId: string) => getAccessToken(repoId.split('/')[0]);
  const readText = async (repoId: string, url: string, signal: AbortSignal) =>
    (await readBoundedResponse(await client.request(repoId, 'private', signal)(url), 512 * 1024)).text();
  const client: HubClient = {
    request(repoId, visibility, signal) {
      return boundedFetch(signal, 30_000, async (input, init) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
        if (!['GET', 'HEAD'].includes(method) || huggingFaceDatasetReadRepoId(url) !== repoId) {
          throw new HfError('The published dataset requested a file outside its repository.', undefined, true);
        }
        const headers = new Headers(init?.headers);
        headers.delete('Authorization');
        if (visibility === 'private') headers.set('Authorization', `Bearer ${token(repoId)}`);
        const response = await fetch(url, { ...init, headers, credentials: 'omit', cache: 'no-store' });
        if ([401, 403].includes(response.status)) {
          await response.body?.cancel();
          throw visibility === 'private' ? new HfError('Hugging Face denied access to the private dataset.', response.status)
            : new HfError('The public dataset cannot be opened without signing in. Review its access on Hugging Face.');
        }
        return response;
      });
    },
    async assertVisibility(repoId, visibility, signal) {
      const info = await (await sdk()).datasetInfo({ name: repoId, fetch: client.request(repoId, 'private', signal) });
      if (info.private !== (visibility === 'private') || (visibility === 'public' && info.gated)) {
        throw new HfError('Repository access changed during this upload. Review it on Hugging Face before starting a new upload.', undefined, true);
      }
    },
    async head(repoId, signal) {
      const entries = (await sdk()).listCommits({ repo: repo(repoId), accessToken: token(repoId), batchSize: 2, fetch: boundedFetch(signal) });
      const first = await entries.next();
      const second = await entries.next();
      await entries.return(undefined);
      if (first.done || !first.value.oid) throw new HfError('Could not determine the repository revision.');
      return { oid: first.value.oid, title: first.value.title, previous: second.done ? undefined : second.value.oid };
    },
    async create(repoId, operationId, visibility, signal) {
      const marker = JSON.stringify({ version: 2, operationId, repoId, visibility });
      try {
        await (await sdk()).createRepo({ repo: repo(repoId), accessToken: token(repoId), visibility,
          files: [{ path: CREATION_MARKER_PATH, content: new Blob([marker]) },
            { path: 'README.md', content: new Blob(['# Dataset publication in progress\n\nCreated with ColmapView.\n']) }],
          fetch: boundedFetch(signal),
        });
      } catch (error) {
        // A lost response can still leave a created repository. Never adopt a name alone.
        const check = timeoutSignal(20_000);
        try {
          const head = await client.head(repoId, check);
          if (await readText(repoId, datasetFileUrl(repoId, head.oid, CREATION_MARKER_PATH), check) === marker) {
            await client.assertVisibility(repoId, visibility, check);
            return head.oid;
          }
        } catch { /* Preserve original error and retain operation ID for same-tab retry. */ }
        throw error;
      }
      return (await client.head(repoId, timeoutSignal(20_000))).oid;
    },
    async upload(repoId, files, parent, marker, signal, progress) {
      signal.throwIfAborted();
      if ((await client.head(repoId, signal)).oid !== parent) throw new HfError('The repository changed outside this publication. Start with a new repository.', 409);
      const transfer = createTransferTimeout(signal);
      const uploadSignal = transfer.signal;
      try {
        const events = (await awaitWithAbort(sdk(), uploadSignal)).uploadFilesWithProgress({ repo: repo(repoId), accessToken: token(repoId), files,
          parentCommit: parent, commitTitle: commitTitle(marker), commitDescription: marker,
          abortSignal: uploadSignal, useWebWorkers: { poolSize: 2 },
          // Keep the initial browser release on the tested LFS/multipart path.
          useXet: false,
        });
        for (;;) {
          const step = await awaitWithAbort(events.next(), uploadSignal);
          if (step.done) {
            if (!step.value?.commit.oid) throw new HfError('The upload result is uncertain. Retry to check the repository.');
            return step.value.commit.oid;
          }
          const event = step.value;
          transfer.activity();
          if (event.event === 'phase') {
            progress({ preuploading: 'Preparing uploads…', uploadingLargeFiles: 'Uploading file data…', committing: 'Saving dataset revision…' }[event.phase]);
          } else {
            const action = { hashing: 'Checking', uploading: 'Uploading', error: 'Could not upload' }[event.state];
            const percent = event.state !== 'error' && Number.isFinite(event.progress)
              ? ` (${Math.floor(event.progress * 100)}%)` : '';
            progress(`${action} ${event.path}${percent}`);
          }
        }
      } finally { transfer.dispose(); }
    },
    async reconcile(repoId, parent, marker, receipt, signal) {
      const head = await client.head(repoId, signal);
      if (head.oid === parent) return null;
      if (head.title !== commitTitle(marker) || head.previous !== parent
        || await readText(repoId, datasetFileUrl(repoId, head.oid, BATCH_RECEIPT_PATH), signal) !== receipt) {
        throw new HfError('The repository changed outside this publication. Start with a new repository.', 409);
      }
      // Parent, unique commit marker, and atomic receipt bind the full batch to this job.
      return head.oid;
    },
    async files(repoId, revision, visibility, signal) {
      const result: HubFile[] = [];
      for await (const file of (await sdk()).listFiles({ repo: repo(repoId), revision, recursive: true, fetch: client.request(repoId, visibility, signal) })) {
        if (file.type === 'file') result.push({ path: file.path, size: file.size, oid: file.lfs?.oid ?? file.oid ?? file.xetHash });
      }
      return result;
    },
  };
  return client;
}
