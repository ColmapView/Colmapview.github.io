import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import * as binary from '../../src/parsers/colmapBinaryWriters';
import * as text from '../../src/parsers/colmapTextWriters';
import { parseCamerasBinary } from '../../src/parsers/cameras';
import { parseImagesBinary } from '../../src/parsers/images';
import { parsePoints3DBinary } from '../../src/parsers/points3d';
import type { Camera, Image, Point3D } from '../../src/types/colmap';
import type { Rig, Frame } from '../../src/types/rig';
import { parseRigsBinary } from '../../src/parsers/rigs';
import { parseFramesBinary } from '../../src/parsers/frames';

// Explicit opt-in to large fixtures: generation and round-trip validation own Maps.
export function generateFixture(name = 'small', count = 10000, imageCount = 20, trackLength = 2) {
  if (!Number.isInteger(trackLength) || trackLength > imageCount || trackLength < 1) throw new Error('Invalid track length');
  const cameras = new Map<number, Camera>([[7, { cameraId: 7, modelId: 1, width: 64, height: 64, params: [50, 50, 32, 32] }]]);
  const images = new Map<number, Image>();
  const points = new Map<bigint, Point3D>();
  for (let i = 0; i < imageCount; i++) images.set(i + 1, {
    imageId: i + 1, cameraId: 7, name: `image-${String(i + 1).padStart(5, '0')}.png`,
    qvec: [1, 0, 0, 0], tvec: [Math.sin(i) * 2, Math.cos(i) * 2, 8], points2D: [],
  });
  let seed = 42;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < count; i++) {
    const id = 9007199254740993n + BigInt(i) * 17n;
    const track = [];
    for (let k = 0; k < trackLength; k++) {
      const image = images.get((i + k) % imageCount + 1)!;
      track.push({ imageId: image.imageId, point2DIdx: image.points2D.length });
      image.points2D.push({ xy: [32, 32], point3DId: id });
    }
    points.set(id, { point3DId: id, xyz: [(random() - .5) * 5, (random() - .5) * 5, random() * 3], rgb: [100, 180, 220], error: random(), track });
  }
  const files = {
    'cameras.bin': binary.writeCamerasBinary(cameras),
    'images.bin': binary.writeImagesBinary(images),
    'points3D.bin': binary.writePoints3DBinary(points),
  };
  const parsed = parsePoints3DBinary(files['points3D.bin']);
  if (parsed.size !== count || parseImagesBinary(files['images.bin']).size !== imageCount || parseCamerasBinary(files['cameras.bin']).size !== 1) throw new Error('Fixture count validation failed');
  for (const [id, point] of parsed) {
    for (const observation of point.track) {
      if (images.get(observation.imageId)?.points2D[observation.point2DIdx].point3DId !== id) throw new Error('Invalid observation');
    }
  }
  const directory = resolve('.tmp/performance/fixtures', name);
  mkdirSync(directory, { recursive: true });
  const rigs = new Map<number, Rig>([[3, { rigId: 3, refSensorId: { type: 0, id: 7 }, sensors: [{ sensorId: { type: 0, id: 7 }, hasPose: false }] }]]);
  const frames = new Map<number, Frame>(Array.from(images.values(), image => [image.imageId, { frameId: image.imageId, rigId: 3, rigFromWorld: { qvec: image.qvec, tvec: image.tvec }, dataIds: [{ sensorId: { type: 0, id: 7 }, dataId: image.imageId }] }]));
  const rigBytes = binary.writeRigsBinary(rigs);
  const frameBytes = binary.writeFramesBinary(frames);
  if (parseRigsBinary(rigBytes).size !== 1 || parseFramesBinary(frameBytes).size !== imageCount) throw new Error('Rig/frame validation failed');
  writeFileSync(resolve(directory, 'rigs.bin'), new Uint8Array(rigBytes));
  writeFileSync(resolve(directory, 'frames.bin'), new Uint8Array(frameBytes));
  const fingerprint = createHash('sha256');
  for (const [filename, bytes] of Object.entries(files)) {
    fingerprint.update(new Uint8Array(bytes));
    writeFileSync(resolve(directory, filename), new Uint8Array(bytes));
  }
  if (count <= 10000) {
    writeFileSync(resolve(directory, 'cameras.txt'), text.writeCamerasText(cameras));
    writeFileSync(resolve(directory, 'images.txt'), text.writeImagesText(images));
    writeFileSync(resolve(directory, 'points3D.txt'), text.writePoints3DText(points));
    writeFileSync(resolve(directory, 'rigs.txt'), text.writeRigsText(rigs));
    writeFileSync(resolve(directory, 'frames.txt'), text.writeFramesText(frames));
  }
  const metadata = { name, count, imageCount, trackLength, seed: 42, fingerprint: fingerprint.digest('hex'), validation: 'binary parser round trip, counts, every observation reference' };
  writeFileSync(resolve(directory, 'metadata.json'), JSON.stringify(metadata, null, 2));
  return metadata;
}
