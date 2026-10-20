import type { ColmapManifest } from '../types/manifest';
import type { ArchiveEntry, ArchiveReader } from '../archive/types';
import { openArchiveReader, type ArchiveServiceOptions } from '../archive/archiveService';
import { createRemoteArchiveRead } from '../archive/remoteArchive';
import { closeZipArchive } from '../utils/zipArchiveState';
import { imageResourceUrl } from '../dataset/importers/sourcePaths';
import { isAuxiliaryImagePath, isDatasetMaskImagePath } from '../utils/imageFileLookupPolicy';

export interface ManifestMediaArchives {
  reader: ArchiveReader;
  index: Map<string, ArchiveEntry>;
  entries: Map<string, ArchiveEntry>;
  imagePaths: string[];
  maskPaths: string[];
  bytes: number;
}

const owners = new WeakMap<ReadonlyMap<string, File>, ManifestMediaArchives>();
export const rememberManifestMediaArchives = (files: ReadonlyMap<string, File>, resources: ManifestMediaArchives) => owners.set(files, resources);
export const getManifestMediaArchives = (files: ReadonlyMap<string, File>) => owners.get(files);

function safeMember(path: string): boolean {
  return !!path && !/\\/.test(path) && ![...path].some(character => character.charCodeAt(0) <= 31)
    && path.split('/').every(part => part !== '' && part !== '.' && part !== '..');
}

/** Index members without downloading whole archives or changing the native model. */
export async function openManifestMediaArchives(manifest: ColmapManifest, options: {
  signal?: AbortSignal;
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
  openReader?: (source: { kind: 'remote'; name: string; size: number }, options: ArchiveServiceOptions) => Promise<ArchiveReader>;
} = {}): Promise<ManifestMediaArchives | null> {
  if (manifest.skipImages || !manifest.mediaArchives?.length) return null;
  const readers: ArchiveReader[] = [];
  const index = new Map<string, ArchiveEntry>(), entries = new Map<string, ArchiveEntry>();
  const imagePaths: string[] = [], maskPaths: string[] = [];
  const close = async () => {
    const results = await Promise.allSettled(readers.map(closeZipArchive));
    const failed = results.find(result => result.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;
  };
  let bytes = 0;
  try {
    for (const archive of manifest.mediaArchives) {
      options.signal?.throwIfAborted();
      bytes += archive.bytes;
      if (!Number.isSafeInteger(bytes)) throw new Error('Combined archive size exceeds the supported range.');
      const name = new URL(archive.url).pathname.split('/').at(-1)!;
      const read = createRemoteArchiveRead(archive.url, archive.bytes,
        options.fetchImpl ? (url, _timeout, init) => options.fetchImpl!(url, init) : undefined);
      const reader = await (options.openReader ?? openArchiveReader)({ kind: 'remote', name, size: archive.bytes }, { read, signal: options.signal });
      readers.push(reader);
      const previousCount = index.size;
      const prefix = archive.stripPrefix ? archive.stripPrefix.replace(/\/$/, '') + '/' : '';
      for (const item of await reader.getFilesArray()) {
        options.signal?.throwIfAborted();
        // Plain TAR commonly uses a leading ./; never normalize parent traversal.
        const member = (item.path ? item.path + '/' : '') + item.file.name;
        const path = member.replace(/^(?:\.\/)+/, '');
        if (!safeMember(path)) throw new Error('Unsafe companion archive member path.');
        if (path.split('/').some(part => part === '__MACOSX' || part.startsWith('._'))
          || !/\.(jpe?g|png|webp|bmp|tiff?)$/i.test(path) || !path.startsWith(prefix)) continue;
        if (archive.role !== 'masks' && (isAuxiliaryImagePath(path) || isDatasetMaskImagePath(path))) continue;
        const relative = archive.mountPath + '/' + path.slice(prefix.length);
        if (!safeMember(relative)) throw new Error('Unsafe companion archive mount.');
        // Archive paths are case-sensitive; native media lookup resolves exact names
        // first and leaves ambiguous case-insensitive aliases unresolved.
        if (index.has(relative)) throw new Error('Companion archive members collide at their mounted paths.');
        index.set(relative, item.file);
        entries.set(imageResourceUrl(manifest.baseUrl, relative), item.file);
        (archive.role === 'masks' ? maskPaths : imagePaths).push(relative);
      }
      options.signal?.throwIfAborted();
      if (index.size === previousCount) throw new Error('Companion archive contains no supported media at its declared prefix.');
    }
    options.signal?.throwIfAborted();
    const reader: ArchiveReader = { close, getFilesArray: async () => [...index].map(([path, file]) => ({ path: path.slice(0, path.lastIndexOf('/')), file })) };
    return { reader, index, entries, imagePaths, maskPaths, bytes };
  } catch (error) {
    await close().catch(() => {});
    throw error;
  }
}
