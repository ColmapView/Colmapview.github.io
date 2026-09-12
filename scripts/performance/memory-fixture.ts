import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { generateFixture } from './generate';
import { writeCamerasBinary } from '../../src/parsers/colmapBinaryWriters';

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type: string, bytes: Buffer): Buffer {
  const header = Buffer.alloc(4); header.writeUInt32BE(bytes.length);
  const content = Buffer.concat([Buffer.from(type), bytes]);
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc32(content));
  return Buffer.concat([header, content, checksum]);
}

/** Deterministic, small encoded image; RGBA decoded dimensions are the stress input. */
export function generateMemoryFixture(imageCount = 1100, imagePattern: 'gradient' | 'noise' = 'gradient') {
  if (!Number.isInteger(imageCount) || imageCount <= 1024 || imageCount > 4096) throw new Error('Use 1025–4096 images to exceed the 64 MiB decoded budget');
  const metadata = generateFixture('memory', 1000, imageCount, 2);
  const root = resolve('.tmp/performance/fixtures/memory');
  const imageRoot = resolve(root, 'images');
  mkdirSync(imageRoot, { recursive: true });
  const width = 128;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(width, 4); ihdr[8] = 8; ihdr[9] = 6;
  const scanlines = Buffer.alloc(width * (1 + width * 4));
  let randomState = 0x713ac59d;
  const randomByte = () => { randomState ^= randomState << 13; randomState ^= randomState >>> 17; randomState ^= randomState << 5; return randomState & 255; };
  for (let y = 0; y < width; y++) for (let x = 0; x < width; x++) {
    const offset = y * (1 + width * 4) + 1 + x * 4;
    scanlines.set(imagePattern === 'noise' ? [randomByte(), randomByte(), randomByte(), 255]
      : [(x * 2) % 256, (y * 2) % 256, ((x ^ y) * 2) % 256, 255], offset);
  }
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(scanlines)), chunk('IEND', Buffer.alloc(0))]);
  for (let index = 1; index <= imageCount; index++) writeFileSync(resolve(imageRoot, `image-${String(index).padStart(5, '0')}.png`), png);
  writeFileSync(resolve(root, 'cameras.bin'), new Uint8Array(writeCamerasBinary(new Map([[7, { cameraId: 7, modelId: 1, width, height: width, params: [100, 100, 64, 64] }]]))));
  writeFileSync(resolve(root, 'manifest.json'), JSON.stringify({ version: 1, name: 'Memory retention fixture', baseUrl: 'http://127.0.0.1:4173/fixtures/memory/',
    files: { cameras: 'cameras.bin', images: 'images.bin', points3D: 'points3D.bin' }, imagesPath: 'images/' }));
  const fingerprint = createHash('sha256');
  for (const name of ['cameras.bin', 'images.bin', 'points3D.bin']) fingerprint.update(readFileSync(resolve(root, name)));
  fingerprint.update(png).update(String(imageCount));
  const result = { ...metadata, fingerprint: fingerprint.digest('hex'), imagePattern, sourceImageSha256: createHash('sha256').update(png).digest('hex'), imageWidth: width, imageHeight: width,
    encodedBytesPerImage: png.length, uniqueDecodedRgbaBytes: imageCount * width * width * 4,
    definition: 'Distinct resource names/URLs, identical deterministic PNG pixels; cameras match 128px source dimensions. Encoded File budget overflow is not part of this fixture.' };
  writeFileSync(resolve(root, 'memory-metadata.json'), JSON.stringify(result, null, 2));
  return result;
}

/** Original URL masks retain encoded bytes; a valid ancillary chunk creates real File pressure. */
export function generateFileRetentionFixture(imageCount = 1100, maskBytes = 160 * 1024) {
  const metadata = generateMemoryFixture(imageCount, 'noise');
  const root = resolve('.tmp/performance/fixtures/memory');
  const maskRoot = resolve(root, 'masks');
  mkdirSync(maskRoot, { recursive: true });
  const png = readFileSync(resolve(root, 'images/image-00001.png'));
  const paddingSize = maskBytes - png.length - 12;
  if (paddingSize < 8) throw new Error('Mask target size must leave room for a valid ancillary chunk');
  const padding = Buffer.alloc(paddingSize, 32);
  Buffer.from('padding\0').copy(padding);
  const mask = Buffer.concat([png.subarray(0, -12), chunk('tEXt', padding), png.subarray(-12)]);
  if (mask.length !== maskBytes) throw new Error('Mask byte accounting mismatch');
  for (let index = 1; index <= imageCount; index++) writeFileSync(resolve(maskRoot, `image-${String(index).padStart(5, '0')}.png`), mask);
  const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8'));
  manifest.masksPath = 'masks/';
  writeFileSync(resolve(root, 'file-manifest.json'), JSON.stringify(manifest));
  const result = { ...metadata, maskBytes, uniqueEncodedMaskBytes: imageCount * maskBytes,
    maskSha256: createHash('sha256').update(mask).digest('hex'),
    maskDefinition: 'Original 128px PNG with a valid uncompressed tEXt ancillary chunk before IEND. Pixel data and CRCs remain valid; mask File.size is exactly maskBytes.' };
  writeFileSync(resolve(root, 'file-metadata.json'), JSON.stringify(result, null, 2));
  return result;
}
