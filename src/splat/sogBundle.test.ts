import { Blob as NodeBlob } from 'node:buffer';
import { crc32 } from 'node:zlib';
import { unzipSync, Zip, ZipDeflate, zipSync, type Zippable } from 'fflate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jpegHeader, pngHeader, webpHeader } from '../test/imageHeaders';
import { SogBundleError, validateSogBundle as validateSogBundleWithBundle } from './sogBundle';

/** Most cases only care about the reported info; the canonical bundle has its own tests below. */
const validateSogBundle = (...args: Parameters<typeof validateSogBundleWithBundle>) =>
  validateSogBundleWithBundle(...args).then(({ info }) => info);

const TEXTURES = ['means_l.webp', 'means_u.webp', 'scales.webp', 'quats.webp', 'sh0.webp'];
const codebook = (start: number, step: number) => Array.from({ length: 256 }, (_, index) => start + index * step);
const V2_META = {
  version: 2, count: 100,
  means: { mins: [-1.1, -0.5, -1.1], maxs: [1.1, 0.4, 1.1], files: ['means_l.webp', 'means_u.webp'] },
  scales: { codebook: codebook(-8, 0.02), files: ['scales.webp'] },
  quats: { files: ['quats.webp'] },
  sh0: { codebook: codebook(-2, 0.016), files: ['sh0.webp'] },
};
const V1_META = {
  means: { shape: [100, 3], dtype: 'float32', mins: [-2, -1, -2], maxs: [2, 1, 2], files: ['means_l.webp', 'means_u.webp'] },
  scales: { shape: [100, 3], dtype: 'float32', mins: [-8, -8, -8], maxs: [-2, -2, -2], files: ['scales.webp'] },
  quats: { shape: [100, 4], dtype: 'uint8', encoding: 'quaternion_packed', files: ['quats.webp'] },
  sh0: { shape: [100, 1, 4], dtype: 'float32', mins: [-2, -2, -2, -4], maxs: [2, 2, 2, 4], files: ['sh0.webp'] },
};

interface SogBuildOptions {
  meta?: object | string;
  size?: [number, number];
  omit?: string[];
  deflate?: boolean;
  /** Added after the standard entries (replacing any with the same name). */
  entries?: Zippable;
}

function buildSogBytes({ meta = V2_META, size = [10, 10], omit = [], deflate = false, entries = {} }: SogBuildOptions = {}): Uint8Array {
  const level = deflate ? 6 : 0;
  const files: Zippable = {};
  for (const name of TEXTURES) {
    if (!omit.includes(name)) files[name] = [webpHeader('VP8L', size[0], size[1]), { level }];
  }
  if (!omit.includes('meta.json')) {
    const text = typeof meta === 'string' ? meta : JSON.stringify(meta);
    files['meta.json'] = [new TextEncoder().encode(text), { level }];
  }
  return zipSync({ ...files, ...entries });
}
const asBlob = (...parts: Uint8Array[]) => new NodeBlob(parts) as unknown as Blob;
const buildSog = (options: SogBuildOptions = {}) => asBlob(buildSogBytes(options));
const reason = (promise: Promise<unknown>) => promise.then(() => 'accepted', (error: unknown) =>
  error instanceof SogBundleError ? error.message : `unexpected ${String(error)}`);

interface ZipLayout { view: DataView; eocd: number; records: Map<string, number> }

/** Builds a bundle (no zip comment) and rewrites it in place; `records` maps entry names to central-directory records. */
function patchedSog(options: SogBuildOptions, patch: (layout: ZipLayout) => void): Blob {
  const bytes = buildSogBytes(options);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = bytes.length - 22;
  const records = new Map<string, number>();
  for (let at = view.getUint32(eocd + 16, true), left = view.getUint16(eocd + 10, true); left > 0; left--) {
    const nameLength = view.getUint16(at + 28, true);
    records.set(new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength)), at);
    at += 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
  }
  patch({ view, eocd, records });
  return asBlob(bytes);
}
const record = ({ records }: ZipLayout, name: string) => records.get(name)!;
const dataStart = ({ view }: ZipLayout, recordAt: number) => {
  const local = view.getUint32(recordAt + 42, true);
  return local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
};
const withTrailingBytes = (bytes: Uint8Array, length: number) => {
  const padded = new Uint8Array(bytes.length + length);
  padded.set(bytes);
  return padded;
};
/** Info-ZIP Unicode Path extra field: version 1, CRC-32 of the header name, then the replacement name. */
const unicodePathField = (headerName: string, unicodeName: string) => {
  const crc = crc32(headerName);
  return new Uint8Array([1, crc & 255, (crc >>> 8) & 255, (crc >>> 16) & 255, crc >>> 24, ...new TextEncoder().encode(unicodeName)]);
};

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let at = 0;
  for (const part of parts) { out.set(part, at); at += part.length; }
  return out;
};
const viewOf = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
/** Splits a single-directory zip (no comment) into its local entries and its central directory. */
function zipSections(bytes: Uint8Array) {
  const view = viewOf(bytes);
  const eocd = bytes.length - 22;
  const offset = view.getUint32(eocd + 16, true);
  return { locals: bytes.slice(0, offset), directory: bytes.slice(offset, offset + view.getUint32(eocd + 12, true)), count: view.getUint16(eocd + 10, true) };
}
/** Visits each central-directory record: its offset, name, and extra-field and comment lengths. */
function directoryRecords(directory: Uint8Array) {
  const view = viewOf(directory);
  const records: { at: number; name: string; flags: number; extraLength: number; commentLength: number; localHeaderOffset: number }[] = [];
  for (let at = 0; at + 46 <= directory.length && view.getUint32(at, true) === 0x02014b50;) {
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    records.push({ at, name: new TextDecoder().decode(directory.subarray(at + 46, at + 46 + nameLength)), flags: view.getUint16(at + 8, true), extraLength, commentLength, localHeaderOffset: view.getUint32(at + 42, true) });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return records;
}
function shiftLocalOffsets(directory: Uint8Array, delta: number): Uint8Array {
  const out = new Uint8Array(directory);
  const view = viewOf(out);
  for (const { at } of directoryRecords(out)) view.setUint32(at + 42, view.getUint32(at + 42, true) + delta, true);
  return out;
}
/** Appends `extra` (a whole extra-field record) to the first central-directory record. */
function withExtraField(directory: Uint8Array, extra: Uint8Array): Uint8Array {
  const view = viewOf(directory);
  const split = 46 + view.getUint16(28, true) + view.getUint16(30, true);
  const out = concat(directory.subarray(0, split), extra, directory.subarray(split));
  viewOf(out).setUint16(30, view.getUint16(30, true) + extra.length, true);
  return out;
}
const extraField = (id: number, body: number[]) => new Uint8Array([id & 255, id >>> 8, body.length & 255, body.length >>> 8, ...body]);
interface EndRecord { count: number; size: number; offset: number; comment?: number; disk?: number; directoryDisk?: number; diskCount?: number }
function endRecord({ count, size, offset, comment = 0, disk = 0, directoryDisk = 0, diskCount = count }: EndRecord): Uint8Array {
  const bytes = new Uint8Array(22);
  const view = viewOf(bytes);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(4, disk, true);
  view.setUint16(6, directoryDisk, true);
  view.setUint16(8, diskCount, true);
  view.setUint16(10, count, true);
  view.setUint32(12, size, true);
  view.setUint32(16, offset, true);
  view.setUint16(20, comment, true);
  return bytes;
}
/**
 * Two archives in one file, as in the final review's parity harness:
 * [benign entries][hidden entries][hidden directory][hidden end record whose comment is
 * the benign directory + benign end record]. The validator reads the benign (last) end
 * record; Spark's zip reader skips an end record it cannot parse and falls back to the hidden one.
 */
function smuggledSog(benignTweak: Partial<EndRecord> = {}, benignDirectory = (directory: Uint8Array) => directory): Uint8Array {
  const benign = zipSections(buildSogBytes({ meta: { ...V2_META, count: 100 } }));
  const hidden = zipSections(buildSogBytes({ meta: { ...V2_META, count: 50 } }));
  const hiddenDirectory = shiftLocalOffsets(hidden.directory, benign.locals.length);
  const hiddenDirectoryOffset = benign.locals.length + hidden.locals.length;
  const directory = benignDirectory(benign.directory);
  return concat(
    benign.locals, hidden.locals, hiddenDirectory,
    endRecord({ count: hidden.count, size: hiddenDirectory.length, offset: hiddenDirectoryOffset, comment: directory.length + 22 }),
    directory,
    endRecord({ count: benign.count, size: directory.length, offset: hiddenDirectoryOffset + hiddenDirectory.length + 22, ...benignTweak }),
  );
}
const SMUGGLED_VARIANTS: [string, () => Uint8Array][] = [
  ['a pristine second end record', () => smuggledSog()],
  ['an end record on disk 1', () => smuggledSog({ disk: 1 })],
  ['an end record whose directory is on disk 1', () => smuggledSog({ directoryDisk: 1 })],
  ['an end record whose per-disk count differs from its total', () => smuggledSog({ diskCount: 99 })],
  ['a malformed extended-timestamp (0x5455) extra field', () => smuggledSog({}, (directory) => withExtraField(directory, extraField(0x5455, [7, 1, 2])))],
  ['a malformed NTFS (0x000a) extra field', () => smuggledSog({}, (directory) => withExtraField(directory, extraField(0x000a, [0, 0, 0, 0, 9, 0, 1, 0, 0])))],
  ['a malformed AES (0x9901) extra field', () => smuggledSog({}, (directory) => withExtraField(directory, extraField(0x9901, [1, 0, 0x41, 0x45, 9, 8, 0])))],
];

/** A bundle as a level-0 deflate producer writes it: method 8, 65,535-byte stored blocks, sizes in data descriptors. */
function levelZeroDeflatedSog(): Blob {
  const chunks: Uint8Array[] = [];
  const zip = new Zip((error, chunk) => {
    if (error) throw error;
    chunks.push(chunk);
  });
  const add = (name: string, data: Uint8Array) => {
    const entry = new ZipDeflate(name, { level: 0 });
    zip.add(entry);
    entry.push(data, true);
  };
  for (const name of TEXTURES) add(name, withTrailingBytes(webpHeader('VP8L', 10, 10), 70_000));
  add('meta.json', new TextEncoder().encode(JSON.stringify(V2_META)));
  zip.end();
  return asBlob(...chunks);
}

describe('SOG bundle validation', () => {
  // jsdom's Blob has no arrayBuffer(); the validator wraps each texture prefix in the global Blob.
  beforeEach(() => vi.stubGlobal('Blob', NodeBlob));
  afterEach(() => vi.unstubAllGlobals());

  it('accepts a well-formed version 2 bundle and reports its count', async () => {
    await expect(validateSogBundle(buildSog())).resolves.toEqual({ version: 2, count: 100, shBands: 0 });
  });

  it('reads deflated entries (other producers compress) and version 1 metadata', async () => {
    await expect(validateSogBundle(buildSog({ deflate: true }))).resolves.toMatchObject({ count: 100 });
    expect(await reason(validateSogBundle(buildSog({ deflate: true, size: [5, 5] })))).toContain('holds 25 splats');
    await expect(validateSogBundle(buildSog({ meta: V1_META }))).resolves.toEqual({ version: 1, count: 100, shBands: 0 });
  });

  it.each([
    ['a file that is not a zip', () => new NodeBlob([new Uint8Array(200)]) as unknown as Blob, 'not a valid SOG bundle'],
    ['a missing meta.json', () => buildSog({ omit: ['meta.json'] }), 'meta.json is missing'],
    ['a missing texture', () => buildSog({ omit: ['quats.webp'] }), 'quats.webp is missing'],
    ['invalid JSON', () => buildSog({ meta: '{"version":2,' }), 'meta.json is not valid'],
    ['an unsupported version', () => buildSog({ meta: { ...V2_META, version: 3 } }), 'version 3'],
    ['a zero count', () => buildSog({ meta: { ...V2_META, count: 0 } }), 'splat count'],
    ['a non-finite position bound', () => buildSog({ meta: { ...V2_META, means: { ...V2_META.means, mins: [0, null, 0] } } }), 'position bounds'],
    ['garbage scales', () => buildSog({ meta: { ...V2_META, scales: { ...V2_META.scales, codebook: [...codebook(-8, 0.02).slice(1), 400] } } }), 'scale'],
    ['textures smaller than the count', () => buildSog({ size: [5, 5] }), 'holds 25 splats'],
  ])('rejects %s', async (_case, build, expected) => {
    expect(await reason(validateSogBundle(build()))).toContain(expected);
  });

  const texturesAs = (header: Uint8Array): Zippable =>
    Object.fromEntries(TEXTURES.map((name) => [name, [header, { level: 0 }]]));

  it.each([['PNG', pngHeader(10, 10)], ['JPEG', jpegHeader(10, 10)]])(
    'rejects %s textures, which Spark cannot decode as SOG',
    async (_kind, header) => {
      expect(await reason(validateSogBundle(buildSog({ entries: texturesAs(header) })))).toBe('means_l.webp is not a readable WebP image.');
      expect(await reason(validateSogBundle(buildSog({ entries: { 'quats.webp': [header, { level: 0 }] } })))).toBe('quats.webp is not a readable WebP image.');
    },
  );

  it.each(['VP8', 'VP8L', 'VP8X'] as const)('accepts %s WebP textures', async (kind) => {
    await expect(validateSogBundle(buildSog({ entries: texturesAs(webpHeader(kind, 10, 10)) })))
      .resolves.toEqual({ version: 2, count: 100, shBands: 0 });
  });

  it('rejects an oversized meta.json without parsing it', async () => {
    const meta = { ...V2_META, padding: 'x'.repeat(1024 * 1024) };
    expect(await reason(validateSogBundle(buildSog({ meta })))).toContain('meta.json is too large');
  });

  it('stops a bundle with more splats than this device supports', async () => {
    expect(await reason(validateSogBundle(buildSog(), { maxSplats: 50 }))).toContain('100 splats');
    await expect(validateSogBundle(buildSog(), { maxSplats: 100 })).resolves.toMatchObject({ count: 100 });
  });

  it('reads deflated textures whose first block is a full 65,535-byte stored block', async () => {
    await expect(validateSogBundle(levelZeroDeflatedSog())).resolves.toEqual({ version: 2, count: 100, shBands: 0 });
  });

  const shNMeta = (bands: number) => ({ ...V2_META, shN: { bands, codebook: codebook(-1, 0.008), files: ['shN_centroids.webp', 'shN_labels.webp'] } });
  const shNEntries: Zippable = {
    'shN_centroids.webp': [webpHeader('VP8L', 64, 64), { level: 0 }],
    'shN_labels.webp': [webpHeader('VP8L', 10, 10), { level: 0 }],
  };
  it('reports the spherical-harmonic bands and keeps them within 1–3', async () => {
    await expect(validateSogBundle(buildSog({ meta: shNMeta(3), entries: shNEntries }))).resolves.toEqual({ version: 2, count: 100, shBands: 3 });
    expect(await reason(validateSogBundle(buildSog({ meta: shNMeta(0), entries: shNEntries })))).toContain('band count');
    expect(await reason(validateSogBundle(buildSog({ meta: shNMeta(4), entries: shNEntries })))).toContain('band count');
  });

  const folder: [Uint8Array, { level: 0 }] = [new Uint8Array(0), { level: 0 }];
  it('ignores folder entries when checking for repeated file names', async () => {
    await expect(validateSogBundle(buildSog({ entries: { 'a/': folder, 'b/': folder } }))).resolves.toEqual({ version: 2, count: 100, shBands: 0 });
  });

  it('reports a zipped SOG folder (unbundled layout) as missing its root meta.json', async () => {
    const entries: Zippable = { 'scene/': folder, '__MACOSX/': folder, '__MACOSX/scene/': folder, '__MACOSX/scene/._meta.json': folder };
    entries['scene/meta.json'] = [new TextEncoder().encode(JSON.stringify(V2_META)), { level: 0 }];
    for (const name of TEXTURES) entries[`scene/${name}`] = [webpHeader('VP8L', 10, 10), { level: 0 }];
    expect(await reason(validateSogBundle(buildSog({ omit: [...TEXTURES, 'meta.json'], entries })))).toBe('meta.json is missing.');
  });

  it('refuses an oversized zip directory before reading it', async () => {
    const bundle = patchedSog({ entries: { 'padding.bin': [new Uint8Array(1536 * 1024), { level: 0 }] } }, ({ view, eocd }) => {
      view.setUint32(eocd + 12, eocd, true); // Directory size: everything before the end record...
      view.setUint32(eocd + 16, 0, true); // ...starting at the first byte, which satisfies the end-record checks.
    });
    const reads: number[] = [];
    const recorded = {
      size: bundle.size,
      slice: (start = 0, end = bundle.size) => {
        reads.push(end - start);
        return bundle.slice(start, end);
      },
    } as unknown as Blob;
    expect(await reason(validateSogBundle(recorded))).toBe('its zip directory is too large.');
    expect(Math.max(...reads)).toBeLessThan(1024 * 1024);
  });

  const bombTexture = withTrailingBytes(webpHeader('VP8L', 10, 10), 1024 * 1024);
  it.each([
    ['a directory record whose name runs past the directory', () => patchedSog({}, (zip) => {
      const at = record(zip, 'meta.json');
      zip.view.setUint16(at + 28, zip.view.getUint16(at + 28, true) + 4, true);
    }), 'zip directory is damaged'],
    ['a gap between the zip directory and its end record', () => {
      const bytes = buildSogBytes();
      return asBlob(bytes.subarray(0, bytes.length - 22), new Uint8Array(16), bytes.subarray(bytes.length - 22));
    }, 'zip directory is damaged'],
    ['an end-record comment that runs past the file', () => patchedSog({}, ({ view, eocd }) => view.setUint16(eocd + 20, 5, true)),
      'zip directory is damaged'],
    ['a stored meta.json longer than its declared size', () => {
      const text = JSON.stringify(V2_META);
      return patchedSog({ meta: text + ' '.repeat(1024 * 1024) }, (zip) => zip.view.setUint32(record(zip, 'meta.json') + 24, text.length, true));
    }, 'meta.json is too large'],
    ['a deflated meta.json that expands beyond its declared size', () => patchedSog({ deflate: true }, (zip) =>
      zip.view.setUint32(record(zip, 'meta.json') + 24, 10, true)), 'meta.json expands beyond its declared size'],
    ['a deflated texture that expands beyond its declared size', () => patchedSog(
      { entries: { 'quats.webp': [bombTexture, { level: 9 }] } },
      (zip) => zip.view.setUint32(record(zip, 'quats.webp') + 24, 64, true),
    ), 'quats.webp expands beyond its declared size'],
    ['a corrupt deflate stream', () => patchedSog({ deflate: true }, (zip) =>
      zip.view.setUint8(dataStart(zip, record(zip, 'quats.webp')), 0xff)), 'quats.webp is damaged'],
    ['an entry that a Unicode path field renames to a texture', () => buildSog({ entries: {
      'spare.webp': [webpHeader('VP8L', 1, 1), { level: 0, extra: { 0x7075: unicodePathField('spare.webp', 'quats.webp') } }],
    } }), 'spare.webp carries a second (Unicode) file name'],
    ['a non-ASCII name without the UTF-8 flag', () => patchedSog({
      meta: { ...V2_META, quats: { files: ['quats-é.webp'] } },
      omit: ['quats.webp'],
      entries: { 'quats-é.webp': [webpHeader('VP8L', 10, 10), { level: 0 }] },
    }, (zip) => {
      const at = record(zip, 'quats-é.webp');
      zip.view.setUint16(at + 8, zip.view.getUint16(at + 8, true) & ~0x800, true);
    }), 'not marked as UTF-8'],
    ['a second meta.json in a folder', () => buildSog({ entries: {
      'x/meta.json': [new TextEncoder().encode(JSON.stringify(V2_META)), { level: 0 }],
    } }), 'it contains more than one file named meta.json.'],
    ['a second copy of a texture in a folder', () => buildSog({ entries: {
      'extra/means_l.webp': [webpHeader('VP8L', 1, 1), { level: 0 }],
    } }), 'it contains more than one file named means_l.webp.'],
    ['a texture name repeated behind a backslash folder', () => buildSog({ entries: {
      'a\\quats.webp': [webpHeader('VP8L', 1, 1), { level: 0 }],
    } }), 'it contains more than one file named quats.webp.'],
    // Spark would read x/meta.json, but only a root meta.json is checked; folder layouts stay unsupported.
    ['a bundle whose only meta.json sits in a folder', () => buildSog({
      omit: ['meta.json'],
      entries: { 'x/meta.json': [new TextEncoder().encode(JSON.stringify(V2_META)), { level: 0 }] },
    }), 'meta.json is missing.'],
  ])('rejects %s', async (_case, build, expected) => {
    expect(await reason(validateSogBundle(build()))).toContain(expected);
  });

  describe('the canonical bundle handed to Spark', () => {
    const canonicalBytes = async (bundle: Blob) => new Uint8Array(await bundle.arrayBuffer());
    const endOf = (bytes: Uint8Array) => {
      const view = viewOf(bytes);
      const at = bytes.length - 22;
      return {
        signature: view.getUint32(at, true), disk: view.getUint16(at + 4, true), directoryDisk: view.getUint16(at + 6, true),
        diskCount: view.getUint16(at + 8, true), count: view.getUint16(at + 10, true), size: view.getUint32(at + 12, true),
        offset: view.getUint32(at + 16, true), comment: view.getUint16(at + 20, true), at,
      };
    };
    const BENIGN_NAMES = [...TEXTURES, 'meta.json'].sort();

    it.each(SMUGGLED_VARIANTS)('lists only the validated archive when the file carries %s', async (_case, build) => {
      const original = build();
      const { info, bundle } = await validateSogBundleWithBundle(asBlob(original));
      expect(info.count).toBe(100);

      const canonical = await canonicalBytes(bundle);
      const end = endOf(canonical);
      // One end record, at the very end: disk 0, matching counts, no comment, directly after the rebuilt directory.
      expect(end).toMatchObject({ signature: 0x06054b50, disk: 0, directoryDisk: 0, diskCount: 6, count: 6, comment: 0 });
      expect(end.offset + end.size).toBe(end.at);
      const records = directoryRecords(canonical.subarray(end.offset, end.at));
      expect(records.map((record) => record.name).sort()).toEqual(BENIGN_NAMES);
      expect(records.every((record) => record.extraLength === 0 && record.commentLength === 0)).toBe(true);
      // Everything before the directory is the original file, byte for byte.
      expect(canonical.subarray(0, end.offset)).toEqual(original.subarray(0, end.offset));
      // Any zip reader now finds the benign archive, and so does the validator.
      expect(JSON.parse(new TextDecoder().decode(unzipSync(canonical)['meta.json'])).count).toBe(100);
      await expect(validateSogBundle(asBlob(canonical))).resolves.toEqual({ version: 2, count: 100, shBands: 0 });
    });

    it('rebuilds a plain directory: no extras or comments, UTF-8 marked only on non-ASCII names', async () => {
      const bundle = patchedSog({
        entries: {
          'notes-é.txt': [new Uint8Array([1, 2, 3]), { level: 0, comment: 'hello', extra: { 0xcafe: new Uint8Array([1, 2, 3, 4]) } }],
        },
      }, (zip) => {
        // Producers such as splat-transform mark every name UTF-8 and use data descriptors (flags 0x808).
        const at = record(zip, 'meta.json');
        zip.view.setUint16(at + 8, zip.view.getUint16(at + 8, true) | 0x808, true);
      });
      const canonical = await canonicalBytes((await validateSogBundleWithBundle(bundle)).bundle);
      const end = endOf(canonical);
      const records = new Map(directoryRecords(canonical.subarray(end.offset, end.at)).map((record) => [record.name, record]));
      expect(records.get('meta.json')).toMatchObject({ flags: 0, extraLength: 0, commentLength: 0 });
      expect(records.get('notes-é.txt')).toMatchObject({ flags: 0x800, extraLength: 0, commentLength: 0 });
      expect(unzipSync(canonical)['notes-é.txt']).toEqual(new Uint8Array([1, 2, 3]));
    });

    it('refuses a texture whose local header points its data into the zip directory', async () => {
      // The last entry's directory record carries a WebP header as its comment, and the entry's
      // local header is stretched to point at it: the validator would read a WebP from the original
      // directory, while Spark would read the rebuilt directory at the same offset.
      const bundle = patchedSog({
        omit: ['sh0.webp'],
        entries: { 'sh0.webp': [webpHeader('VP8L', 10, 10), { level: 0, comment: String.fromCharCode(...webpHeader('VP8L', 10, 10)) }] },
      }, (zip) => {
        const at = record(zip, 'sh0.webp');
        const local = zip.view.getUint32(at + 42, true);
        const commentAt = at + 46 + zip.view.getUint16(at + 28, true) + zip.view.getUint16(at + 30, true);
        zip.view.setUint16(local + 28, commentAt - (local + 30 + zip.view.getUint16(local + 26, true)), true);
      });
      expect(await reason(validateSogBundle(bundle))).toBe('sh0.webp lies outside the file.');
    });

    it('refuses a UTF-8 name that is not valid UTF-8', async () => {
      const bundle = patchedSog({ entries: { 'notes-é.txt': [new Uint8Array(1), { level: 0 }] } }, (zip) => {
        const at = record(zip, 'notes-é.txt');
        zip.view.setUint8(at + 46 + 'notes-'.length + 1, 0x28); // The second byte of "é" (C3 A9) becomes "(".
      });
      expect(await reason(validateSogBundle(bundle))).toBe('its zip directory holds a file name that is not valid UTF-8.');
    });

    it.each([
      ['before', (meta: Zippable, lookalike: Zippable) => ({ ...lookalike, ...meta })],
      ['after', (meta: Zippable, lookalike: Zippable) => ({ ...meta, ...lookalike })],
    ])('refuses a second name ending in meta.json %s the real one (Spark reads the first such entry)', async (_order, arrange) => {
      const metaEntry = (count: number): Zippable => ({ [count === 100 ? 'meta.json' : 'xmeta.json']: [new TextEncoder().encode(JSON.stringify({ ...V2_META, count })), { level: 0 }] });
      const bundle = buildSog({ omit: ['meta.json'], entries: arrange(metaEntry(100), metaEntry(50)) });
      expect(await reason(validateSogBundle(bundle))).toBe('xmeta.json could be mistaken for meta.json.');
    });

    it('reads a UTF-8 byte-order mark as part of the name, as Spark does', async () => {
      const bundle = buildSog({ omit: ['meta.json'], entries: { '﻿meta.json': [new TextEncoder().encode(JSON.stringify(V2_META)), { level: 0 }] } });
      expect(await reason(validateSogBundle(bundle))).toBe('meta.json is missing.');
    });

    it('refuses a rebuilt directory whose tail would read as a ZIP64 locator', async () => {
      // Rebuilt without its comment, a record with a 16-byte name ends 20 bytes after its local-header
      // offset, which is where readers look for a ZIP64 locator before the end record; this offset
      // spells the locator's signature ("PK\x06\x07"). The original record's comment hides that.
      const localHeaderOffset = 0x07064b50;
      const name = 'sixteen-chars.go';
      const comment = 'note';
      const directory = new Uint8Array(46 + name.length + comment.length);
      const view = viewOf(directory);
      view.setUint32(0, 0x02014b50, true);
      view.setUint16(28, name.length, true);
      view.setUint16(32, comment.length, true);
      view.setUint32(42, localHeaderOffset, true);
      directory.set(new TextEncoder().encode(name + comment), 46);
      const directoryOffset = localHeaderOffset + 64;
      const tail = concat(directory, endRecord({ count: 1, size: directory.length, offset: directoryOffset }));
      // A sparse ~118 MB file: zeros up to the directory, which is all the validator reads before rebuilding.
      const size = directoryOffset + tail.length;
      const sparse = {
        size,
        slice: (start = 0, end = size) => {
          const bytes = new Uint8Array(Math.max(0, end - start));
          const from = Math.max(start, directoryOffset);
          if (from < end) bytes.set(tail.subarray(from - directoryOffset, end - directoryOffset), from - start);
          return asBlob(bytes);
        },
      } as unknown as Blob;
      expect(await reason(validateSogBundle(sparse))).toBe('ZIP64 bundles are not supported.');
    });
  });
});
