import { describe, expect, it } from 'vitest';
import { buildImage, buildPoint2D, buildPoint3D, buildReconstruction } from '../test/builders/colmapBuilders';
import { assertReconstructionObservationIntegrity, checkReconstructionObservations, observationIntegrityWarning } from './observationIntegrity';
import { prepareReconstructionFiles } from './prepareReconstructionFiles';
import { exportReconstructionBinary, exportReconstructionText, exportReconstructionZip, downloadReconstructionZip } from './writers';
import { createIdentityEuler } from '../utils/sim3dTransforms';

const highId = 2n ** 63n + 17n;
function model() {
  return buildReconstruction({ images: [buildImage({ imageId: 5, points2D: [
    buildPoint2D({ point3DId: -1n, xy: [NaN, Infinity] }),
    buildPoint2D({ point3DId: highId, xy: [12, 34] }),
  ] })], points3D: [buildPoint3D({ point3DId: highId, track: [{ imageId: 5, point2DIdx: 1 }] })] });
}

describe('native observation integrity', () => {
  it('accepts reciprocal links, original feature indices and unassociated nonfinite XY', () => {
    const data = model();
    expect(checkReconstructionObservations(data)).toMatchObject({ status: 'valid', checkedTracks: 1, checkedObservations: 2 });
    data.images.get(5)!.points2D[1].point3DId = BigInt.asIntN(64, highId);
    expect(checkReconstructionObservations(data).status).toBe('valid');
    expect(observationIntegrityWarning(checkReconstructionObservations(data))).toBeNull();
  });

  it('rejects stale point record IDs even when all counts and track bounds are plausible', () => {
    const data = model(), point = data.points3D!.get(highId)!;
    data.points3D = new Map([[6n, { ...point, point3DId: 6n }]]);
    const result = checkReconstructionObservations(data);
    expect(result.status).toBe('invalid');
    expect(result.issues.conflictingPoint).toBe(1);
    expect(result.example).toContain('track names 6');
    expect(() => assertReconstructionObservationIntegrity(data)).toThrow('Source feature links are inconsistent');
  });

  it('accepts a merged point that observes two features of one image', () => {
    // COLMAP's Reconstruction::MergePoints3D keeps both features; 360_v2/bicycle has 846 such observations.
    const data = model();
    data.images.get(5)!.points2D.push(buildPoint2D({ point3DId: highId }));
    data.points3D!.get(highId)!.track.push({ imageId: 5, point2DIdx: 2 });
    expect(checkReconstructionObservations(data)).toMatchObject({ status: 'valid', checkedTracks: 2 });
    expect(() => assertReconstructionObservationIntegrity(data)).not.toThrow();
  });

  it('accepts a tracked feature that the image leaves unassigned, as GLOMAP writes', () => {
    // COLMAP's reader links the feature from the track (Reconstruction::AddPoint3D).
    const data = model();
    data.images.get(5)!.points2D[1].point3DId = -1n;
    expect(checkReconstructionObservations(data).status).toBe('valid');
    data.images.get(5)!.points2D[1].xy[0] = NaN;
    expect(checkReconstructionObservations(data).issues.nonfiniteTrackedXY).toBe(1);
  });

  it.each(['missingImage', 'invalidIndex', 'duplicateTrack', 'missingTrack', 'nonfiniteTrackedXY'] as const)('detects %s without changing the model', kind => {
    const data = model(), point = data.points3D!.get(highId)!;
    if (kind === 'missingImage') point.track[0].imageId = 99;
    if (kind === 'invalidIndex') point.track[0].point2DIdx = 2;
    if (kind === 'duplicateTrack') point.track.push({ ...point.track[0] });
    if (kind === 'missingTrack') point.track = [];
    if (kind === 'nonfiniteTrackedXY') data.images.get(5)!.points2D[1].xy[0] = NaN;
    const before = structuredClone(data);
    expect(checkReconstructionObservations(data).issues[kind]).toBeGreaterThan(0);
    expect(data).toEqual(before);
  });

  it('accepts empty and wholly untracked point clouds and rejects unavailable observations', () => {
    const data = buildReconstruction({ images: [], points3D: [buildPoint3D({ track: [] })] });
    expect(checkReconstructionObservations(data).status).toBe('valid');
    const incomplete = model(); incomplete.images.get(5)!.numPoints2D = 3;
    expect(() => checkReconstructionObservations(incomplete)).toThrow('Original observations are unavailable');
  });

  it('blocks native downloads, ZIPs and publishing preparation before serialization', async () => {
    const data = model(); data.images.get(5)!.points2D[1].point3DId = 7n;
    expect(() => exportReconstructionBinary(data)).toThrow('Source feature links');
    expect(() => exportReconstructionText(data)).toThrow('Source feature links');
    await expect(exportReconstructionZip(data, { format: 'binary' })).rejects.toThrow('Source feature links');
    await expect(downloadReconstructionZip(data, { format: 'text' })).rejects.toThrow('Source feature links');
    await expect(prepareReconstructionFiles(data, null, createIdentityEuler(), new AbortController().signal)).rejects.toThrow('Source feature links');
  });
});
