import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { inflateSync } from 'node:zlib';
import { useCameraStore, useDeletionStore, useReconstructionStore } from '../store';
import { buildArchiveEntry, buildArchiveReader, buildCamera, buildFile, buildImage, buildPoint2D, buildPoint3D, buildReconstruction } from '../test/builders';
import { resolveColmapWasmFactory } from '../test/builders/wasmFakes';
import { WasmReconstructionWrapper } from '../wasm/reconstruction';
import * as wasmInit from '../wasm/init';
import { parseCamerasBinary } from '../parsers/cameras';
import { parseImagesBinary } from '../parsers/images';
import { parsePoints3DBinary } from '../parsers/points3d';
import { CameraModelId } from '../types/colmap';
import { writeImagesBinary, writePoints3DBinary } from '../parsers/colmapBinaryWriters';
import { clearActiveZipArchive, setActiveZipArchive } from '../utils/zipArchiveState';
import { createTrainingSnapshot, isSnapshotForCurrentReconstruction, isSourceIdForCurrentReconstruction } from './trainingSnapshot';

const encodingMocks = vi.hoisted(() => ({
  encodeTrainingJpeg: vi.fn(async (source: File, outputName: string, signal?: AbortSignal) => {
    signal?.throwIfAborted();
    return new File([source], outputName, { type: 'image/jpeg' });
  }),
  normalizeTrainingMask: vi.fn(async (source: File, outputName: string, signal?: AbortSignal) => {
    signal?.throwIfAborted();
    return new File([source], outputName, { type: 'image/png' });
  }),
  createSolidTrainingMask: vi.fn(async (
    width: number, height: number, foreground: boolean, outputName: string, signal?: AbortSignal,
  ) => {
    signal?.throwIfAborted();
    return new File([`${width}x${height}:${foreground}`], outputName, { type: 'image/png' });
  }),
}));

vi.mock('./trainingImageEncoding', () => ({
  TRAINING_JPEG_QUALITY: 0.9,
  ...encodingMocks,
}));

describe('createTrainingSnapshot', () => {
  afterEach(() => { vi.restoreAllMocks(); clearActiveZipArchive(); });
  beforeEach(() => {
    vi.clearAllMocks();
    useDeletionStore.getState().clearPendingDeletions();
    useReconstructionStore.setState({ reconstruction: null, wasmReconstruction: null, loadedFiles: null, sourceType: null });
  });

  it('fingerprints the model and manifest independently of the runtime snapshot id', async () => {
    useReconstructionStore.setState({
      reconstruction: buildReconstruction({ images: [] }),
      sourceType: 'local',
      loadedFiles: { imageFiles: new Map(), hasMasks: false },
    });
    const first = await createTrainingSnapshot({ maskSource: 'none' });
    const second = await createTrainingSnapshot({ maskSource: 'none' });
    expect(first.id).not.toBe(second.id);
    expect(first.sourceFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(second.sourceFingerprint).toBe(first.sourceFingerprint);

    useReconstructionStore.setState({
      reconstruction: buildReconstruction({ images: [], cameras: [buildCamera({ width: 800 })] }),
    });
    const changed = await createTrainingSnapshot({ maskSource: 'none' });
    expect(changed.sourceFingerprint).not.toBe(first.sourceFingerprint);
  });

  it('orders image uploads by the exported model, not source insertion or filename order', async () => {
    const images = [buildImage({ imageId: 9, name: 'a.png' }), buildImage({ imageId: 2, name: 'z.png' })];
    useReconstructionStore.setState({ reconstruction: buildReconstruction({ images }), sourceType: 'local' });
    const snapshot = await createTrainingSnapshot({ maskSource: 'none' });
    const model = parseImagesBinary(await bytes(await snapshot.files.find(file => file.id === 'images')!.read()));
    const names = [...model.values()].map(image => image.name);
    expect(names).toEqual(['z.jpg', 'a.jpg']);
    expect(snapshot.files.filter(file => file.role === 'image').map(file => file.image_name)).toEqual(names);
    expect(encodingMocks.encodeTrainingJpeg).not.toHaveBeenCalled();
  });

  it.each([false, true])('omits missing mask uploads only when native fallback is advertised (supplied=%s)', async supplied => {
    const images = [buildImage({ imageId: 1, name: 'left.jpg' }), buildImage({ imageId: 2, name: 'right.jpg' })];
    useReconstructionStore.setState({
      reconstruction: buildReconstruction({ images }), sourceType: 'local',
      loadedFiles: { imageFiles: new Map(supplied ? [['masks/left.jpg', buildFile('left.jpg', 'mask', 'image/png')]] : []),
        hasMasks: supplied },
    });
    const snapshot = await createTrainingSnapshot({
      maskSource: 'directory', missingMaskPolicy: 'full_foreground', missingMaskTransport: 'omit',
    });
    const masks = snapshot.files.filter(file => file.role === 'mask');
    expect(masks.map(file => file.image_name)).toEqual(supplied ? ['left.jpg'] : []);
    await Promise.all(masks.map(file => file.read()));
    expect(encodingMocks.createSolidTrainingMask).not.toHaveBeenCalled();
    expect(encodingMocks.normalizeTrainingMask).toHaveBeenCalledTimes(supplied ? 1 : 0);
  });

  it('defers original image and required mask reads until an upload worker requests them', async () => {
    const image = buildImage({ name: 'nested/source.jpg' });
    const original = buildFile('source.jpg', 'original');
    const mask = buildFile('source.jpg.png', 'mask', 'image/png');
    useReconstructionStore.setState({
      reconstruction: buildReconstruction({ images: [image] }),
      sourceType: 'local',
      loadedFiles: { imageFiles: new Map([[image.name, original], [`masks/${image.name}`, mask]]), hasMasks: true },
    });

    const snapshot = await createTrainingSnapshot({ maskSource: 'directory' });
    const imageEntry = snapshot.files.find((file) => file.role === 'image');
    const maskEntry = snapshot.files.find((file) => file.role === 'mask');
    expect(imageEntry?.file).toBeUndefined();
    expect(maskEntry?.file).toBeUndefined();
    expect(await bytes((await imageEntry?.read())!)).toEqual(await bytes(original));
    expect(await bytes((await maskEntry?.read())!)).toEqual(await bytes(mask));
    expect(encodingMocks.encodeTrainingJpeg).toHaveBeenCalledWith(original, 'nested/source.jpg', undefined, { dimensions: { width: 640, height: 480 } });
    expect(encodingMocks.normalizeTrainingMask).toHaveBeenCalledWith(mask, 'nested/source.jpg.png', undefined, { dimensions: { width: 640, height: 480 } });
  });

  it('does not silently train a reconstruction with staged deletions', async () => {
    const reconstruction = buildReconstruction();
    useReconstructionStore.setState({ reconstruction, sourceType: 'local', loadedFiles: { imageFiles: new Map(), hasMasks: false } });
    useDeletionStore.getState().markForDeletion(1);
    await expect(createTrainingSnapshot({ maskSource: 'none' })).rejects.toThrow('pending deletions');
  });

  it('uses each read signal after snapshot creation is cancelled, including original masks and model files', async () => {
    const image = buildImage({ name: 'Camera/Photo.PNG' });
    const original = buildFile('Photo.PNG', 'original');
    const mask = buildFile('photo.png', 'soft mask', 'image/png');
    useReconstructionStore.setState({
      reconstruction: buildReconstruction({ images: [image] }), sourceType: 'local',
      loadedFiles: { imageFiles: new Map([[image.name, original], ['masks/camera/photo.png', mask]]), hasMasks: true },
    });
    const initial = new AbortController();
    const snapshot = await createTrainingSnapshot({ maskSource: 'auto', signal: initial.signal });
    initial.abort();
    const fresh = new AbortController();
    expect(await bytes(await snapshot.files.find(file => file.role === 'image')!.read(fresh.signal))).toEqual(await bytes(original));
    expect(await bytes(await snapshot.files.find(file => file.role === 'mask')!.read(fresh.signal))).toEqual(await bytes(mask));
    for (const entry of snapshot.files) {
      await expect(entry.read(fresh.signal)).resolves.toBeInstanceOf(File);
      await expect(entry.read(initial.signal)).rejects.toMatchObject({ name: 'AbortError' });
    }
    await expect(createTrainingSnapshot({ maskSource: 'none', signal: initial.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });

  it.each(['image', 'mask'] as const)('cancels an in-flight remote %s fetch with the current read signal', async role => {
    const image = buildImage({ name: 'Camera/Photo.PNG' });
    useReconstructionStore.setState({
      reconstruction: buildReconstruction({ images: [image] }), sourceType: 'url', imageNameToUrl: null,
      imageUrlBase: 'https://original.example/images/', maskUrlBase: 'https://original.example/masks/',
    });
    const initial = new AbortController();
    const snapshot = await createTrainingSnapshot({ maskSource: 'directory', signal: initial.signal });
    initial.abort();
    const attempt = new AbortController();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason), { once: true });
    }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const pending = snapshot.files.find(file => file.role === role)!.read(attempt.signal);
      expect(fetchMock).toHaveBeenCalledWith(`https://original.example/${role === 'image' ? 'images' : 'masks'}/Camera/Photo.PNG`, { signal: attempt.signal });
      attempt.abort();
      await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      expect(fetchMock).toHaveBeenCalledOnce();
    } finally { vi.unstubAllGlobals(); }
  });

  it('rejects a required loaded mask instead of omitting it', async () => {
    const reconstruction = buildReconstruction();
    useReconstructionStore.setState({ reconstruction, sourceType: 'local', loadedFiles: { imageFiles: new Map(), hasMasks: true } });
    const snapshot = await createTrainingSnapshot({ maskSource: 'directory' });
    const mask = snapshot.files.find((file) => file.role === 'mask');
    await expect(mask?.read()).rejects.toThrow('Mask is unavailable');
  });

  it.each([[false, true], [true, false]] as const)(
    'uses one cached full-foreground fallback for missing directory masks when invert=%s',
    async (invertMasks, encodedForeground) => {
      const images = [
        buildImage({ imageId: 1, name: 'one.jpg' }),
        buildImage({ imageId: 2, name: 'two.jpg' }),
      ];
      useReconstructionStore.setState({
        reconstruction: buildReconstruction({ images }),
        sourceType: 'local',
        loadedFiles: { imageFiles: new Map(), hasMasks: false },
      });
      const snapshot = await createTrainingSnapshot({
        maskSource: 'directory', missingMaskPolicy: 'full_foreground', invertMasks,
      });
      const masks = snapshot.files.filter(file => file.role === 'mask');

      await Promise.all(masks.map(file => file.read()));

      expect(masks).toHaveLength(2);
      expect(encodingMocks.createSolidTrainingMask).toHaveBeenCalledOnce();
      expect(encodingMocks.createSolidTrainingMask).toHaveBeenCalledWith(
        640, 480, encodedForeground, 'one.jpg.png', undefined,
      );
    },
  );

  it('keeps supplied auto masks and fills only missing views when the backend opts in', async () => {
    const images = [buildImage({ name: 'left.jpg' }), buildImage({ imageId: 2, name: 'right.jpg' })];
    const supplied = buildFile('left.jpg.png', 'supplied mask', 'image/png');
    useReconstructionStore.setState({
      reconstruction: buildReconstruction({ images }), sourceType: 'local',
      loadedFiles: { imageFiles: new Map([['masks/left.jpg.png', supplied]]), hasMasks: true },
    });
    const snapshot = await createTrainingSnapshot({
      maskSource: 'auto', missingMaskPolicy: 'full_foreground',
    });
    const masks = snapshot.files.filter(file => file.role === 'mask');

    const encoded = await Promise.all(masks.map(file => file.read()));

    expect(masks.map(file => file.image_name)).toEqual(['left.jpg', 'right.jpg']);
    expect(encodingMocks.normalizeTrainingMask).toHaveBeenCalledWith(supplied, 'left.jpg.png', undefined, { dimensions: { width: 640, height: 480 } });
    expect(encodingMocks.createSolidTrainingMask).toHaveBeenCalledWith(640, 480, true, 'right.jpg.png', undefined);
    expect(encoded).toHaveLength(2);
  });

  it('rejects a lazy source read after the reconstruction changes', async () => {
    const image = buildImage({ name: 'source.jpg' });
    const reconstruction = buildReconstruction({ images: [image] });
    useReconstructionStore.setState({
      reconstruction, sourceType: 'local', loadedFiles: { imageFiles: new Map([[image.name, buildFile('source.jpg')]]), hasMasks: false },
    });
    const snapshot = await createTrainingSnapshot({ maskSource: 'none' });
    expect(isSnapshotForCurrentReconstruction(snapshot)).toBe(true);
    expect(isSourceIdForCurrentReconstruction(snapshot.sourceId)).toBe(true);
    useReconstructionStore.setState({ reconstruction: buildReconstruction(), sourceType: 'local' });
    expect(isSnapshotForCurrentReconstruction(snapshot)).toBe(false);
    expect(isSourceIdForCurrentReconstruction(snapshot.sourceId)).toBe(false);
    await expect(snapshot.files.find((file) => file.role === 'image')?.read()).rejects.toThrow('reconstruction changed');
  });

  it('freezes full model binaries before selected/hidden cameras or later edits can change them', async () => {
    const id = 9007199254740997n;
    const cameras = [buildCamera({ cameraId: 5 }), buildCamera({ cameraId: 7, width: 800 })];
    const images = [5, 7].map(imageId => buildImage({
      imageId, cameraId: imageId, name: `${imageId}/same.png`, points2D: [buildPoint2D({ point3DId: id })],
    }));
    const point = buildPoint3D({ point3DId: id, xyz: [1, 2, 3], track: [{ imageId: 5, point2DIdx: 0 }, { imageId: 7, point2DIdx: 0 }] });
    const reconstruction = buildReconstruction({ cameras, images, points3D: [point] });
    useCameraStore.setState({ selectedImageId: 5, showCameras: false });
    useReconstructionStore.setState({ reconstruction, sourceType: 'local' });
    const snapshot = await createTrainingSnapshot({ maskSource: 'none' });
    // Edits after Train must never change the declared upload.
    cameras[0].params[0] = 999;
    images[0].name = 'edited.png';
    point.xyz[0] = 999;
    reconstruction.images.delete(7);
    const models = new Map(await Promise.all(snapshot.files.filter(file => file.role === 'model').map(async file => [file.id, await bytes(await file.read())] as const)));
    expect(parseCamerasBinary(models.get('cameras')!).get(5)?.params[0]).toBe(500);
    expect([...parseImagesBinary(models.get('images')!).values()].map(image => image.name)).toEqual(['5/same.jpg', '7/same.jpg']);
    expect(parsePoints3DBinary(models.get('points3d')!).get(id)).toEqual({ ...point, xyz: [1, 2, 3] });
    expect(snapshot.imageCount).toBe(2);
    expect(snapshot.files.filter(file => file.role === 'model').every(file => file.expectedBytes === file.file?.size)).toBe(true);
  });

  it('rewrites source extensions consistently and disambiguates JPEG path collisions', async () => {
    const images = [
      buildImage({ imageId: 2, name: 'nested/same.png' }),
      buildImage({ imageId: 7, name: 'nested/SAME.jpeg' }),
      buildImage({ imageId: 9, name: 'other/photo.webp' }),
    ];
    useReconstructionStore.setState({ reconstruction: buildReconstruction({ images }), sourceType: 'local' });

    const snapshot = await createTrainingSnapshot({ maskSource: 'none' });
    const names = [...parseImagesBinary(await bytes(await snapshot.files.find(file => file.id === 'images')!.read())).values()]
      .map(image => image.name);
    const entries = snapshot.files.filter(file => file.role === 'image');

    expect(names).toEqual(['nested/same.colmap-2.jpg', 'nested/SAME.colmap-7.jpg', 'other/photo.jpg']);
    expect(entries.map(entry => entry.image_name)).toEqual(names);
    expect(entries.map(entry => entry.path)).toEqual(names.map(name => `images/${name}`));
  });

  it('preserves OPENCV distortion parameters in the training model snapshot', async () => {
    const params = [500, 510, 320, 240, 0.12, -0.03, 0.004, -0.002];
    const camera = buildCamera({ modelId: CameraModelId.OPENCV, params });
    useReconstructionStore.setState({
      reconstruction: buildReconstruction({ cameras: [camera] }),
      sourceType: 'local',
    });

    const snapshot = await createTrainingSnapshot({ maskSource: 'none' });
    const cameraFile = snapshot.files.find(file => file.id === 'cameras')!;
    const parsed = parseCamerasBinary(await bytes(await cameraFile.read())).get(camera.cameraId)!;

    expect(parsed.modelId).toBe(CameraModelId.OPENCV);
    expect(parsed.params).toEqual(params);
  });

  it('DATA-04 retains the old ZIP across a blocked extraction and global archive replacement', async () => {
    const original = buildFile('same.png', 'original old archive bytes');
    let release!: (file: File) => void;
    const entered = vi.fn();
    const oldEntry = buildArchiveEntry({ extract: () => { entered(); return new Promise<File>(resolve => { release = resolve; }); } });
    setActiveZipArchive(buildArchiveReader(), new Map([['left/same.png', oldEntry], ['right/same.png', buildArchiveEntry({ extract: async () => original })]]));
    useReconstructionStore.setState({ reconstruction: buildReconstruction({ images: [buildImage({ name: 'left/same.png' }), buildImage({ imageId: 2, name: 'right/same.png' })] }), sourceType: 'zip' });
    const snapshot = await createTrainingSnapshot({ maskSource: 'none' });
    const entries = snapshot.files.filter(file => file.role === 'image');
    const pending = entries[0].read();
    expect(entered).toHaveBeenCalledOnce();
    const replacement = vi.fn(async () => buildFile('same.png', 'WRONG DATASET'));
    setActiveZipArchive(buildArchiveReader(), new Map([['left/same.png', buildArchiveEntry({ extract: replacement })], ['right/same.png', buildArchiveEntry({ extract: replacement })]]));
    release(original);
    expect(await bytes(await pending)).toEqual(await bytes(original));
    expect(await bytes(await entries[1].read())).toEqual(await bytes(original));
    expect(replacement).not.toHaveBeenCalled();
  });

  it.each(['directory', 'alpha', 'auto'] as const)('preserves asymmetric soft RGBA pixels and orientation for %s masks', async (maskSource) => {
    // Valid 2x2 PNG: rows have grayscale [0,64] / [128,255] and alpha [255,128] / [64,0].
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAGklEQVR4nGNkYGD47+Dg0MjQ0NDg8P//fwYAMNcG/+7XKdkAAAAASUVORK5CYII='), character => character.charCodeAt(0));
    const file = new File([png], 'mask.png', { type: 'image/png' });
    const image = buildImage({ name: 'Left/Same.PNG' });
    useReconstructionStore.setState({
      reconstruction: buildReconstruction({ images: [image] }), sourceType: 'local',
      loadedFiles: { imageFiles: new Map([[image.name, file], ['masks/left/same.png', file]]), hasMasks: true },
    });
    const snapshot = await createTrainingSnapshot({ maskSource });
    const entry = snapshot.files.find(entry => entry.role === (maskSource === 'alpha' ? 'image' : 'mask'))!;
    const uploaded = new Uint8Array(await bytes(await entry.read()));
    expect(uploaded).toEqual(png);
    const scanlines = inflateSync(uploaded.slice(41, 67));
    expect(scanlines[0]).toBe(1); // PNG Sub filter, decode without image orientation/color conversion.
    expect(scanlines[9]).toBe(0);
    const rgba = [...scanlines.slice(1, 9), ...scanlines.slice(10)];
    for (let channel = 4; channel < 8; channel += 1) rgba[channel] = (rgba[channel] + rgba[channel - 4]) & 255;
    expect(rgba).toEqual([0, 0, 0, 255, 64, 64, 64, 128, 128, 128, 128, 64, 255, 255, 255, 0]);
    expect(entry.image_name).toBe(maskSource === 'alpha' ? 'Left/Same.PNG' : 'Left/Same.jpg');
    if (maskSource === 'alpha') expect(snapshot.files.some(entry => entry.role === 'mask')).toBe(false);
  });

  it.each(['url', 'manifest'] as const)('uses original %s image URLs frozen before mutable source settings change', async (sourceType) => {
    const image = buildImage({ name: 'nested/same.png' });
    const urls = { [image.name]: 'https://original.example/nested/same.png' };
    useReconstructionStore.setState({ reconstruction: buildReconstruction({ images: [image] }), sourceType, imageUrlBase: 'https://original.example/', imageNameToUrl: sourceType === 'manifest' ? urls : null });
    const snapshot = await createTrainingSnapshot({ maskSource: 'none' });
    urls[image.name] = 'https://wrong.example/same.png';
    useReconstructionStore.setState({ imageUrlBase: 'https://wrong.example/', imageNameToUrl: urls });
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ original: true }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      await snapshot.files.find(file => file.role === 'image')!.read();
      expect(fetchMock).toHaveBeenCalledWith('https://original.example/nested/same.png', { signal: undefined });
    } finally { vi.unstubAllGlobals(); }
  });

  it('auto declares available masks by full nested name without treating a basename sibling as coverage', async () => {
    const images = [buildImage({ name: 'left/same.png' }), buildImage({ imageId: 2, name: 'right/same.png' })];
    useReconstructionStore.setState({
      reconstruction: buildReconstruction({ images }), sourceType: 'local',
      loadedFiles: { imageFiles: new Map([['masks/left/same.png', buildFile('same.png')], ['masks/same.png', buildFile('WRONG.png')]]), hasMasks: true },
    });
    const snapshot = await createTrainingSnapshot({ maskSource: 'auto' });
    expect(snapshot.files.filter(file => file.role === 'mask').map(file => file.image_name)).toEqual(['left/same.jpg']);
  });

  it('exports actual WASM-only observations, 64-bit point IDs and tracks before WASM disposal', async () => {
    const wasmDir = resolve(process.cwd(), 'public/wasm');
    const factory = resolveColmapWasmFactory(await import(pathToFileURL(resolve(wasmDir, 'colmap_wasm.js')).href));
    const module = await factory({ wasmBinary: readFileSync(resolve(wasmDir, 'colmap_wasm.wasm')), locateFile: file => resolve(wasmDir, file) });
    vi.spyOn(wasmInit, 'loadColmapWasm').mockResolvedValue(module);
    const wasm = new WasmReconstructionWrapper();
    await wasm.initialize();
    const id = 9007199254740997n;
    const image = buildImage({ imageId: 42, name: 'nested/same.png', points2D: [buildPoint2D({ xy: [1.5, 2.5], point3DId: id })] });
    const point = buildPoint3D({ point3DId: id, xyz: [1, 2, 3], track: [{ imageId: 42, point2DIdx: 0 }] });
    expect(wasm.parsePoints3D(writePoints3DBinary(new Map([[id, point]])))).toBe(true);
    expect(wasm.parseImages(writeImagesBinary(new Map([[42, image]])))).toBe(true);
    useReconstructionStore.setState({ reconstruction: buildReconstruction({ images: [{ ...image, points2D: [] }] }), wasmReconstruction: wasm, sourceType: 'local' });
    const snapshot = await createTrainingSnapshot({ maskSource: 'none' });
    wasm.dispose();
    const imageBytes = await bytes(await snapshot.files.find(file => file.id === 'images')!.read());
    const pointBytes = await bytes(await snapshot.files.find(file => file.id === 'points3d')!.read());
    expect(parseImagesBinary(imageBytes).get(42)?.points2D).toEqual(image.points2D);
    expect(parsePoints3DBinary(pointBytes).get(id)).toEqual(point);
  });
});

function bytes(file: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(file);
  });
}
