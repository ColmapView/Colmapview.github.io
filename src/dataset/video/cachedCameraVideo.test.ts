import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { Input } from 'mediabunny';
import { downloadZip, releaseArchiveDownload } from '../../utils/zipDownload';
import { loadCachedCameraVideo } from './cachedCameraVideo';
import { MAX_CACHED_VIDEO_BYTES } from './types';
import { prepareCompatibleCameraVideo } from './prepareCompatibleCameraVideo';
import { retimeCameraVideo } from './retimeCameraVideo';
import { createCameraVideoCache } from './cameraVideoCache';

vi.mock('../../utils/zipDownload', () => ({ downloadZip: vi.fn(), releaseArchiveDownload: vi.fn(async () => {}) }));
vi.mock('./videoInput', () => ({ readVideoTrack: vi.fn(async () => ({ duration: 2,
  track: { getDecoderConfig: async () => ({ codec: 'avc1.64001f' }) } })) }));
vi.mock('./prepareCompatibleCameraVideo', () => ({ prepareCompatibleCameraVideo: vi.fn() }));
vi.mock('./retimeCameraVideo', () => ({ retimeCameraVideo: vi.fn() }));
vi.mock('mediabunny', () => ({ BlobSource: vi.fn(), MP4: {}, WEBM: {}, Input: vi.fn() }));
const source = { url: 'https://media.test/video.mp4', bytes: 3, timestamp: 1, width: 64, height: 80, signal: new AbortController().signal };
let nextURL: number;
beforeEach(() => {
  nextURL = 0;
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = vi.fn(() => `blob:video-${++nextURL}`);
    static revokeObjectURL = vi.fn();
  });
  vi.mocked(Input).mockImplementation(function () { return {
    getPrimaryVideoTrack: async () => ({ getDecoderConfig: async () => ({ codec: 'avc1.64001f' }) }),
    getFormat: async () => ({ mimeType: 'video/mp4' }), dispose: vi.fn(),
  } as unknown as Input; });
  vi.mocked(downloadZip).mockResolvedValue(new Blob(['123']));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.clearAllMocks(); });
function video() {
  const element = document.createElement('video'); let time = 0;
  vi.spyOn(element, 'load').mockImplementation(() => { if (element.hasAttribute('src')) queueMicrotask(() => element.dispatchEvent(new Event('loadeddata'))); });
  vi.spyOn(element, 'pause').mockImplementation(() => {});
  vi.spyOn(element, 'canPlayType').mockReturnValue('probably');
  Object.defineProperty(element, 'currentTime', { get: () => time, set: value => { time = value; queueMicrotask(() => element.dispatchEvent(new Event('seeked'))); } });
  return element;
}

it('downloads once with exact byte verification, seeks the cached file and releases it with its owner', async () => {
  const element = video(), owner = new AbortController();
  const result = await loadCachedCameraVideo(source, element, { signal: owner.signal, onProgress: vi.fn() });
  expect(downloadZip).toHaveBeenCalledExactlyOnceWith(source.url, expect.any(Function), expect.objectContaining({ expectedSize: 3, sizeLimit: MAX_CACHED_VIDEO_BYTES }));
  expect(result.duration).toBe(2); expect(element.currentTime).toBe(1); expect(element.src).toBe('blob:video-1');
  owner.abort(); await result.dispose();
  expect(element.hasAttribute('src')).toBe(false); expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:video-1');
  expect(releaseArchiveDownload).toHaveBeenCalledOnce();
});

it('uses the same resolved source frame for indexed playback', async () => {
  const element = video(), owner = new AbortController();
  const { timestamp: _timestamp, ...recording } = source;
  const resolveFrame = vi.fn(async () => ({ ...source, timestamp: 1 }));
  const result = await loadCachedCameraVideo({ ...recording, frameIndex: 17, resolveFrame }, element,
    { signal: owner.signal, onProgress: vi.fn() });
  expect(resolveFrame).toHaveBeenCalledOnce(); expect(element.currentTime).toBe(1);
  await result.dispose();
});

it('converts an unsupported clip once without another download', async () => {
  const element = video(); vi.mocked(element.canPlayType).mockReturnValue('');
  vi.mocked(prepareCompatibleCameraVideo).mockResolvedValue(new Blob(['converted']));
  const result = await loadCachedCameraVideo(source, element, { signal: new AbortController().signal, onProgress: vi.fn() });
  expect(prepareCompatibleCameraVideo).toHaveBeenCalledOnce(); expect(downloadZip).toHaveBeenCalledOnce();
  expect(releaseArchiveDownload).not.toHaveBeenCalled();
  expect(element.currentTime).toBe(1); await result.dispose();
  expect(releaseArchiveDownload).toHaveBeenCalledOnce();
});

it('retries an advertised but undecodable source with the cached compatibility conversion', async () => {
  const element = video();
  vi.mocked(element.load).mockImplementationOnce(() => { queueMicrotask(() => element.dispatchEvent(new Event('error'))); });
  vi.mocked(prepareCompatibleCameraVideo).mockResolvedValue(new Blob(['converted']));
  const result = await loadCachedCameraVideo(source, element, { signal: new AbortController().signal, onProgress: vi.fn() });
  expect(downloadZip).toHaveBeenCalledOnce(); expect(prepareCompatibleCameraVideo).toHaveBeenCalledOnce();
  expect(URL.createObjectURL).toHaveBeenCalledTimes(2); await result.dispose();
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
});

it('does not fetch when the player closes in the same turn as mounting', async () => {
  const owner = new AbortController();
  const pending = loadCachedCameraVideo(source, video(), { signal: owner.signal, onProgress: vi.fn() });
  owner.abort(); await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(downloadZip).not.toHaveBeenCalled();
});

it('cancels a pending media load and releases the downloaded file instead of hanging', async () => {
  const element = video(), owner = new AbortController();
  vi.mocked(element.load).mockImplementation(() => {});
  const pending = loadCachedCameraVideo(source, element, { signal: owner.signal, onProgress: vi.fn() });
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await vi.waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled()); owner.abort(); await rejected;
  expect(releaseArchiveDownload).toHaveBeenCalledOnce(); expect(element.hasAttribute('src')).toBe(false);
});

it('rejects an oversized video before a network request', async () => {
  await expect(loadCachedCameraVideo({ ...source, bytes: MAX_CACHED_VIDEO_BYTES + 1 }, video(), { signal: new AbortController().signal, onProgress: vi.fn() })).rejects.toThrow('256 MiB');
  expect(downloadZip).not.toHaveBeenCalled();
});

it.each(['native', 'converted'])('uses declared playback timing for %s playback, leaving the source binding unchanged', async mode => {
  const retimed = new Blob(['retimed']), binding = { ...source, playbackRate: 30 };
  vi.mocked(retimeCameraVideo).mockResolvedValue(retimed);
  vi.mocked(prepareCompatibleCameraVideo).mockResolvedValue(new Blob(['converted']));
  const element = video();
  if (mode === 'converted') vi.mocked(element.canPlayType).mockReturnValue('');
  const result = await loadCachedCameraVideo(binding, element, { signal: new AbortController().signal, onProgress: vi.fn() });
  expect(result.duration).toBeCloseTo(2 / 30); expect(element.currentTime).toBeCloseTo(1 / 30);
  expect(binding.timestamp).toBe(1);
  expect(retimeCameraVideo).toHaveBeenCalledOnce();
  if (mode === 'converted') expect(prepareCompatibleCameraVideo).toHaveBeenCalledWith(retimed, binding, 2 / 30, expect.any(AbortSignal), expect.any(Function));
  else expect(prepareCompatibleCameraVideo).not.toHaveBeenCalled();
  expect(downloadZip).toHaveBeenCalledOnce(); expect(releaseArchiveDownload).not.toHaveBeenCalled();
  await result.dispose(); expect(releaseArchiveDownload).toHaveBeenCalledOnce();
});

it('reuses the cached compatibility conversion after navigation instead of downloading or transcoding again', async () => {
  const cache = createCameraVideoCache(), first = video(), second = video();
  vi.mocked(first.canPlayType).mockReturnValue(''); vi.mocked(second.canPlayType).mockReturnValue('');
  vi.mocked(prepareCompatibleCameraVideo).mockResolvedValue(new Blob(['converted']));
  const options = { signal: new AbortController().signal, onProgress: vi.fn(), cache };
  const a = await loadCachedCameraVideo(source, first, options); await a.dispose();
  const b = await loadCachedCameraVideo(source, second, options); await b.dispose();
  expect(downloadZip).toHaveBeenCalledOnce(); expect(prepareCompatibleCameraVideo).toHaveBeenCalledOnce();
  expect(second.currentTime).toBe(1); expect(releaseArchiveDownload).not.toHaveBeenCalled();
  await cache.clear(); expect(releaseArchiveDownload).toHaveBeenCalledOnce();
});
