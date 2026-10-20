import { Inflate } from 'fflate';
import { archiveFileType, validateByteRange, type ArchiveByteSource } from './byteSource';
import { archiveError, ARCHIVE_ENTRY_COUNT_LIMIT, ARCHIVE_ENTRY_SIZE_LIMIT, ARCHIVE_INDEX_SIZE_LIMIT, type ArchiveMetadata } from './protocol';
import type { ArchiveBackend } from './backend';

interface ZipEntry extends ArchiveMetadata { offset: number; compressedSize: number; method: number; crc: number; flags: number }
const decoder = new TextDecoder();
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
export function updateArchiveCrc(crc: number, bytes: Uint8Array): number {
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return crc >>> 0;
}
function safe64(view: DataView, offset: number): number {
  const value = view.getBigUint64(offset, true);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('ZIP offset exceeds the supported integer range.');
  return Number(value);
}
function view(bytes: Uint8Array): DataView { return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); }

/** Central-directory indexing keeps the archive outside the WASM heap. */
export class IndexedZipBackend implements ArchiveBackend {
  private entries = new Map<string, ZipEntry>();
  private source: ArchiveByteSource;
  private dataEnd = 0;
  constructor(source: ArchiveByteSource) { this.source = source; }

  async list(signal: AbortSignal): Promise<ArchiveMetadata[]> {
    this.entries.clear();
    const length = Math.min(this.source.size, 65557);
    const tail = await this.source.read(this.source.size - length, length);
    const end = view(tail);
    let position = tail.length - 22;
    for (; position >= 0; position--) {
      if (end.getUint32(position, true) === 0x06054b50
        && position + 22 + end.getUint16(position + 20, true) === tail.length) break;
    }
    if (position < 0) throw new Error('ZIP central directory is missing or truncated.');
    if (end.getUint16(position + 4, true) || end.getUint16(position + 6, true)) {
      throw archiveError('Multi-volume ZIP archives are unsupported.', 'ArchiveUnsupportedFeatureError');
    }
    let count = end.getUint16(position + 10, true);
    if (end.getUint16(position + 8, true) !== count) throw new Error('Invalid ZIP volume entry count.');
    let indexSize = end.getUint32(position + 12, true);
    let indexOffset = end.getUint32(position + 16, true);
    const endOffset = this.source.size - length + position;
    if (count === 0xffff || indexSize === 0xffffffff || indexOffset === 0xffffffff) {
      const locator = view(await this.source.read(endOffset - 20, 20));
      if (locator.getUint32(0, true) !== 0x07064b50 || locator.getUint32(4, true) || locator.getUint32(16, true) !== 1) {
        throw new Error('Invalid ZIP64 locator.');
      }
      const record = view(await this.source.read(safe64(locator, 8), 56));
      if (record.getUint32(0, true) !== 0x06064b50 || record.getUint32(16, true) || record.getUint32(20, true)) {
        throw new Error('Invalid ZIP64 central directory.');
      }
      count = safe64(record, 32); indexSize = safe64(record, 40); indexOffset = safe64(record, 48);
    }
    if (count > ARCHIVE_ENTRY_COUNT_LIMIT || indexSize > ARCHIVE_INDEX_SIZE_LIMIT) throw new Error('ZIP file index is too large.');
    validateByteRange(endOffset, indexOffset, indexSize);
    this.dataEnd = indexOffset;
    const index = await this.source.read(indexOffset, indexSize);
    const central = view(index);
    let cursor = 0;
    for (let item = 0; item < count; item++) {
      signal.throwIfAborted();
      if (cursor + 46 > index.length || central.getUint32(cursor, true) !== 0x02014b50) throw new Error('Invalid ZIP entry.');
      const flags = central.getUint16(cursor + 8, true);
      const method = central.getUint16(cursor + 10, true);
      let compressedSize = central.getUint32(cursor + 20, true);
      let size = central.getUint32(cursor + 24, true);
      const nameLength = central.getUint16(cursor + 28, true);
      const extraLength = central.getUint16(cursor + 30, true);
      const commentLength = central.getUint16(cursor + 32, true);
      let offset = central.getUint32(cursor + 42, true);
      const next = cursor + 46 + nameLength + extraLength + commentLength;
      if (next > index.length) throw new Error('Truncated ZIP entry metadata.');
      const nameBytes = index.subarray(cursor + 46, cursor + 46 + nameLength);
      let path = decoder.decode(nameBytes), unicodeName = false;
      const extraEnd = cursor + 46 + nameLength + extraLength;
      for (let extra = cursor + 46 + nameLength; extra + 4 <= extraEnd;) {
        const type = central.getUint16(extra, true), bytes = central.getUint16(extra + 2, true);
        const fieldEnd = extra + 4 + bytes;
        if (fieldEnd > extraEnd) throw new Error('Invalid ZIP extra field.');
        if (type === 1) {
          let field = extra + 4;
          const read = () => { if (field + 8 > fieldEnd) throw new Error('Truncated ZIP64 entry.'); const value = safe64(central, field); field += 8; return value; };
          if (size === 0xffffffff) size = read();
          if (compressedSize === 0xffffffff) compressedSize = read();
          if (offset === 0xffffffff) offset = read();
        } else if (type === 0x7075 && bytes >= 5 && index[extra + 4] === 1
          && central.getUint32(extra + 5, true) === ((updateArchiveCrc(0xffffffff, nameBytes) ^ 0xffffffff) >>> 0)) {
          path = decoder.decode(index.subarray(extra + 9, fieldEnd)); unicodeName = true;
        }
        extra = fieldEnd;
      }
      if (flags & 1 || method !== 0 && method !== 8 || !(flags & 2048) && !unicodeName && nameBytes.some(byte => byte >= 128)) {
        throw archiveError('This ZIP requires the compatibility decoder.', 'ArchiveUnsupportedFeatureError');
      }
      if (central.getUint16(cursor + 34, true)) throw new Error('Multi-volume ZIP entries are unsupported.');
      validateByteRange(indexOffset, offset, compressedSize);
      if (path && !path.endsWith('/')) {
        if (this.entries.has(path)) throw new Error(`Archive contains duplicate file path: ${path}`);
        this.entries.set(path, {
          path, size, compressedSize, offset, method, flags, lastModified: 0, crc: central.getUint32(cursor + 16, true),
        });
      }
      cursor = next;
    }
    return [...this.entries.values()].map(({ path, size, lastModified }) => ({ path, size, lastModified }));
  }

  async extract(path: string, signal: AbortSignal): Promise<File> {
    signal.throwIfAborted();
    const entry = this.entries.get(path);
    if (!entry) throw new Error('Archive entry is unavailable.');
    if (entry.size > ARCHIVE_ENTRY_SIZE_LIMIT) throw new Error('An archive entry exceeds the 2 GiB extraction limit.');
    const header = view(await this.source.read(entry.offset, 30));
    if (header.getUint32(0, true) !== 0x04034b50 || header.getUint16(8, true) !== entry.method
      || (header.getUint16(6, true) & 1)) throw new Error('Invalid ZIP local header.');
    const start = entry.offset + 30 + header.getUint16(26, true) + header.getUint16(28, true);
    validateByteRange(this.dataEnd, start, entry.compressedSize);
    let crc = 0xffffffff, loaded = 0;
    const parts: Uint8Array<ArrayBuffer>[] = [];
    const append = (bytes: Uint8Array<ArrayBuffer>) => {
      loaded += bytes.length;
      if (loaded > entry.size) throw new Error('ZIP entry exceeds its declared uncompressed size.');
      crc = updateArchiveCrc(crc, bytes);
      if (entry.method !== 0 || !this.source.slice) parts.push(bytes);
    };
    const inflater = entry.method === 8 ? new Inflate(append) : null;
    const chunkSize = inflater ? 16384 : 1024 * 1024;
    for (let offset = 0; offset < entry.compressedSize; offset += chunkSize) {
      signal.throwIfAborted();
      const bytes = await this.source.read(start + offset, Math.min(chunkSize, entry.compressedSize - offset));
      if (inflater) inflater.push(bytes, offset + bytes.length === entry.compressedSize); else append(bytes);
    }
    signal.throwIfAborted();
    if (loaded !== entry.size || ((crc ^ 0xffffffff) >>> 0) !== entry.crc) throw new Error('ZIP entry failed its size or CRC integrity check.');
    const original = entry.method === 0 && this.source.slice ? this.source.slice(start, loaded) : new Blob(parts);
    return new File([original], path.split('/').pop() ?? path, { type: archiveFileType(path), lastModified: entry.lastModified });
  }

  async close(): Promise<void> { this.entries.clear(); }
}
