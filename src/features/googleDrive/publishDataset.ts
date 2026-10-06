import { HfError } from '../huggingface/http';
import type { DriveArchive, DriveArchiveProgress } from './prepareArchive';
import { DRIVE_OPERATION_KEY, DRIVE_UPLOAD_CHUNK_BYTES, driveSharingUrl, GoogleDrivePublishError, type DrivePublishedFile, type DriveUploadClient } from './upload';

export type DrivePublicationPhase = 'idle' | 'preparing' | 'uploading' | 'verifying' | 'sharing' | 'cancelling' | 'cancelled' | 'failed' | 'completed';
export interface DrivePublicationReceipt { fileId: string; driveUrl: string; viewerUrl: string; shared: boolean }
export interface DrivePublicationState {
  phase: DrivePublicationPhase; message: string; bytesDone: number; bytesTotal: number;
  filesDone: number; filesTotal: number; canRetry: boolean; fileUrl?: string;
  receipt?: DrivePublicationReceipt; error?: string;
}
export const isDrivePublishing = (phase: DrivePublicationPhase) => ['preparing', 'uploading', 'verifying', 'sharing', 'cancelling'].includes(phase);
export function drivePublicationErrorMessage(error: unknown): string {
  return error instanceof GoogleDrivePublishError || error instanceof HfError ? error.message
    : 'Drive publication could not finish. Check your connection and retry in this tab.';
}
export function normalizeDriveArchiveName(input: string): string {
  const name = input.trim();
  if (!name || name.length > 180 || /[\\/]/.test(name) || /^\.+$/.test(name)
    || [...name].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) {
    throw new GoogleDrivePublishError('Choose a file name without slashes or control characters (up to 180 characters).');
  }
  return /\.zip$/i.test(name) ? name : `${name}.zip`;
}
const initial = (): DrivePublicationState => ({ phase: 'idle', message: '', bytesDone: 0, bytesTotal: 0, filesDone: 0, filesTotal: 0, canRetry: false });
type PrepareArchive = (signal: AbortSignal, progress: DriveArchiveProgress) => Promise<DriveArchive>;
interface Job {
  name: string; shared: boolean; operationId: string; prepare: PrepareArchive; assertCurrent: () => void;
  archive?: DriveArchive; ownerId?: string; fileId?: string; sessionUrl?: string; invalid: boolean;
}

/** A pre-generated file ID and private operation marker bind every retry to this upload. */
export function createDrivePublicationController(client: DriveUploadClient) {
  let state = initial();
  let job: Job | null = null;
  let active: AbortController | null = null;
  const listeners = new Set<() => void>();
  const set = (next: Partial<DrivePublicationState>) => { state = { ...state, ...next }; listeners.forEach(listener => listener()); };
  const run = async (): Promise<void> => {
    if (!job || active || state.phase === 'completed' || job.invalid) return;
    const current = job;
    const controller = new AbortController();
    active = controller;
    const signal = controller.signal;
    const check = () => {
      signal.throwIfAborted();
      if (current.invalid || current !== job) throw new GoogleDrivePublishError('The dataset changed. Start a new Drive publication.');
      current.assertCurrent();
    };
    const update = (next: Partial<DrivePublicationState>) => { check(); set(next); };
    const owned = (file: DrivePublishedFile) => {
      if (file.id !== current.fileId || file.name !== current.name || file.trashed || file.mimeType !== 'application/zip'
        || file.appProperties?.[DRIVE_OPERATION_KEY] !== current.operationId) {
        throw new GoogleDrivePublishError('The Drive file changed outside this publication. Start a new publication.');
      }
    };
    const complete = (file: DrivePublishedFile) => {
      owned(file);
      if (Number(file.size) > 0 && (file.size !== String(current.archive!.blob.size) || file.md5Checksum !== current.archive!.md5)) {
        throw new GoogleDrivePublishError('The uploaded ZIP does not match this publication. Review the file in Drive before starting a new publication.');
      }
      return file.size === String(current.archive!.blob.size) && file.md5Checksum === current.archive!.md5;
    };
    try {
      update({ phase: 'preparing', message: 'Preparing dataset ZIP…', canRetry: false, error: undefined, receipt: undefined });
      if (!current.archive) current.archive = await current.prepare(signal, (message, filesDone, filesTotal) => update({ message, filesDone, filesTotal }));
      check();
      const archive = current.archive;
      update({ message: 'Checking Google Drive account…', bytesTotal: archive.blob.size });
      const owner = await client.owner(signal);
      check();
      if (current.ownerId && current.ownerId !== owner) throw new GoogleDrivePublishError('Reconnect the Google account that started this upload, then retry.');
      current.ownerId = owner;
      if (!current.fileId) current.fileId = await client.generateId(signal);
      check();
      let file = await client.file(current.fileId, signal);
      check();
      if (file) update({ fileUrl: driveSharingUrl(file) });
      let finished = file ? complete(file) : false;
      let offset = 0;
      if (!finished && current.sessionUrl) {
        update({ phase: 'verifying', message: 'Checking previous upload…' });
        try {
          const status = await client.status(current.sessionUrl, archive.blob.size, signal);
          finished = status.complete; offset = status.offset;
        } catch (error) {
          if (!(error instanceof GoogleDrivePublishError && error.status === 404)) throw error;
          current.sessionUrl = undefined;
        }
        check();
      }
      if (!finished && !current.sessionUrl) {
        update({ phase: 'uploading', message: 'Starting Drive upload…', bytesDone: 0 });
        try { current.sessionUrl = await client.start(current.fileId, current.name, current.operationId, archive.blob.size, signal, Boolean(file)); }
        catch (error) {
          // A create may commit despite a lost response. The same ID cannot create a duplicate.
          if (!(error instanceof GoogleDrivePublishError && error.status === 409)) throw error;
          file = await client.file(current.fileId, signal);
          if (!file) throw error;
          update({ fileUrl: driveSharingUrl(file) });
          finished = complete(file);
          if (!finished) current.sessionUrl = await client.start(current.fileId, current.name, current.operationId, archive.blob.size, signal, true);
        }
        check();
      }
      while (!finished) {
        update({ phase: 'uploading', message: `Uploading ${current.name}…`, bytesDone: offset });
        const start = offset;
        const result = await client.chunk(current.sessionUrl!, archive.blob, offset, signal, loaded => {
          if (!signal.aborted && current === job) set({ bytesDone: Math.min(archive.blob.size, start + loaded) });
        });
        check();
        if (!result.complete && result.offset <= offset) throw new GoogleDrivePublishError('Google Drive did not confirm upload progress. Retry to check the upload.');
        if (!result.complete && result.offset > Math.min(archive.blob.size, offset + DRIVE_UPLOAD_CHUNK_BYTES)) throw new GoogleDrivePublishError('Google Drive returned inconsistent upload progress.');
        offset = result.offset; finished = result.complete;
      }
      update({ phase: 'verifying', message: 'Verifying uploaded ZIP…', bytesDone: archive.blob.size });
      file = await client.file(current.fileId, signal);
      check();
      if (file) update({ fileUrl: driveSharingUrl(file) });
      if (!file || !complete(file)) throw new GoogleDrivePublishError('Google Drive has not confirmed the complete ZIP. Retry to verify it.');
      const publicPermission = () => file!.permissions?.find(permission => permission.type === 'anyone');
      if (current.shared) {
        if (!publicPermission()) {
          update({ phase: 'sharing', message: 'Enabling link sharing…' });
          await client.share(current.fileId, signal);
        }
        file = await client.file(current.fileId, signal);
        check();
        if (!file || !complete(file) || publicPermission()?.role !== 'reader' || publicPermission()?.allowFileDiscovery !== false) {
          throw new GoogleDrivePublishError('The ZIP uploaded, but link sharing was not confirmed. Retry or review the file in Drive.');
        }
      } else if (file.permissions?.some(permission => permission.type === 'anyone' || permission.type === 'domain')) {
        throw new GoogleDrivePublishError('This file was shared outside the publication. Review its sharing settings in Drive.');
      }
      const driveUrl = driveSharingUrl(file);
      const viewerUrl = new URL(archive.viewerBaseUrl);
      viewerUrl.searchParams.set('url', driveUrl);
      update({ phase: 'completed', message: 'Dataset saved to Google Drive.', canRetry: false, fileUrl: driveUrl,
        receipt: { fileId: current.fileId, driveUrl, viewerUrl: viewerUrl.href, shared: current.shared } });
      current.archive = undefined;
    } catch (error) {
      if (current === job) {
        const cancelled = signal.aborted;
        set({ phase: cancelled ? 'cancelled' : 'failed', message: cancelled
          ? current.invalid ? 'The dataset changed. Start a new Drive publication.' : 'Upload cancelled. Completed files may remain in Drive.'
          : 'Drive publication could not finish.', error: cancelled ? undefined : drivePublicationErrorMessage(error),
          canRetry: !current.invalid });
      }
    } finally { if (active === controller) active = null; }
  };
  const cancel = () => { if (active) { set({ phase: 'cancelling', message: 'Cancelling upload…' }); active.abort(); } };
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async publish(name: string, shared: boolean, prepare: PrepareArchive, assertCurrent: () => void = () => {}) {
      if (active) return;
      job = { name: normalizeDriveArchiveName(name), shared, prepare, assertCurrent, operationId: crypto.randomUUID(), invalid: false };
      state = initial();
      await run();
    },
    retry: run,
    cancel,
    invalidate() { if (job) { job.invalid = true; cancel(); job.archive = undefined; set({ canRetry: false }); } },
    reset() { if (!active) { job = null; state = initial(); listeners.forEach(listener => listener()); } },
  };
}
