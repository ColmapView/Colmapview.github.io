import type { ArchiveSource } from './protocol';

export interface ArchiveByteSource {
  readonly name: string;
  readonly size: number;
  read(offset: number, length: number): Promise<Uint8Array<ArrayBuffer>>;
  slice?(offset: number, length: number): Blob;
}

export function validateByteRange(size: number, offset: number, length: number): void {
  if (![size, offset, length].every(Number.isSafeInteger) || size < 0 || offset < 0 || length < 0
    || offset > size || length > size - offset) throw new Error('Archive contains an invalid byte range.');
}

export function createArchiveByteSource(source: ArchiveSource,
  remoteRead: (offset: number, length: number) => Promise<ArrayBuffer>): ArchiveByteSource {
  if ('kind' in source) return {
    name: source.name, size: source.size,
    async read(offset, length) {
      validateByteRange(source.size, offset, length);
      return new Uint8Array(await remoteRead(offset, length));
    },
  };
  return {
    name: source.name, size: source.size,
    async read(offset, length) {
      validateByteRange(source.size, offset, length);
      return new Uint8Array(await source.slice(offset, offset + length).arrayBuffer());
    },
    slice(offset, length) { validateByteRange(source.size, offset, length); return source.slice(offset, offset + length); },
  };
}

export function archiveFileType(name: string): string {
  const extension = name.split('.').pop()?.toLowerCase();
  return ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
    gif: 'image/gif', bmp: 'image/bmp', avif: 'image/avif', tif: 'image/tiff', tiff: 'image/tiff' } as Record<string, string>)[extension ?? '']
    ?? 'application/octet-stream';
}
