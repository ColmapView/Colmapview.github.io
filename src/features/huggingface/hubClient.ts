import { boundedFetch, errorStatus, HfError } from './http';
import { datasetFileUrl } from '../datasetPublishing/publicationPaths';
import { readBoundedResponse } from '../../utils/publishedViewerState';
import { awaitWithAbort } from '../../utils/awaitWithAbort';
import { createTransferTimeout } from './transferTimeout';

export interface UploadFile { path: string; content: Blob }
export interface HubFile { path: string; size: number; oid?: string }
export interface HubHead { oid: string; title: string; previous?: string }
export interface HubClient {
  create: (repoId: string, operationId: string, signal: AbortSignal) => Promise<string>;
  head: (repoId: string, signal: AbortSignal) => Promise<HubHead>;
  upload: (repoId: string, files: UploadFile[], parent: string, marker: string, signal: AbortSignal, progress: (message: string) => void) => Promise<string>;
  reconcile: (repoId: string, parent: string, marker: string, receipt: string, signal: AbortSignal) => Promise<string | null>;
  /** Lists every file at a revision, or only under `path` (empty when that folder is missing). */
  files: (repoId: string, revision: string, signal: AbortSignal, path?: string) => Promise<HubFile[]>;
  resolveRevision: (repoId: string, revision: string, signal: AbortSignal) => Promise<string>;
}

export const BATCH_RECEIPT_PATH = 'colmapview-upload.json';
export const CREATION_MARKER_PATH = 'colmapview-publication.json';
export const commitTitle = (marker: string) => `ColmapView publication ${marker}`;

export function createHubClient(getAccessToken: (username: string) => string): HubClient {
  const sdk = () => import('@huggingface/hub');
  const repo = (name: string) => ({ type: 'dataset' as const, name });
  const token = (repoId: string) => getAccessToken(repoId.split('/')[0]);
  const readText = async (url: string, signal: AbortSignal) =>
    (await readBoundedResponse(await boundedFetch(signal)(url), 512 * 1024)).text();
  const client: HubClient = {
    async resolveRevision(repoId, revision, signal) {
      const info = await (await sdk()).datasetInfo({ name: repoId, revision, additionalFields: ['sha'], fetch: boundedFetch(signal) });
      if (info.private || info.gated || info.name !== repoId || !/^[a-f0-9]{40,64}$/i.test(info.sha)) {
        throw new HfError('Publication requires a public, ungated Hugging Face dataset.');
      }
      return info.sha;
    },
    async head(repoId, signal) {
      const entries = (await sdk()).listCommits({ repo: repo(repoId), batchSize: 2, fetch: boundedFetch(signal) });
      const first = await entries.next();
      const second = await entries.next();
      await entries.return(undefined);
      if (first.done || !first.value.oid) throw new HfError('Could not determine the repository revision.');
      return { oid: first.value.oid, title: first.value.title, previous: second.done ? undefined : second.value.oid };
    },
    async create(repoId, operationId, signal) {
      const marker = JSON.stringify({ version: 1, operationId, repoId });
      try {
        await (await sdk()).createRepo({ repo: repo(repoId), accessToken: token(repoId), visibility: 'public',
          files: [{ path: CREATION_MARKER_PATH, content: new Blob([marker]) },
            { path: 'README.md', content: new Blob(['# Dataset publication in progress\n\nCreated with ColmapView.\n']) }],
          fetch: boundedFetch(signal),
        });
      } catch (error) {
        // A lost response can still leave a created repository. Never adopt a name alone.
        const check = AbortSignal.timeout(20_000);
        try {
          const head = await client.head(repoId, check);
          if (await readText(datasetFileUrl(repoId, head.oid, CREATION_MARKER_PATH), check) === marker) return head.oid;
        } catch { /* Preserve original error and retain operation ID for same-tab retry. */ }
        throw error;
      }
      return (await client.head(repoId, AbortSignal.timeout(20_000))).oid;
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
        || await readText(datasetFileUrl(repoId, head.oid, BATCH_RECEIPT_PATH), signal) !== receipt) {
        throw new HfError('The repository changed outside this publication. Start with a new repository.', 409);
      }
      // Parent, unique commit marker, and atomic receipt bind the full batch to this job.
      return head.oid;
    },
    async files(repoId, revision, signal, path) {
      const result: HubFile[] = [];
      try {
        for await (const file of (await sdk()).listFiles({ repo: repo(repoId), revision, path, recursive: true, fetch: boundedFetch(signal) })) {
          if (file.type === 'file') result.push({ path: file.path, size: file.size, oid: file.lfs?.oid ?? file.oid ?? file.xetHash });
        }
      } catch (error) {
        // A missing folder has no files; the repository revision itself was already resolved.
        if (path && errorStatus(error) === 404) return [];
        throw error;
      }
      return result;
    },
  };
  return client;
}
