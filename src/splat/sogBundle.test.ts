import { Blob as NodeBlob } from 'node:buffer';
import { crc32 } from 'node:zlib';
import { Zip, ZipDeflate, zipSync, type Zippable } from 'fflate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { webpHeader } from '../test/imageHeaders';
import { SogBundleError, validateSogBundle } from './sogBundle';

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
    // Spark only ever reads a root meta.json here; folder layouts stay unsupported.
    ['a bundle whose only meta.json sits in a folder', () => buildSog({
      omit: ['meta.json'],
      entries: { 'x/meta.json': [new TextEncoder().encode(JSON.stringify(V2_META)), { level: 0 }] },
    }), 'meta.json is missing.'],
  ])('rejects %s', async (_case, build, expected) => {
    expect(await reason(validateSogBundle(build()))).toContain(expected);
  });
});
