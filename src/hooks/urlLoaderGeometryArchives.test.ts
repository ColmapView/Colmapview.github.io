import { File as NativeFile } from 'node:buffer';
import { createHash, webcrypto } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ColmapManifest, ManifestGeometryArchive } from '../types/manifest';
import { extractZstdTarPrefix } from '../archive/zstdTarPrefix';
import { fetchManifestGeometry } from './urlLoaderGeometryArchives';

const archive = vi.hoisted(() => ({ open: vi.fn(), prefix: vi.fn() }));
vi.mock('../archive/archiveService', () => ({ openArchiveReader: archive.open, extractFirstZstdTarMember: archive.prefix }));
const body = "ply\nformat ascii 1.0\nelement vertex 2\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n1 2 3 10 20 30\n-1 -2 -3 200 210 220\n";
const prefix = Uint8Array.from(atob("KLUv/QBYFAYAEsshHYC1zQFowjapbev3Mba0vzMD04OBm0jJB46TVuo76Jk+pv90KpyFsUBPfvro5DSi1WPpIeBQFGnDBBTVHTh0vetgaApewm4tDPFzq23ZhtIJdasEdoomyhTdQCMQBmbZrWQXBD3W7qMKiKieHmvG+c8uxzSH4KMIqfCf/0oB/P8ZMJqsRQZGFgBWQAECKUQKcSK1OQJW+8B2AGFGE9lgQI1AdoDbB4gUCAEDRAHmgDoApIMVPx/ACgCOlcvcBJA="), byte => byte.charCodeAt(0));
const hash = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');
const item = (): ManifestGeometryArchive => ({ url: 'https://example.com/sequence.tar.zst', bytes: 1000000, format: 'tar.zst', role: 'points3D',
  member: { path: 'frames/frame.ply', bytes: body.length, sha256: hash(body) }, prefix: { bytes: prefix.length, sha256: hash(prefix) } });
const manifest = (geometry?: ManifestGeometryArchive[]): ColmapManifest => ({ version: geometry ? 3 : 1,
  baseUrl: 'https://example.com/', files: { cameras: 'cameras.bin', images: 'images.bin' }, geometryFiles: geometry });
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal('File', NativeFile); vi.stubGlobal('crypto', webcrypto);
  archive.prefix.mockImplementation((file, path, bytes, options) => extractZstdTarPrefix(file, path, bytes, options.signal));
});
afterEach(() => vi.unstubAllGlobals());

function rangeFetch() {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    const range = new Headers(init?.headers).get('Range')!.match(/^bytes=(\d+)-(\d+)$/)!;
    const start = Number(range[1]), end = Number(range[2]), data = new Uint8Array(end - start + 1);
    if (start === 0) data.set(prefix);
    return new Response(data, { status: 206, headers: { 'Content-Range': 'bytes ' + start + '-' + end + '/1000000', ETag: '"fixed"' } });
  });
}
it('keeps existing loose manifests free of archive requests', async () => {
  const fetchImpl = vi.fn();
  expect((await fetchManifestGeometry(manifest(), { fetchImpl })).size).toBe(0);
  expect(fetchImpl).not.toHaveBeenCalled(); expect(archive.open).not.toHaveBeenCalled();
});
it('reads a checked prefix and installs PLY geometry in the native model group', async () => {
  const fetchImpl = rangeFetch(), files = await fetchManifestGeometry(manifest([item()]), { fetchImpl });
  expect([...files.keys()]).toEqual(['sparse/0/points3D.bin']);
  const file = files.get('sparse/0/points3D.bin')!;
  expect(file.name).toBe('points3D.ply'); expect(await file.text()).toBe(body);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(new Headers(fetchImpl.mock.calls[0][1]?.headers).get('Range')).toBe('bytes=0-65535');
});
it('checks the compressed prefix and extracted member independently', async () => {
  const badPrefix = item(); badPrefix.prefix!.sha256 = '0'.repeat(64);
  await expect(fetchManifestGeometry(manifest([badPrefix]), { fetchImpl: rangeFetch() })).rejects.toThrow(/integrity/);
  expect(archive.prefix).not.toHaveBeenCalled();
  const badMember = item(); badMember.member.sha256 = '0'.repeat(64);
  await expect(fetchManifestGeometry(manifest([badMember]), { fetchImpl: rangeFetch() })).rejects.toThrow(/integrity/);
  expect(archive.prefix).toHaveBeenCalledOnce();
});
function zipReader(paths: string[], bytes = body.length) {
  const extract = vi.fn(async () => new File([body], 'frame.ply'));
  const close = vi.fn(async () => {});
  archive.open.mockResolvedValue({ close, getFilesArray: async () => paths.map(path => ({
    path: path.slice(0, path.lastIndexOf('/')), file: { name: path.split('/').at(-1), size: bytes, extract },
  })) });
  return { extract, close };
}
const zipped = (): ManifestGeometryArchive => ({ ...item(), url: 'https://example.com/frames.zip', format: 'zip', prefix: undefined });
it('resolves one canonical ZIP path and closes the reader after extraction', async () => {
  const { extract, close } = zipReader(['./frames/frame.ply']);
  const files = await fetchManifestGeometry(manifest([zipped()]));
  expect(files.size).toBe(1); expect(extract).toHaveBeenCalledOnce(); expect(close).toHaveBeenCalledOnce();
});
it('does not extract ambiguous paths or entries with a changed declared size', async () => {
  for (const [paths, size] of [[['frames/frame.ply', './frames/frame.ply'], body.length], [['frames/frame.ply'], body.length + 1]] as const) {
    const { extract, close } = zipReader([...paths], size);
    await expect(fetchManifestGeometry(manifest([zipped()]))).rejects.toThrow(/ambiguous/);
    expect(extract).not.toHaveBeenCalled(); expect(close).toHaveBeenCalledOnce();
  }
});
it('does not treat an XYZ cloud as a declared Gaussian splat or start an aborted read', async () => {
  const reader = zipReader(['frames/frame.ply']);
  await expect(fetchManifestGeometry(manifest([{ ...zipped(), role: 'splat' }]))).rejects.toThrow(/role/);
  expect(reader.close).toHaveBeenCalledOnce();
  const controller = new AbortController(); controller.abort();
  const fetchImpl = vi.fn();
  await expect(fetchManifestGeometry(manifest([item()]), { fetchImpl, signal: controller.signal })).rejects.toThrow();
  expect(fetchImpl).not.toHaveBeenCalled();
});

