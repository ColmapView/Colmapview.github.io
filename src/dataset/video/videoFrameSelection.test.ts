import { afterEach, expect, it, vi } from 'vitest';
import { EncodedPacketSink } from 'mediabunny';
import { createVideoInput, readVideoTrack } from './videoInput';
import { createVideoFrameResolver, indexVideoTrack, MAX_VIDEO_INDEX_FRAMES, readVideoPresentationIndex, resolveCameraVideoFrame } from './videoFrameSelection';
import type { VideoImageBinding } from './types';

vi.mock('./videoInput', () => ({ createVideoInput: vi.fn(), readVideoTrack: vi.fn() }));
vi.mock('mediabunny', () => ({ EncodedPacketSink: vi.fn() }));
const binding: VideoImageBinding = { url: 'https://media.test/camera.mp4', bytes: 1000, width: 64, height: 80, frameIndex: 1 };
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, failed) => { resolve = done; reject = failed; });
  return { promise, resolve, reject };
}
afterEach(() => vi.resetAllMocks());

it('indexes metadata in presentation order with variable durations and disposes the reader', async () => {
  const dispose = vi.fn(), packets = vi.fn(async function* () {
    for (const timestamp of [2.5, 0.25, 1]) yield { timestamp, duration: 0.5 };
  });
  vi.mocked(createVideoInput).mockReturnValue({ input: {} as never, dispose });
  vi.mocked(readVideoTrack).mockResolvedValue({ track: {} as never, duration: 3 });
  vi.mocked(EncodedPacketSink).mockImplementation(function () { return { packets } as never; });
  expect([...await readVideoPresentationIndex(binding, new AbortController().signal)]).toEqual([0.25, 1, 2.5]);
  expect(packets).toHaveBeenCalledWith(undefined, undefined, { metadataOnly: true });
  expect(dispose).toHaveBeenCalledOnce();
});

it('rejects duplicate presentation times instead of guessing a displayed-frame index', async () => {
  const dispose = vi.fn();
  vi.mocked(createVideoInput).mockReturnValue({ input: {} as never, dispose });
  vi.mocked(readVideoTrack).mockResolvedValue({ track: {} as never, duration: 3 });
  vi.mocked(EncodedPacketSink).mockImplementation(function () { return { packets: async function* () {
    yield { timestamp: 1, duration: 1 }; yield { timestamp: 1, duration: 1 };
  } } as never; });
  await expect(readVideoPresentationIndex(binding, new AbortController().signal)).rejects.toThrow('duplicate');
  expect(dispose).toHaveBeenCalledOnce();
});

it('shares one index across image names, indices and playback rates, without using average FPS', async () => {
  const read = vi.fn(async () => new Float64Array([0.25, 1, 2.5]));
  const owner = new AbortController(), resolve = createVideoFrameResolver(owner.signal, read);
  const [first, second] = await Promise.all([resolve(binding, owner.signal), resolve({ ...binding, frameIndex: 2, playbackRate: 30 }, owner.signal)]);
  expect(first.timestamp).toBe(1); expect(second.timestamp).toBe(2.5); expect(second.playbackRate).toBe(30);
  expect(first).not.toHaveProperty('frameIndex'); expect(read).toHaveBeenCalledOnce();
  await expect(resolve({ ...binding, frameIndex: 3 }, owner.signal)).rejects.toThrow('outside');
  await expect(resolve({ ...binding, frameIndex: 0 }, owner.signal)).resolves.toHaveProperty('timestamp', 0.25);
  owner.abort(); await expect(resolve(binding, new AbortController().signal)).rejects.toThrow();
});

it('preserves a shared read when one consumer aborts and cancels it when the last leaves', async () => {
  const pending = deferred<Float64Array>();
  const read = vi.fn((_binding: VideoImageBinding, signal: AbortSignal) => {
    signal.addEventListener('abort', () => pending.reject(signal.reason)); return pending.promise;
  });
  const owner = new AbortController(), resolve = createVideoFrameResolver(owner.signal, read);
  const a = new AbortController(), b = new AbortController();
  const first = resolve(binding, a.signal), second = resolve(binding, b.signal);
  await vi.waitFor(() => expect(read).toHaveBeenCalledOnce());
  a.abort(); await expect(first).rejects.toThrow(); expect(read.mock.calls[0][1].aborted).toBe(false);
  b.abort(); await expect(second).rejects.toThrow(); expect(read.mock.calls[0][1].aborted).toBe(true);
  owner.abort();
});

it('keeps timestamp sources lazy and uses the scene resolver for frame-based playback', async () => {
  const read = vi.fn(), owner = new AbortController(), resolve = createVideoFrameResolver(owner.signal, read);
  const timed = { url: binding.url, bytes: binding.bytes, width: 64, height: 80, timestamp: 240, playbackRate: 30 };
  expect((await resolve(timed, owner.signal)).timestamp).toBe(240); expect(read).not.toHaveBeenCalled();
  const resolveFrame = vi.fn(async () => timed);
  expect(await resolveCameraVideoFrame({ ...binding, signal: owner.signal, resolveFrame }, owner.signal)).toBe(timed);
  expect(resolveFrame).toHaveBeenCalledOnce(); owner.abort();
});

it('counts a frame spanning zero once and excludes earlier decode preroll', async () => {
  vi.mocked(EncodedPacketSink).mockImplementation(function () { return { packets: async function* () {
    yield { timestamp: -1, duration: 0.5 }; yield { timestamp: -0.25, duration: 0.5 };
    yield { timestamp: 0.25, duration: 0.5 };
  } } as never; });
  expect([...await indexVideoTrack({} as never, new AbortController().signal)]).toEqual([0, 0.25]);
});

it('stops oversized metadata indices instead of retaining an unbounded frame table', async () => {
  vi.mocked(EncodedPacketSink).mockImplementation(function () { return { packets: async function* () {
    for (let index = 0; index <= MAX_VIDEO_INDEX_FRAMES; index++) yield { timestamp: index, duration: 1 };
  } } as never; });
  await expect(indexVideoTrack({} as never, new AbortController().signal)).rejects.toThrow('frame budget');
});

it('evicts completed source indices when the source limit is reached and permits retry after failure', async () => {
  const read = vi.fn(async () => new Float64Array([0, 1]));
  const owner = new AbortController(), resolve = createVideoFrameResolver(owner.signal, read);
  for (let source = 0; source < 33; source++) await resolve({ ...binding, url: `https://media.test/${source}.mp4` }, owner.signal);
  expect(read).toHaveBeenCalledTimes(33);
  await resolve({ ...binding, url: 'https://media.test/0.mp4' }, owner.signal);
  expect(read).toHaveBeenCalledTimes(34);
  read.mockRejectedValueOnce(new Error('temporary read failure'));
  await expect(resolve(binding, owner.signal)).rejects.toThrow('temporary');
  await expect(resolve(binding, owner.signal)).resolves.toHaveProperty('timestamp', 1);
  owner.abort();
});
