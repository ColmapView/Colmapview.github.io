import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { createArchiveByteSource, type ArchiveByteSource } from './byteSource';
import { IndexedZipBackend, updateArchiveCrc } from './indexedZip';
import { IndexedTarBackend } from './indexedTar';

beforeAll(() => { vi.stubGlobal('Blob', NodeBlob); vi.stubGlobal('File', NodeFile); });
afterAll(() => vi.unstubAllGlobals());

const signal = () => new AbortController().signal;
const source = (name: string, bytes: Uint8Array) => createArchiveByteSource(new File([Uint8Array.from(bytes)], name), async () => { throw new Error('unexpected remote read'); });
function tarHeader(name: string, size: number, kind = '0') {
  const header = new Uint8Array(512);
  const write = (text: string, offset: number) => header.set(strToU8(text), offset);
  write(name, 0); write('0000644\0', 100); write('0000000\0', 108); write('0000000\0', 116);
  write(`${size.toString(8).padStart(11, '0')}\0`, 124); write('00000000000\0', 136);
  header.fill(32, 148, 156); write(kind, 156); write('ustar\0', 257); write('00', 263);
  write(`${header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, '0')}\0 `, 148);
  return header;
}
function tar(files: Array<{ name: string; body: string; kind?: string }>): Uint8Array {
  const parts = files.flatMap(({ name, body, kind }) => {
    const bytes = strToU8(body);
    return [tarHeader(name, bytes.length, kind), bytes, new Uint8Array((512 - bytes.length % 512) % 512)];
  });
  const result = new Uint8Array(parts.reduce((size, part) => size + part.length, 1024));
  let offset = 0; for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}

it.each(['zip', 'tar'] as const)('preserves case-distinct Unicode photo paths and bytes in %s', async format => {
  const paths = ['images/café.JPG', 'images/café.jpg'];
  const bytes = format === 'zip' ? zipSync(Object.fromEntries(paths.map(path => [path, strToU8(path)])))
    : tar(paths.map(name => ({ name, body: name })));
  const backend = format === 'zip' ? new IndexedZipBackend(source('scene.zip', bytes)) : new IndexedTarBackend(source('scene.tar', bytes));
  expect((await backend.list(signal())).map(entry => entry.path)).toEqual(paths);
  expect((await backend.list(signal())).map(entry => entry.path)).toEqual(paths);
  for (const path of paths) expect(await (await backend.extract(path, signal())).text()).toBe(path);
});

describe('indexed ZIP reader', () => {
  it('rejects duplicate exact paths instead of silently discarding a file', async () => {
    const bytes = zipSync({ 'images/a.jpg': strToU8('first'), 'images/b.jpg': strToU8('second') });
    const from = strToU8('images/b.jpg'), to = strToU8('images/a.jpg');
    for (let offset = 0; offset <= bytes.length - from.length; offset++) {
      if (from.every((value, index) => bytes[offset + index] === value)) bytes.set(to, offset);
    }
    await expect(new IndexedZipBackend(source('duplicate.zip', bytes)).list(signal())).rejects.toThrow(/duplicate/i);
  });
  it.each([0, 6] as const)('extracts exact original bytes at compression level %s, including Unicode and empty files', async level => {
    const bytes = zipSync({ 'images/café.jpg': strToU8('exact original'), 'empty.txt': new Uint8Array() }, { level });
    const reader = new IndexedZipBackend(source('scene.zip', bytes));
    expect((await reader.list(signal())).map(entry => entry.path)).toEqual(['images/café.jpg', 'empty.txt']);
    const file = await reader.extract('images/café.jpg', signal());
    expect(file.type).toBe('image/jpeg');
    expect(await file.text()).toBe('exact original');
    expect((await reader.extract('empty.txt', signal())).size).toBe(0);
  });
  it('indexes without reading image payloads and detects corruption on extraction', async () => {
    const bytes = zipSync({ 'photo.jpg': strToU8('z'.repeat(100000)) }, { level: 0 });
    const reads: Array<[number, number]> = [];
    const base = source('scene.zip', bytes);
    const reader = new IndexedZipBackend({ ...base, read: async (offset, length) => { reads.push([offset, length]); return base.read(offset, length); } });
    await reader.list(signal());
    expect(reads.every(([offset]) => offset > 30)).toBe(true);
    bytes[40] ^= 1;
    const corrupt = new IndexedZipBackend(source('bad.zip', bytes));
    await corrupt.list(signal());
    await expect(corrupt.extract('photo.jpg', signal())).rejects.toThrow('CRC');
  });
  it('rejects truncated indexes and out-of-bounds local headers', async () => {
    const bytes = zipSync({ 'a.txt': strToU8('abc') });
    await expect(new IndexedZipBackend(source('bad.zip', bytes.subarray(0, bytes.length - 1))).list(signal())).rejects.toThrow('central directory');
    const central = bytes.findIndex((_, index) => bytes[index] === 0x50 && bytes[index + 1] === 0x4b && bytes[index + 2] === 1 && bytes[index + 3] === 2);
    new DataView(bytes.buffer).setUint32(central + 42, bytes.length + 100, true);
    await expect(new IndexedZipBackend(source('bad.zip', bytes)).list(signal())).rejects.toThrow('byte range');
  });
  it('extracts a ZIP64 entry beyond 4 GiB without reading the unused container body', async () => {
    const data = strToU8('ZIP64 original'), name = strToU8('photo.jpg');
    const localOffset = 5 * 1024 ** 3, indexOffset = localOffset + 30 + name.length + data.length;
    const local = new Uint8Array(30 + name.length + data.length), lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(26, name.length, true); local.set(name, 30); local.set(data, 30 + name.length);
    const central = new Uint8Array(46 + name.length + 12), cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint32(16, (updateArchiveCrc(0xffffffff, data) ^ 0xffffffff) >>> 0, true);
    cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true); cv.setUint16(28, name.length, true);
    cv.setUint16(30, 12, true); cv.setUint32(42, 0xffffffff, true); central.set(name, 46);
    cv.setUint16(46 + name.length, 1, true); cv.setUint16(48 + name.length, 8, true); cv.setBigUint64(50 + name.length, BigInt(localOffset), true);
    const zip64Offset = indexOffset + central.length, ending = new Uint8Array(56 + 20 + 22), ev = new DataView(ending.buffer);
    ev.setUint32(0, 0x06064b50, true); ev.setBigUint64(4, 44n, true); ev.setBigUint64(24, 1n, true); ev.setBigUint64(32, 1n, true);
    ev.setBigUint64(40, BigInt(central.length), true); ev.setBigUint64(48, BigInt(indexOffset), true);
    ev.setUint32(56, 0x07064b50, true); ev.setBigUint64(64, BigInt(zip64Offset), true); ev.setUint32(72, 1, true);
    ev.setUint32(76, 0x06054b50, true); ev.setUint16(84, 0xffff, true); ev.setUint16(86, 0xffff, true);
    ev.setUint32(88, 0xffffffff, true); ev.setUint32(92, 0xffffffff, true);
    const segments = [[localOffset, local], [indexOffset, central], [zip64Offset, ending]] as const;
    let downloaded = 0;
    const sparse: ArchiveByteSource = { name: 'large.zip', size: zip64Offset + ending.length,
      async read(offset, length) {
        downloaded += length; const result = new Uint8Array(length);
        for (const [start, bytes] of segments) {
          const from = Math.max(offset, start), to = Math.min(offset + length, start + bytes.length);
          if (from < to) result.set(bytes.subarray(from - start, to - start), from - offset);
        }
        return result;
      },
    };
    const reader = new IndexedZipBackend(sparse);
    expect((await reader.list(signal())).map(entry => entry.path)).toEqual(['photo.jpg']);
    expect(await (await reader.extract('photo.jpg', signal())).text()).toBe('ZIP64 original');
    expect(downloaded).toBeLessThan(70000);
  });
  it('bounds inflated data by the declared entry size and refuses oversized entry extraction', async () => {
    const bytes = zipSync({ 'photo.jpg': strToU8('lots of decompressed image bytes') });
    const central = bytes.findIndex((_, index) => bytes[index] === 0x50 && bytes[index + 1] === 0x4b && bytes[index + 2] === 1 && bytes[index + 3] === 2);
    const view = new DataView(bytes.buffer); view.setUint32(central + 24, 1, true);
    const bomb = new IndexedZipBackend(source('bomb.zip', bytes)); await bomb.list(signal());
    await expect(bomb.extract('photo.jpg', signal())).rejects.toThrow('declared uncompressed size');
    view.setUint32(central + 24, 3 * 1024 ** 3, true);
    const oversized = new IndexedZipBackend(source('oversized.zip', bytes)); await oversized.list(signal());
    await expect(oversized.extract('photo.jpg', signal())).rejects.toThrow('2 GiB extraction limit');
  });
});

describe('indexed TAR reader', () => {
  it('rejects duplicate exact paths instead of silently discarding a file', async () => {
    const bytes = tar([{ name: 'images/a.jpg', body: 'first' }, { name: 'images/a.jpg', body: 'second' }]);
    await expect(new IndexedTarBackend(source('duplicate.tar', bytes)).list(signal())).rejects.toThrow(/duplicate/i);
  });
  it('distinguishes GNU timestamps from POSIX filename prefixes', async () => {
    const body = strToU8('original'), gnu = tarHeader('images/photo.jpg', body.length), ustar = tarHeader('photo.png', body.length);
    gnu.set(strToU8('ustar  \0'), 257);
    gnu.set(strToU8('15262253174\0'), 345); gnu.set(strToU8('15262253175\0'), 357);
    ustar.set(strToU8('project/images'), 345);
    for (const header of [gnu, ustar]) {
      header.fill(32, 148, 156);
      header.set(strToU8(`${header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, '0')}\0 `), 148);
    }
    const bytes = new Uint8Array(3072);
    bytes.set(gnu); bytes.set(body, 512); bytes.set(ustar, 1024); bytes.set(body, 1536);
    const reader = new IndexedTarBackend(source('scene.tar', bytes));
    expect((await reader.list(signal())).map(entry => entry.path)).toEqual(['images/photo.jpg', 'project/images/photo.png']);
    expect(await (await reader.extract('images/photo.jpg', signal())).text()).toBe('original');
    expect(await (await reader.extract('project/images/photo.png', signal())).text()).toBe('original');
  });
  it('extracts original bytes, skips directories and never extracts masks as previews', async () => {
    const reader = new IndexedTarBackend(source('scene.tar', tar([
      { name: 'images/', body: '', kind: '5' }, { name: 'images/photo.jpg', body: 'original JPEG' }, { name: 'masks/photo.png', body: 'lossless mask' },
    ])));
    expect((await reader.list(signal())).map(entry => entry.path)).toEqual(['images/photo.jpg', 'masks/photo.png']);
    expect(await (await reader.extract('masks/photo.png', signal())).text()).toBe('lossless mask');
  });
  it('supports GNU long names and PAX paths', async () => {
    const path = 'images/' + 'long/'.repeat(30) + 'photo.jpg';
    const paxPath = path.replace('photo.jpg', 'pax.jpg');
    const value = `path=${paxPath}\n`;
    let length = value.length + 3;
    while (`${length} ${value}`.length !== length) length = `${length} ${value}`.length;
    const reader = new IndexedTarBackend(source('scene.tar', tar([
      { name: '././@LongLink', body: `${path}\0`, kind: 'L' }, { name: 'short', body: 'GNU' },
      { name: 'pax', body: `${length} ${value}`, kind: 'x' }, { name: 'short', body: 'PAX' },
    ])));
    expect((await reader.list(signal())).map(entry => entry.path)).toEqual([path, paxPath]);
    expect(await (await reader.extract(path, signal())).text()).toBe('GNU');
    expect(await (await reader.extract(paxPath, signal())).text()).toBe('PAX');
  });
  it('indexes a sparse source larger than 2 GiB by skipping its payload', async () => {
    const largeSize = 3 * 1024 * 1024 * 1024;
    const header = tarHeader('large-unused.bin', largeSize);
    const secondOffset = 512 + largeSize;
    const small = tar([{ name: 'images/photo.jpg', body: 'image bytes' }]);
    const reads: Array<[number, number]> = [];
    const sparse: ArchiveByteSource = { name: 'large.tar', size: secondOffset + small.length,
      async read(offset, length) {
        reads.push([offset, length]);
        if (offset === 0) return header;
        if (offset >= secondOffset) return small.slice(offset - secondOffset, offset - secondOffset + length);
        throw new Error('Large unused payload must never be read.');
      },
    };
    const reader = new IndexedTarBackend(sparse);
    expect((await reader.list(signal())).length).toBe(2);
    await expect(reader.extract('large-unused.bin', signal())).rejects.toThrow('2 GiB extraction limit');
    expect(await (await reader.extract('images/photo.jpg', signal())).text()).toBe('image bytes');
    expect(reads.every(([, length]) => length <= 512)).toBe(true);
  });
  it('rejects truncated archives and bad header checksums', async () => {
    const bytes = tar([{ name: 'photo.jpg', body: 'abc' }]);
    await expect(new IndexedTarBackend(source('short.tar', bytes.subarray(0, 514))).list(signal())).rejects.toThrow('byte range');
    bytes[0] ^= 1;
    await expect(new IndexedTarBackend(source('bad.tar', bytes)).list(signal())).rejects.toThrow('checksum');
  });
});
