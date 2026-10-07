import { Blob as NodeBlob } from 'node:buffer';
import { describe, expect, it, vi } from 'vitest';
import { useReconstructionStore } from '../../store';
import { buildReconstruction } from '../../test/builders';

const client = vi.hoisted(() => {
  let file: Record<string, unknown> | null = null;
  let name = ''; let operation = '';
  return {
    owner: async () => 'account', generateId: async () => 'DRIVE_FILE_123456789', file: async () => file,
    start: async (_id: string, filename: string, marker: string) => { name = filename; operation = marker; return 'session'; },
    status: async () => ({ complete: false, offset: 0 }),
    chunk: async (_url: string, blob: Blob) => {
      file = { id: 'DRIVE_FILE_123456789', name, size: String(blob.size), mimeType: 'application/zip', md5Checksum: 'md5',
        appProperties: { colmapviewOperation: operation }, permissions: [] };
      return { complete: true, offset: blob.size };
    },
    share: async () => {},
  };
});
vi.mock('./upload', async importOriginal => ({ ...await importOriginal<typeof import('./upload')>(), createDriveUploadClient: () => client }));

describe('Drive publication receipt', () => {
  it('clears a finished Drive receipt when another dataset loads', async () => {
    vi.stubGlobal('Blob', NodeBlob);
    const { drivePublication } = await import('./publicationRuntime');
    useReconstructionStore.setState({ reconstruction: buildReconstruction(), sourceType: 'url', sourceUrl: 'https://example.test/a/' });
    await drivePublication.publish('a', false, async () => ({ blob: new Blob(['zip']), md5: 'md5', viewerBaseUrl: 'https://viewer.example/' }));
    expect(drivePublication.getSnapshot().phase).toBe('completed');
    useReconstructionStore.setState({ reconstruction: buildReconstruction(), sourceUrl: 'https://example.test/b/' });
    expect(drivePublication.getSnapshot().phase).toBe('idle');
    expect(drivePublication.getSnapshot().receipt).toBeUndefined();
  });
});
