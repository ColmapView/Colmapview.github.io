import { describe, expect, it } from 'vitest';
import {
  buildCamera,
  buildAnchorElement,
  buildArchiveEntry,
  buildArchiveReader,
  buildBlobEvent,
  buildDataTransfer,
  buildDataTransferItem,
  buildClipboardItem,
  buildEncodedVideoChunk,
  buildEncodedVideoChunkMetadata,
  buildGifEncoderWithHandlers,
  buildImageBitmap,
  buildImageCacheCanvas,
  buildIdleDeadline,
  buildCanvas2dContext,
  buildDatasetState,
  buildFile,
  buildFileSystemEntry,
  buildFileSystemDirectoryEntry,
  buildFileSystemDirectoryHandle,
  buildFileSystemFileEntry,
  buildFileSystemFileHandle,
  buildFrame,
  buildKeyboardEvent,
  buildImage,
  buildLoadedFiles,
  buildMediaRecorder,
  buildMediaStream,
  buildMouseEvent,
  buildPoint2D,
  buildReactMouseEvent,
  buildReactPointerEvent,
  buildReactTouchEvent,
  buildReadableBinaryBlob,
  buildReadableBinaryFile,
  buildReadableFile,
  buildReconstruction,
  buildResponse,
  buildRig,
  buildRigData,
  buildSetTimeoutImplementation,
  buildThreeMouseEvent,
  buildTimeoutHandle,
  buildTouch,
  buildTouchEvent,
  buildVideoEncoder,
  buildVideoFrame,
  buildWasmCameraImageMaps,
  buildWasmReconstructionWrapper,
  buildWheelEvent,
  copyBytesToArrayBuffer,
  readBlobAsArrayBuffer,
  resolveColmapWasmFactory,
} from '.';
import { CameraModelId } from '../../types/colmap';

describe('test builders', () => {
  it('builds a self-consistent reconstruction graph', () => {
    const camera = buildCamera({ cameraId: 7, width: 800, height: 600 });
    const image = buildImage({
      imageId: 42,
      cameraId: camera.cameraId,
      name: 'cam0/frame.jpg',
      points2D: [
        buildPoint2D({ xy: [10, 20], point3DId: 12n }),
        buildPoint2D({ xy: [30, 40] }),
      ],
    });

    const reconstruction = buildReconstruction({ cameras: [camera], images: [image] });

    expect(reconstruction.cameras.get(camera.cameraId)).toBe(camera);
    expect(reconstruction.images.get(image.imageId)).toBe(image);
    expect(reconstruction.imageStats.get(image.imageId)?.numPoints3D).toBe(1);
    expect(reconstruction.imageToPoint3DIds.get(image.imageId)).toEqual(new Set([12n]));
  });

  it('builds loaded files and dataset state for local datasets', () => {
    const imageFile = buildFile('frame.jpg');
    const loadedFiles = buildLoadedFiles({ imageFiles: [imageFile], hasMasks: true });
    const datasetState = buildDatasetState({ sourceType: 'local', loadedFiles });

    expect(datasetState.loadedFiles?.imageFiles.get('frame.jpg')).toBe(imageFile);
    expect(datasetState.loadedFiles?.hasMasks).toBe(true);
    expect(datasetState.sourceType).toBe('local');
  });

  it('builds rig data with typed rig and frame maps', () => {
    const rig = buildRig({ rigId: 7 });
    const frame = buildFrame({ frameId: 9, rigId: rig.rigId });
    const rigData = buildRigData({ rigs: [rig], frames: [frame] });

    expect(rigData.rigs.get(rig.rigId)).toBe(rig);
    expect(rigData.frames.get(frame.frameId)).toBe(frame);
  });

  it('builds browser image fakes with explicit dimensions and lifecycle hooks', () => {
    const close = vi.fn();
    const drawImage = vi.fn();
    const bitmap = buildImageBitmap({ width: 320, height: 240, close });
    const context = buildCanvas2dContext({ drawImage, imageSmoothingQuality: 'high' });
    const getContext = vi.fn(() => null);
    const canvas = buildImageCacheCanvas({ width: 160, height: 120, getContext });

    bitmap.close();
    context.drawImage(bitmap, 0, 0);

    expect(bitmap.width).toBe(320);
    expect(bitmap.height).toBe(240);
    expect(close).toHaveBeenCalledOnce();
    expect(context.imageSmoothingQuality).toBe('high');
    expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0);
    expect(canvas.width).toBe(160);
    expect(canvas.height).toBe(120);
    expect(canvas.getContext('2d')).toBeNull();
    expect(getContext).toHaveBeenCalledWith('2d');
  });

  it('builds idle deadline fakes for idle callback tests', () => {
    const deadline = buildIdleDeadline({
      didTimeout: true,
      timeRemaining: () => 12,
    });

    expect(deadline.didTimeout).toBe(true);
    expect(deadline.timeRemaining()).toBe(12);
  });

  it('builds ClipboardItem fakes for rich clipboard tests', async () => {
    const blob = new Blob(['image'], { type: 'image/png' });
    const clipboardItem = buildClipboardItem({ blobs: { 'image/png': blob } });

    expect(clipboardItem.types).toEqual(['image/png']);
    expect(clipboardItem.presentationStyle).toBe('unspecified');
    await expect(clipboardItem.getType('image/png')).resolves.toBe(blob);
    await expect(clipboardItem.getType('text/plain')).rejects.toThrow('ClipboardItem type is not available');
  });

  it('builds media fakes for recording tests', () => {
    const { gif, handlers, registrations } = buildGifEncoderWithHandlers();
    const progress = vi.fn();
    const abort = vi.fn();
    const finished = vi.fn();
    const copyTo = vi.fn();
    const chunk = buildEncodedVideoChunk({
      byteLength: 3,
      duration: 100,
      timestamp: 200,
      type: 'delta',
      copyTo,
    });
    const metadata = buildEncodedVideoChunkMetadata();
    const destination = new Uint8Array(3);
    const blob = new Blob(['gif']);
    const blobEvent = buildBlobEvent(blob);
    const bytes = new Uint8Array([1, 2, 3]);
    const closeFrame = vi.fn();
    const frame = buildVideoFrame({ close: closeFrame, timestamp: 123 });
    const streamListener = vi.fn();
    const stream = buildMediaStream({ active: false, id: 'stream-1' });
    const recorderStart = vi.fn();
    const recorderStop = vi.fn();
    const recorderListener = vi.fn();
    const recorder = buildMediaRecorder({
      stream,
      mimeType: 'video/webm',
      state: 'recording',
      videoBitsPerSecond: 100,
      audioBitsPerSecond: 50,
      start: recorderStart,
      stop: recorderStop,
    });
    const encode = vi.fn();
    const flush = vi.fn().mockResolvedValue(undefined);
    const encoderListener = vi.fn();
    const encoder = buildVideoEncoder({
      encode,
      flush,
      state: 'configured',
      encodeQueueSize: 2,
    });

    gif.on('progress', progress);
    gif.on('abort', abort);
    gif.on('finished', finished);
    handlers.progress?.(0.25);
    handlers.abort?.();
    handlers.finished?.(blob, bytes);
    chunk.copyTo(destination);
    stream.addEventListener('addtrack', streamListener);
    stream.dispatchEvent(new Event('addtrack'));
    recorder.addEventListener('stop', recorderListener);
    recorder.start(1000);
    recorder.stop();
    recorder.dispatchEvent(new Event('stop'));
    encoder.addEventListener('dequeue', encoderListener);
    encoder.encode(frame);
    encoder.dispatchEvent(new Event('dequeue'));

    expect(registrations).toEqual(['progress', 'abort', 'finished']);
    expect(progress).toHaveBeenCalledWith(0.25);
    expect(abort).toHaveBeenCalledOnce();
    expect(finished).toHaveBeenCalledWith(blob, bytes);
    expect(chunk.byteLength).toBe(3);
    expect(chunk.duration).toBe(100);
    expect(chunk.timestamp).toBe(200);
    expect(chunk.type).toBe('delta');
    expect(copyTo).toHaveBeenCalledWith(destination);
    expect(metadata).toEqual({});
    expect(blobEvent.type).toBe('dataavailable');
    expect(blobEvent.data).toBe(blob);
    expect(blobEvent.timecode).toBe(0);
    expect(frame.timestamp).toBe(123);
    expect(stream.active).toBe(false);
    expect(stream.id).toBe('stream-1');
    expect(stream.clone().id).toBe('stream-1');
    expect(stream.getTracks()).toEqual([]);
    expect(streamListener).toHaveBeenCalledOnce();
    expect(recorder.stream).toBe(stream);
    expect(recorder.mimeType).toBe('video/webm');
    expect(recorder.state).toBe('recording');
    expect(recorder.videoBitsPerSecond).toBe(100);
    expect(recorder.audioBitsPerSecond).toBe(50);
    expect(recorderStart).toHaveBeenCalledWith(1000);
    expect(recorderStop).toHaveBeenCalledOnce();
    expect(recorderListener).toHaveBeenCalledOnce();
    expect(encoder.state).toBe('configured');
    expect(encoder.encodeQueueSize).toBe(2);
    expect(encode).toHaveBeenCalledWith(frame);
    expect(encoderListener).toHaveBeenCalledOnce();
    frame.close();
    expect(closeFrame).toHaveBeenCalledOnce();
  });

  it('builds anchor and timeout fakes for download tests', () => {
    const click = vi.fn();
    const anchor = buildAnchorElement({ click });
    const timeoutHandle = buildTimeoutHandle();
    let scheduledHandler: TimerHandler | undefined;
    const setTimeoutImplementation = buildSetTimeoutImplementation({
      handle: timeoutHandle,
      onSchedule: (handler) => {
        scheduledHandler = handler;
      },
    });

    anchor.href = 'blob:test';
    anchor.download = 'capture.zip';
    anchor.click();
    const returnedHandle = setTimeoutImplementation(() => undefined, 60_000);

    expect(anchor.href).toBe('blob:test');
    expect(anchor.download).toBe('capture.zip');
    expect(click).toHaveBeenCalledOnce();
    expect(timeoutHandle).toBeDefined();
    expect(returnedHandle).toBe(timeoutHandle);
    expect(typeof scheduledHandler).toBe('function');
  });

  it('builds response fakes with optional blob overrides', async () => {
    const blob = new Blob(['custom'], { type: 'image/png' });
    const response = buildResponse({
      status: 202,
      headers: { 'x-test': '1' },
      blob: vi.fn().mockResolvedValue(blob),
    });

    await expect(response.blob()).resolves.toBe(blob);
    expect(response.ok).toBe(true);
    expect(response.status).toBe(202);
    expect(response.headers.get('x-test')).toBe('1');
  });

  it('builds typed DOM and Three event fakes for interaction tests', () => {
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const keyboardEvent = buildKeyboardEvent({ key: 'W', ctrlKey: true, preventDefault });
    const mouseEvent = buildMouseEvent({ clientX: 5, clientY: 8, stopPropagation });
    const threeEvent = buildThreeMouseEvent({
      instanceId: 3,
      nativeEvent: mouseEvent,
      stopPropagation: vi.fn(),
    });
    const wheelEvent = buildWheelEvent({ deltaY: -12, altKey: true, preventDefault: vi.fn() });
    const touch = buildTouch({ identifier: 9, clientX: 13, clientY: 21 });
    const touchEvent = buildTouchEvent({ type: 'touchmove', changedTouches: [touch] });
    const reactMouseEvent = buildReactMouseEvent<HTMLDivElement>({ clientX: 1, clientY: 2 });
    const reactPointerEvent = buildReactPointerEvent<HTMLDivElement>({ clientX: 3, clientY: 4 });
    const reactTouchEvent = buildReactTouchEvent({ touches: [touch] });

    keyboardEvent.preventDefault();
    mouseEvent.stopPropagation();
    threeEvent.stopPropagation();
    wheelEvent.preventDefault();

    expect(keyboardEvent.key).toBe('W');
    expect(keyboardEvent.ctrlKey).toBe(true);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(mouseEvent.clientX).toBe(5);
    expect(mouseEvent.clientY).toBe(8);
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(threeEvent.instanceId).toBe(3);
    expect(threeEvent.nativeEvent).toBe(mouseEvent);
    expect(threeEvent.stopPropagation).toHaveBeenCalledOnce();
    expect(wheelEvent.deltaY).toBe(-12);
    expect(wheelEvent.altKey).toBe(true);
    expect(wheelEvent.preventDefault).toHaveBeenCalledOnce();
    expect(touch.identifier).toBe(9);
    expect(Array.from(touchEvent.changedTouches)).toEqual([touch]);
    expect(reactMouseEvent.clientX).toBe(1);
    expect(reactPointerEvent.clientY).toBe(4);
    expect(reactTouchEvent.touches[0]).toBe(touch);
  });

  it('builds typed archive and drag/drop fakes for browser file tests', async () => {
    const file = buildReadableFile({ name: 'scene.zip', contents: 'zip' });
    const entry = buildArchiveEntry({ name: 'image.jpg', extract: vi.fn(async () => file) });
    const archive = buildArchiveReader({
      getFilesArray: vi.fn(async () => [{ file: entry, path: 'images/image.jpg' }]),
    });
    const fileSystemEntry = buildFileSystemEntry({ name: 'dataset' });
    const item = buildDataTransferItem({
      webkitGetAsEntry: vi.fn(() => fileSystemEntry),
    });
    const transfer = buildDataTransfer({ files: [file], items: [item] });

    await expect(entry.extract()).resolves.toBe(file);
    await expect(file.text()).resolves.toBe('zip');
    await expect(file.arrayBuffer()).resolves.toBeInstanceOf(ArrayBuffer);
    await expect(archive.getFilesArray()).resolves.toEqual([{ file: entry, path: 'images/image.jpg' }]);
    expect(fileSystemEntry.name).toBe('dataset');
    expect(transfer.types).toEqual(['Files']);
    expect(transfer.files.length).toBe(1);
    expect(transfer.files[0]).toBe(file);
    expect(transfer.files.item(0)).toBe(file);
    expect(transfer.items.length).toBe(1);
    expect(transfer.items[0].webkitGetAsEntry()).toBe(fileSystemEntry);
    expect(transfer.items.item(0)).toBe(item);
  });

  it('builds typed File System API entries and handles for scanning tests', async () => {
    const file = buildFile('photo.jpg');
    const fileEntry = buildFileSystemFileEntry({ name: 'photo.jpg', file });
    const directoryEntry = buildFileSystemDirectoryEntry({
      name: 'images',
      entryBatches: [[fileEntry], []],
    });
    const fileHandle = buildFileSystemFileHandle({ name: 'photo.jpg', file });
    const directoryHandle = buildFileSystemDirectoryHandle({
      name: 'images',
      entries: [fileHandle],
    });

    const callbackFile = await new Promise<File>((resolve) => fileEntry.file(resolve));
    const directoryReader = directoryEntry.createReader();
    const firstBatch = await new Promise<FileSystemEntry[]>((resolve) => directoryReader.readEntries(resolve));
    const secondBatch = await new Promise<FileSystemEntry[]>((resolve) => directoryReader.readEntries(resolve));
    const handleEntries = [];
    for await (const entry of directoryHandle.values()) {
      handleEntries.push(entry);
    }

    expect(callbackFile).toBe(file);
    expect(firstBatch).toEqual([fileEntry]);
    expect(secondBatch).toEqual([]);
    expect(await fileHandle.getFile()).toBe(file);
    expect(handleEntries).toEqual([fileHandle]);
  });

  it('builds readable binary Blob and File fixtures', async () => {
    const contents = new Uint8Array([1, 2, 3]);
    const blob = buildReadableBinaryBlob({ contents, type: 'image/jpeg' });
    const file = buildReadableBinaryFile({ name: 'photo.jpg', contents, type: 'image/jpeg' });

    contents.fill(9);

    expect(blob.type).toBe('image/jpeg');
    expect(file.name).toBe('photo.jpg');
    expect(new Uint8Array(await readBlobAsArrayBuffer(blob))).toEqual(new Uint8Array([1, 2, 3]));
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('copies byte views into standalone ArrayBuffers', () => {
    const source = new Uint8Array([1, 2, 3]);
    const buffer = copyBytesToArrayBuffer(source);

    source.fill(9);

    expect(buffer).toBeInstanceOf(ArrayBuffer);
    expect(new Uint8Array(buffer)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('builds a WASM reconstruction wrapper fake with typed-array accessors', () => {
    const positions = new Float32Array([1, 2, 3]);
    const point3DIds = new BigUint64Array([42n]);
    const points2D = [buildPoint2D({ point3DId: 42n })];
    const getImagePoints2DArray = vi.fn(() => points2D);
    const wrapper = buildWasmReconstructionWrapper({
      positions,
      point3DIds,
      errors: new Float32Array([0.5]),
      trackLengths: new Uint32Array([2]),
      trackOffsets: new Uint32Array([0, 1]),
      trackImageIds: new Uint32Array([3]),
      trackPoint2DIdxs: new Uint32Array([4]),
      getImagePoints2DArray,
    });

    expect(wrapper.pointCount).toBe(1);
    expect(wrapper.getPositions()).toBe(positions);
    expect(wrapper.getPoint3DIds()).toBe(point3DIds);
    expect(wrapper.getErrors()?.[0]).toBe(0.5);
    expect(wrapper.getTrackLengths()?.[0]).toBe(2);
    expect(wrapper.getTrackOffsets()?.[1]).toBe(1);
    expect(wrapper.getTrackImageIds()?.[0]).toBe(3);
    expect(wrapper.getTrackPoint2DIdxs()?.[0]).toBe(4);
    expect(wrapper.getImagePoints2DArray(9)).toBe(points2D);
    expect(getImagePoints2DArray).toHaveBeenCalledWith(9);
  });

  it('resolves Node WASM factory exports and builds camera/image maps', () => {
    const factory = vi.fn(async () => {
      throw new Error('not used by this test');
    });

    expect(resolveColmapWasmFactory(factory)).toBe(factory);
    expect(resolveColmapWasmFactory({ default: factory })).toBe(factory);
    expect(() => resolveColmapWasmFactory({})).toThrow(
      'Expected colmap_wasm module to export a factory function',
    );

    const { cameras, images } = buildWasmCameraImageMaps({
      getAllCameras: () => ({
        7: {
          cameraId: 7,
          modelId: CameraModelId.PINHOLE,
          width: 800,
          height: 600,
          params: [500, 501, 400, 300],
        },
      }),
      getAllImageInfos: () => [
        {
          imageId: 9,
          cameraId: 7,
          name: 'frame.jpg',
          quaternion: [0.5, 0.5, 0.5, 0.5],
          translation: [1, 2, 3],
        },
      ],
    });

    expect(cameras.get(7)).toEqual({
      cameraId: 7,
      modelId: CameraModelId.PINHOLE,
      width: 800,
      height: 600,
      params: [500, 501, 400, 300],
    });
    expect(images.get(9)).toEqual({
      imageId: 9,
      qvec: [0.5, 0.5, 0.5, 0.5],
      tvec: [1, 2, 3],
      cameraId: 7,
      name: 'frame.jpg',
      points2D: [],
    });
  });
});
