import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReconstructionSnapshot } from '../wasm/reconstructionService';
import type { ReconstructionExportFiles } from '../wasm/reconstructionProtocol';
import { downloadFile } from '../utils/download';
import { downloadReconstructionZipFromWriters } from './reconstructionZipExport';
import { exportReconstructionSnapshot, exportSnapshotZip } from './reconstructionSnapshotExport';

vi.mock('../utils/download', () => ({ downloadFile: vi.fn() }));
vi.mock('./reconstructionZipExport', () => ({
  downloadReconstructionZipFromWriters: vi.fn(),
  exportReconstructionZipFromWriters: vi.fn(),
}));
afterEach(() => vi.clearAllMocks());

describe('snapshot export cancellation', () => {
  it.each(['text', 'zip', 'zip-blob'] as const)('settles %s cancellation before serialization finishes and ignores late files', async format => {
    let finish!: (files: ReconstructionExportFiles) => void;
    const exportFiles = vi.fn(() => new Promise<ReconstructionExportFiles>(resolve => { finish = resolve; }));
    const snapshot = { export: exportFiles } as unknown as ReconstructionSnapshot;
    const controller = new AbortController();
    const signal = controller.signal;
    const pending = format === 'zip-blob'
      ? exportSnapshotZip(snapshot, { format: 'binary', signal })
      : exportReconstructionSnapshot(snapshot, format, undefined, undefined, signal);
    expect(exportFiles).toHaveBeenCalledWith(expect.objectContaining({ format: format === 'text' ? 'text' : 'binary' }), signal);
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await rejected;
    finish({ 'points3D.txt': new Uint8Array([42]) });
    await Promise.resolve();
    expect(downloadFile).not.toHaveBeenCalled();
    expect(downloadReconstructionZipFromWriters).not.toHaveBeenCalled();
  });

  it('downloads completed text files and reports completion', async () => {
    const bytes = new Uint8Array([42]);
    const snapshot = { export: vi.fn().mockResolvedValue({ 'points3D.txt': bytes }) } as unknown as ReconstructionSnapshot;
    const progress = vi.fn();
    await exportReconstructionSnapshot(snapshot, 'text', undefined, undefined, undefined, progress);
    expect(downloadFile).toHaveBeenCalledWith(bytes.buffer, 'points3D.txt');
    expect(progress.mock.calls).toEqual([[0, 'Preparing COLMAP files...'], [100, 'Done']]);
  });
});
