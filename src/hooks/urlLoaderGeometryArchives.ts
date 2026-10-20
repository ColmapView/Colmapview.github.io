import type { ColmapManifest, ManifestGeometryArchive } from '../types/manifest';
import { createRemoteArchiveRead } from '../archive/remoteArchive';
import { extractFirstZstdTarMember, openArchiveReader } from '../archive/archiveService';
import { fetchDatasetResource } from '../utils/fetchDatasetResource';
import { classifyPlyFile } from '../parsers/plyPointCloud';

type FetchGeometry = (url: string, init?: RequestInit) => Promise<Response>;
async function checkedHash(file: Blob, expected: string, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  const bytes = await file.arrayBuffer();
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  signal.throwIfAborted();
  if ([...hash].map(byte => byte.toString(16).padStart(2, '0')).join('') !== expected) {
    throw new Error('Selected geometry bytes differ from the manifest integrity receipt.');
  }
}

async function extractGeometry(item: ManifestGeometryArchive, signal: AbortSignal, fetchImpl: FetchGeometry): Promise<File> {
  const read = createRemoteArchiveRead(item.url, item.bytes, (url, _timeout, init) => fetchImpl(url, init));
  let file: File;
  if (item.format === 'tar.zst') {
    if (!item.prefix) throw new Error('Zstandard geometry needs a checked compressed prefix.');
    const bytes = await read(0, item.prefix.bytes, signal);
    const prefix = new File([bytes], 'selected-prefix.tar.zst');
    await checkedHash(prefix, item.prefix.sha256, signal);
    file = await extractFirstZstdTarMember(prefix, item.member.path, item.member.bytes, { signal });
  } else {
    const reader = await openArchiveReader({ kind: 'remote', name: 'geometry.zip', size: item.bytes }, { read, signal });
    try {
      const entries = await reader.getFilesArray();
      const matches = entries.filter(entry => ((entry.path ? entry.path + '/' : '') + entry.file.name).replace(/^(\.\/)+/, '') === item.member.path);
      const entry = matches[0];
      if (matches.length !== 1 || !entry || entry.file.size !== item.member.bytes) throw new Error('Selected ZIP geometry member is ambiguous, absent or has a different size.');
      file = await entry.file.extract({ signal });
    } finally { await reader.close(); }
  }
  signal.throwIfAborted();
  if (file.size !== item.member.bytes) throw new Error('Selected geometry member is incomplete.');
  await checkedHash(file, item.member.sha256, signal);
  if (/\.ply$/i.test(item.member.path)) {
    const kind = await classifyPlyFile(file);
    if (kind !== (item.role === 'points3D' ? 'point-cloud' : 'gaussian-splat')) throw new Error('Selected PLY does not match its declared geometry role.');
  }
  return file;
}

/** Required archive geometry must finish before committing the new scene. */
export async function fetchManifestGeometry(manifest: ColmapManifest, options: {signal?: AbortSignal; fetchImpl?: FetchGeometry} = {}): Promise<Map<string, File>> {
  const files = new Map<string, File>();
  const signal = options.signal ?? new AbortController().signal;
  const fetchImpl = options.fetchImpl ?? ((url, init) => fetchDatasetResource(url, undefined, init));
  for (const item of manifest.geometryFiles ?? []) {
    signal.throwIfAborted();
    const file = await extractGeometry(item, signal, fetchImpl);
    const path = item.role === 'points3D' ? 'sparse/0/points3D.bin' : 'geometry/' + item.member.path;
    if (files.has(path)) throw new Error('Geometry archive members collide.');
    files.set(path, item.role === 'points3D' ? new File([file], 'points3D.ply') : file);
  }
  return files;
}

