import { archiveFileType, validateByteRange, type ArchiveByteSource } from './byteSource';
import type { ArchiveBackend } from './backend';
import { archiveError, ARCHIVE_ENTRY_COUNT_LIMIT, ARCHIVE_ENTRY_SIZE_LIMIT, type ArchiveMetadata } from './protocol';

interface TarEntry extends ArchiveMetadata { offset: number }
const decoder = new TextDecoder();
const text = (bytes: Uint8Array) => decoder.decode(bytes).replace(/\0.*$/s, '');
function tarNumber(bytes: Uint8Array, nonNegative = true): number {
  let value: number;
  if (bytes[0] & 128) {
    let wide = BigInt(bytes[0] & 127);
    for (const byte of bytes.subarray(1)) wide = wide * 256n + BigInt(byte);
    if (bytes[0] & 64) wide -= 1n << BigInt(bytes.length * 8 - 1);
    value = Number(wide);
  } else {
    const digits = text(bytes).trim();
    if (digits && !/^-?[0-7]+$/.test(digits)) throw new Error('Invalid TAR numeric field.');
    value = digits ? parseInt(digits, 8) : 0;
  }
  if (!Number.isSafeInteger(value) || nonNegative && value < 0) throw new Error('TAR value exceeds the supported integer range.');
  return value;
}
function paxFields(bytes: Uint8Array): Record<string, string> {
  const fields: Record<string, string> = Object.create(null);
  for (let offset = 0; offset < bytes.length;) {
    const space = bytes.indexOf(32, offset);
    if (space < 0) throw new Error('Invalid TAR PAX record.');
    const lengthText = decoder.decode(bytes.subarray(offset, space));
    if (!/^\d+$/.test(lengthText)) throw new Error('Invalid TAR PAX length.');
    const length = Number(lengthText);
    if (!Number.isSafeInteger(length) || length <= space - offset + 2 || offset + length > bytes.length) throw new Error('Invalid TAR PAX length.');
    if (bytes[offset + length - 1] !== 10) throw new Error('Invalid TAR PAX record terminator.');
    const record = decoder.decode(bytes.subarray(space + 1, offset + length - 1));
    const equal = record.indexOf('=');
    if (equal > 0) fields[record.slice(0, equal)] = record.slice(equal + 1);
    offset += length;
  }
  return fields;
}

/** TAR entries are indexed by offsets; image bodies are read only when requested. */
export class IndexedTarBackend implements ArchiveBackend {
  private entries = new Map<string, TarEntry>();
  private source: ArchiveByteSource;
  constructor(source: ArchiveByteSource) { this.source = source; }

  async list(signal: AbortSignal): Promise<ArchiveMetadata[]> {
    let offset = 0, count = 0;
    let globalFields: Record<string, string> = {}, localFields: Record<string, string> = {};
    let longName: string | undefined;
    while (offset + 512 <= this.source.size) {
      signal.throwIfAborted();
      const header = await this.source.read(offset, 512);
      if (header.every(byte => byte === 0)) break;
      let checksum = 0, signedChecksum = 0;
      for (let index = 0; index < 512; index++) {
        const byte = index >= 148 && index < 156 ? 32 : header[index];
        checksum += byte; signedChecksum += byte >= 128 ? byte - 256 : byte;
      }
      const declaredChecksum = tarNumber(header.subarray(148, 156));
      if (declaredChecksum !== checksum && declaredChecksum !== signedChecksum) throw new Error('TAR header checksum is invalid.');
      const kind = String.fromCharCode(header[156]);
      let size = tarNumber(header.subarray(124, 136));
      const payload = offset + 512;
      validateByteRange(this.source.size, payload, size);
      if (['x', 'g', 'L', 'K'].includes(kind)) {
        if (size > 1024 * 1024) throw new Error('TAR extended metadata is too large.');
        const bytes = await this.source.read(payload, size);
        if (kind === 'x') localFields = paxFields(bytes);
        if (kind === 'g') globalFields = { ...globalFields, ...paxFields(bytes) };
        if (kind === 'L') longName = text(bytes).replace(/\n$/, '');
      } else {
        const fields = { ...globalFields, ...localFields };
        if (kind === 'S' || Object.keys(fields).some(key => key.startsWith('GNU.sparse.'))) {
          throw archiveError('Sparse TAR files require the compatibility decoder.', 'ArchiveUnsupportedFeatureError');
        }
        const prefix = text(header.subarray(345, 500));
        // GNU's "ustar  " header uses the POSIX prefix area for timestamps and sparse metadata.
        const ustar = text(header.subarray(257, 263)) === 'ustar';
        const name = text(header.subarray(0, 100));
        const path = fields.path ?? longName ?? (ustar && prefix ? `${prefix}/${name}` : name);
        if (fields.size !== undefined) {
          if (!/^\d+$/.test(fields.size)) throw new Error('Invalid TAR PAX file size.');
          size = Number(fields.size); validateByteRange(this.source.size, payload, size);
        }
        if ((kind === '0' || kind === '\0' || kind === '7') && path && !this.entries.has(path)) {
          const mtime = fields.mtime === undefined ? tarNumber(header.subarray(136, 148), false) : Number(fields.mtime);
          if (!Number.isFinite(mtime) || Math.abs(mtime * 1000) > Number.MAX_SAFE_INTEGER) throw new Error('Invalid TAR modification time.');
          this.entries.set(path, { path, size, offset: payload, lastModified: mtime * 1000 });
        }
        localFields = {}; longName = undefined;
      }
      if (++count > ARCHIVE_ENTRY_COUNT_LIMIT) throw new Error('TAR file index is too large.');
      offset = payload + Math.ceil(size / 512) * 512;
      if (!Number.isSafeInteger(offset) || offset > this.source.size) throw new Error('TAR archive is truncated.');
    }
    if (this.entries.size === 0) throw new Error('TAR archive contains no regular files.');
    return [...this.entries.values()].map(({ path, size, lastModified }) => ({ path, size, lastModified }));
  }

  async extract(path: string, signal: AbortSignal): Promise<File> {
    const entry = this.entries.get(path);
    if (!entry) throw new Error('Archive entry is unavailable.');
    signal.throwIfAborted();
    if (entry.size > ARCHIVE_ENTRY_SIZE_LIMIT) throw new Error('An archive entry exceeds the 2 GiB extraction limit.');
    const parts: Uint8Array<ArrayBuffer>[] = [];
    if (!this.source.slice) for (let offset = 0; offset < entry.size; offset += 1024 * 1024) {
      signal.throwIfAborted();
      parts.push(await this.source.read(entry.offset + offset, Math.min(1024 * 1024, entry.size - offset)));
    }
    signal.throwIfAborted();
    return new File([this.source.slice?.(entry.offset, entry.size) ?? new Blob(parts)], path.split('/').pop() ?? path,
      { type: archiveFileType(path), lastModified: entry.lastModified });
  }

  async close(): Promise<void> { this.entries.clear(); }
}
