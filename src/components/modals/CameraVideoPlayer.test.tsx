import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import CameraVideoPlayer from './CameraVideoPlayer';
import { loadCachedCameraVideo } from '../../dataset/video/cachedCameraVideo';

vi.mock('../../dataset/video/cachedCameraVideo', () => ({ loadCachedCameraVideo: vi.fn() }));
let complete: (value: { duration: number; dispose: () => Promise<void> }) => void;
let playing: WeakSet<HTMLMediaElement>;
beforeEach(() => {
  playing = new WeakSet();
  vi.mocked(loadCachedCameraVideo).mockImplementation(() => new Promise(resolve => { complete = resolve; }));
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
    playing.add(this); this.dispatchEvent(new Event('play')); return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) { playing.delete(this); this.dispatchEvent(new Event('pause')); });
  vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get').mockImplementation(function (this: HTMLMediaElement) { return !playing.has(this); });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); });
const source = { url: 'https://media.test/camera.mp4', bytes: 1000, timestamp: 240, width: 800, height: 1280, signal: new AbortController().signal };
const layout = { renderedImageWidth: 300, renderedImageHeight: 480, width: 300, height: 480, offsetX: 20, offsetY: 5, scaleX: 0.375, scaleY: 0.375 };
const props = { source, name: '0028.png', poster: 'blob:matched-still', layout, onClose: vi.fn() };

it('does not present an unresolved frame index as a source timestamp', () => {
  render(<CameraVideoPlayer {...props} source={{ url: source.url, bytes: source.bytes, width: source.width,
    height: source.height, frameIndex: 240, signal: source.signal }} />);
  expect(screen.getByRole('button', { name: 'Back to matched frame' }).title).not.toMatch(/\d+:\d+/);
});

it('loads once and retains the cached clip across pause, resume, fractional seeks and image resizing', async () => {
  const dispose = vi.fn(async () => {}), view = render(<CameraVideoPlayer {...props} />);
  expect(screen.getByRole('status')).toHaveTextContent('Loading video');
  expect(screen.getByRole('button', { name: 'Play video' })).toBeDisabled();
  const options = vi.mocked(loadCachedCameraVideo).mock.calls[0][2];
  act(() => complete({ duration: 476, dispose }));
  await screen.findByRole('button', { name: 'Pause video' });
  fireEvent.click(screen.getByRole('button', { name: 'Pause video' }));
  expect(options.signal.aborted).toBe(false);
  fireEvent.change(screen.getByRole('slider'), { target: { value: '250.8' } });
  expect((screen.getByLabelText('Video frame 0028.png') as HTMLVideoElement).currentTime).toBe(250.8);
  fireEvent.click(screen.getByRole('button', { name: 'Play video' }));
  view.rerender(<CameraVideoPlayer {...props} layout={{ ...layout, renderedImageWidth: 250, renderedImageHeight: 400 }} />);
  expect(loadCachedCameraVideo).toHaveBeenCalledOnce(); expect(dispose).not.toHaveBeenCalled();
  view.unmount(); expect(options.signal.aborted).toBe(true); expect(dispose).toHaveBeenCalledOnce();
});

it('pauses a hidden tab while retaining the cache and never resumes automatically', async () => {
  const dispose = vi.fn(async () => {});
  render(<CameraVideoPlayer {...props} />);
  act(() => complete({ duration: 476, dispose }));
  await screen.findByRole('button', { name: 'Pause video' });
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  fireEvent(document, new Event('visibilitychange'));
  hidden.mockReturnValue(false); fireEvent(document, new Event('visibilitychange'));
  expect(screen.getByRole('button', { name: 'Play video' })).toBeVisible();
  expect(dispose).not.toHaveBeenCalled(); expect(loadCachedCameraVideo).toHaveBeenCalledOnce();
});

it('does not autoplay a download completed after the tab became hidden', async () => {
  render(<CameraVideoPlayer {...props} />);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  fireEvent(document, new Event('visibilitychange'));
  act(() => complete({ duration: 476, dispose: vi.fn(async () => {}) }));
  await waitFor(() => expect(screen.getByRole('slider')).toBeEnabled());
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
});

it('aborts preparation and disposes a result that arrives after unmount or scene disposal', async () => {
  const dispose = vi.fn(async () => {}), lifetime = new AbortController();
  const view = render(<CameraVideoPlayer {...props} source={{ ...source, signal: lifetime.signal }} />);
  const options = vi.mocked(loadCachedCameraVideo).mock.calls[0][2];
  act(() => lifetime.abort()); expect(options.signal.aborted).toBe(true);
  view.unmount();
  await act(async () => complete({ duration: 476, dispose }));
  expect(dispose).toHaveBeenCalledOnce(); expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
});
