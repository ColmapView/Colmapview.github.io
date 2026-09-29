import { Inflate } from 'fflate';
import { readImageDimensions } from '../utils/imageDimensions';

/**
 * Checks a PlayCanvas SOG bundle before Spark decodes it. Reads only the zip's
 * directory, meta.json and the first bytes of each per-splat texture, so a
 * malformed or oversized bundle is refused without touching the GPU.
 */
export class SogBundleError extends Error {
  constructor(message: string) { super(message); this.name = 'SogBundleError'; }
}

export interface SogBundleInfo { version: 1 | 2; count: number; shBands: number }

const EOCD_SIGNATURE = 0x06054b50;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const EOCD_SEARCH_BYTES = 65_535 + 22;
const MAX_ENTRIES = 64;
// 16 KiB per record for 64 entries; real SOG directories are a few KB, so the whole file is never read as one.
const MAX_DIRECTORY_BYTES = 1024 * 1024;
const MAX_META_BYTES = 1024 * 1024;
const MAX_SPLATS = 50_000_000;
const TEXTURE_PREFIX_BYTES = 64;
// Deflate input fed per step: a bomb can expand at most ~1000× one step (about 4 MB) before it is checked.
const INFLATE_STEP_BYTES = 4096;
// Deflate input read for a texture's first bytes; covers a full stored block (65,535 bytes plus a 5-byte header).
const TEXTURE_PREFIX_INPUT_BYTES = 128 * 1024;
const UTF8_NAME_FLAG = 0x800;
const UNICODE_PATH_FIELD = 0x7075;

interface ZipEntry { name: string; method: number; compressedSize: number; size: number; localHeaderOffset: number }
interface ParsedMeta { version: 1 | 2; count: number; shBands: number; files: string[]; textures: string[] }

// A declaration (not a const arrow) so TypeScript's control flow treats calls as never returning.
function fail(message: string): never {
  throw new SogBundleError(message);
}
const read = async (file: Blob, start: number, end: number) => new Uint8Array(await file.slice(start, end).arrayBuffer());
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isFiniteArray = (value: unknown, length?: number): value is number[] =>
  Array.isArray(value) && value.length > 0 && (length === undefined || value.length === length)
  && value.every((item) => typeof item === 'number' && Number.isFinite(item));
const isFileList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string' && item.length > 0);
const inRange = (values: number[], min: number, max: number) => values.every((value) => value >= min && value <= max);

function hasExtraField(view: DataView, start: number, length: number, id: number): boolean {
  for (let at = start; at + 4 <= start + length; at += 4 + view.getUint16(at + 2, true)) {
    if (view.getUint16(at, true) === id) return true;
  }
  return false;
}

async function readDirectory(file: Blob): Promise<Map<string, ZipEntry>> {
  const tailStart = Math.max(0, file.size - EOCD_SEARCH_BYTES);
  const tail = await read(file, tailStart, file.size);
  const tailView = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  let eocd = -1;
  for (let offset = tail.length - 22; offset >= 0; offset--) {
    if (tailView.getUint32(offset, true) === EOCD_SIGNATURE) { eocd = offset; break; }
  }
  if (eocd < 0) fail('it is not a valid SOG bundle (no zip directory).');
  // Spark's zip reader skips an end record whose comment runs past the file and falls back to an earlier one.
  if (eocd + 22 + tailView.getUint16(eocd + 20, true) > tail.length) fail('its zip directory is damaged.');
  if (eocd >= 20 && tailView.getUint32(eocd - 20, true) === ZIP64_LOCATOR_SIGNATURE) fail('ZIP64 bundles are not supported.');
  const count = tailView.getUint16(eocd + 10, true);
  const directorySize = tailView.getUint32(eocd + 12, true);
  const directoryOffset = tailView.getUint32(eocd + 16, true);
  if (count === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) fail('ZIP64 bundles are not supported.');
  if (count === 0 || count > MAX_ENTRIES) fail(`it lists ${count} files; a SOG bundle has at most ${MAX_ENTRIES}.`);
  if (directorySize > MAX_DIRECTORY_BYTES) fail('its zip directory is too large.');
  if (directoryOffset + directorySize > tailStart + eocd) fail('its zip directory lies outside the file.');
  // Spark's zip reader treats a gap before the end record as prepended data and shifts every offset by it.
  if (directoryOffset + directorySize < tailStart + eocd) fail('its zip directory is damaged.');

  const directory = await read(file, directoryOffset, directoryOffset + directorySize);
  const view = new DataView(directory.buffer, directory.byteOffset, directory.byteLength);
  const entries = new Map<string, ZipEntry>();
  // Spark finds meta.json by basename (the last match wins), so each basename must name one entry.
  const basenames = new Set<string>();
  let offset = 0;
  for (let index = 0; index < count; index++) {
    if (offset + 46 > directory.length || view.getUint32(offset, true) !== CENTRAL_SIGNATURE) fail('its zip directory is damaged.');
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    if (offset + 46 + nameLength + extraLength + commentLength > directory.length) fail('its zip directory is damaged.');
    const nameBytes = directory.subarray(offset + 46, offset + 46 + nameLength);
    const name = new TextDecoder().decode(nameBytes);
    // Spark's zip reader decodes names without the UTF-8 flag as CP437; only ASCII reads the same both ways.
    if (!(flags & UTF8_NAME_FLAG) && nameBytes.some((byte) => byte > 0x7f)) fail(`${name} has a non-ASCII name not marked as UTF-8.`);
    // Spark's zip reader renames an entry that carries an Info-ZIP Unicode Path field.
    if (hasExtraField(view, offset + 46 + nameLength, extraLength, UNICODE_PATH_FIELD)) fail(`${name} carries a second (Unicode) file name.`);
    if (flags & 1) fail(`${name} is encrypted.`);
    if (method !== 0 && method !== 8) fail(`${name} uses an unsupported compression method.`);
    if (localHeaderOffset + 30 + compressedSize > directoryOffset) fail(`${name} lies outside the file.`);
    if (entries.has(name)) fail(`it contains ${name} twice.`);
    const basename = name.split(/[\\/]/).pop()!;
    // Folder entries (names ending in a separator) have no basename, and Spark ignores them.
    if (basename && basenames.has(basename)) fail(`it contains more than one file named ${basename}.`);
    basenames.add(basename);
    entries.set(name, { name, method, compressedSize, size, localHeaderOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function dataRange(file: Blob, entry: ZipEntry): Promise<[number, number]> {
  const header = await read(file, entry.localHeaderOffset, entry.localHeaderOffset + 30);
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  if (header.length < 30 || view.getUint32(0, true) !== LOCAL_SIGNATURE) fail(`${entry.name} is damaged.`);
  const start = entry.localHeaderOffset + 30 + view.getUint16(26, true) + view.getUint16(28, true);
  const end = start + entry.compressedSize;
  if (end > file.size) fail(`${entry.name} lies outside the file.`);
  return [start, end];
}

/**
 * Inflates `compressed` a step at a time until `keep` bytes are out. Output past the entry's declared
 * size fails at the step that produced it, so a deflate bomb never expands far.
 */
function inflateBounded(entry: ZipEntry, compressed: Uint8Array, complete: boolean, keep: number): Uint8Array<ArrayBuffer> {
  const kept = new Uint8Array(keep);
  let produced = 0;
  const inflater = new Inflate((chunk) => {
    if (produced + chunk.length > entry.size) fail(`${entry.name} expands beyond its declared size.`);
    kept.set(chunk.subarray(0, keep - produced), produced);
    produced += chunk.length;
  });
  try {
    for (let at = 0; at < compressed.length && produced < keep; at += INFLATE_STEP_BYTES) {
      const next = Math.min(compressed.length, at + INFLATE_STEP_BYTES);
      inflater.push(compressed.subarray(at, next), complete && next === compressed.length);
    }
  } catch (error) {
    if (error instanceof SogBundleError) throw error;
    fail(`${entry.name} is damaged.`);
  }
  return kept.subarray(0, Math.min(produced, keep));
}

async function readWholeEntry(file: Blob, entry: ZipEntry, limit: number): Promise<Uint8Array<ArrayBuffer>> {
  // A stored entry's bytes are its compressed size, so both sizes are bounded.
  const bytes = Math.max(entry.size, entry.compressedSize);
  if (bytes > limit) fail(`${entry.name} is too large (${bytes} bytes).`);
  const [start, end] = await dataRange(file, entry);
  const data = await read(file, start, end);
  return entry.method === 0 ? data : inflateBounded(entry, data, true, entry.size);
}

async function readEntryPrefix(file: Blob, entry: ZipEntry, length: number): Promise<Uint8Array<ArrayBuffer>> {
  const [start, end] = await dataRange(file, entry);
  if (entry.method === 0) return read(file, start, Math.min(end, start + length));
  const inputEnd = Math.min(end, start + TEXTURE_PREFIX_INPUT_BYTES);
  return inflateBounded(entry, await read(file, start, inputEnd), inputEnd === end, length);
}

function parseCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > MAX_SPLATS) {
    return fail(`its splat count (${String(value)}) is not between 1 and ${MAX_SPLATS.toLocaleString()}.`);
  }
  return value;
}

function section(meta: Record<string, unknown>, name: string): Record<string, unknown> {
  const value = meta[name];
  return isRecord(value) ? value : fail(`meta.json has no ${name} section.`);
}

function files(sectionValue: Record<string, unknown>, name: string): string[] {
  return isFileList(sectionValue.files) ? sectionValue.files : fail(`meta.json lists no ${name} textures.`);
}

function parseV2(meta: Record<string, unknown>): ParsedMeta {
  const count = parseCount(meta.count);
  const means = section(meta, 'means');
  const scales = section(meta, 'scales');
  const quats = section(meta, 'quats');
  const sh0 = section(meta, 'sh0');
  if (!isFiniteArray(means.mins, 3) || !isFiniteArray(means.maxs, 3)
    || !inRange(means.mins, -30, 30) || !inRange(means.maxs, -30, 30)) fail('its position bounds are invalid.');
  if (!isFiniteArray(scales.codebook) || !inRange(scales.codebook, -30, 20)) fail('its scale codebook holds invalid or extreme values.');
  if (!isFiniteArray(sh0.codebook)) fail('its colour codebook holds invalid values.');
  const textures = [...files(means, 'means'), ...files(scales, 'scales'), ...files(quats, 'quats'), ...files(sh0, 'sh0')];
  let shBands = 0;
  const shFiles: string[] = [];
  if (meta.shN !== undefined) {
    const shN = section(meta, 'shN');
    if (typeof shN.bands !== 'number' || !Number.isInteger(shN.bands) || shN.bands < 1 || shN.bands > 3) fail('its spherical-harmonic band count is invalid.');
    if (!isFiniteArray(shN.codebook)) fail('its spherical-harmonic codebook holds invalid values.');
    shBands = shN.bands as number;
    shFiles.push(...files(shN, 'shN'));
  }
  return { version: 2, count, shBands, textures, files: [...textures, ...shFiles] };
}

function parseV1(meta: Record<string, unknown>): ParsedMeta {
  const means = section(meta, 'means');
  const scales = section(meta, 'scales');
  const quats = section(meta, 'quats');
  const sh0 = section(meta, 'sh0');
  const count = parseCount(Array.isArray(means.shape) ? means.shape[0] : undefined);
  if (!isFiniteArray(means.mins, 3) || !isFiniteArray(means.maxs, 3)) fail('its position bounds are invalid.');
  if (!isFiniteArray(scales.mins) || !isFiniteArray(scales.maxs)
    || !inRange(scales.mins, -30, 20) || !inRange(scales.maxs, -30, 20)) fail('its scale range holds invalid or extreme values.');
  if (!isFiniteArray(sh0.mins) || !isFiniteArray(sh0.maxs)) fail('its colour range holds invalid values.');
  const textures = [...files(means, 'means'), ...files(scales, 'scales'), ...files(quats, 'quats'), ...files(sh0, 'sh0')];
  const shFiles = meta.shN === undefined ? [] : files(section(meta, 'shN'), 'shN');
  return { version: 1, count, shBands: 0, textures, files: [...textures, ...shFiles] };
}

export async function validateSogBundle(file: Blob, { maxSplats }: { maxSplats?: number } = {}): Promise<SogBundleInfo> {
  const entries = await readDirectory(file);
  const metaEntry = entries.get('meta.json') ?? fail('meta.json is missing.');
  if (metaEntry.size > MAX_META_BYTES) fail(`meta.json is too large (${metaEntry.size} bytes).`);
  let meta: unknown;
  try {
    meta = JSON.parse(new TextDecoder().decode(await readWholeEntry(file, metaEntry, MAX_META_BYTES)));
  } catch (error) {
    if (error instanceof SogBundleError) throw error;
    fail('meta.json is not valid JSON.');
  }
  if (!isRecord(meta)) return fail('meta.json is not a JSON object.');
  const parsed = meta.version === 2 ? parseV2(meta)
    : meta.version === undefined ? parseV1(meta)
    : fail(`SOG version ${String(meta.version)} is not supported.`);
  if (maxSplats !== undefined && parsed.count > maxSplats) {
    fail(`it has ${parsed.count.toLocaleString()} splats; this device supports up to ${maxSplats.toLocaleString()}. Open it on a desktop to view.`);
  }
  for (const name of parsed.files) if (!entries.has(name)) fail(`${name} is missing.`);
  for (const name of new Set(parsed.textures)) {
    const prefix = await readEntryPrefix(file, entries.get(name)!, TEXTURE_PREFIX_BYTES);
    const size = await readImageDimensions(new Blob([prefix]));
    if (!size) fail(`${name} is not a readable WebP image.`);
    else if (size.width * size.height < parsed.count) {
      fail(`${name} holds ${size.width * size.height} splats but the bundle declares ${parsed.count}.`);
    }
  }
  return { version: parsed.version, count: parsed.count, shBands: parsed.shBands };
}
