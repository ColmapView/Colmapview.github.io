import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import CameraVideoPlayer from './CameraVideoPlayer';
import { playCameraVideo } from '../../dataset/video/videoPlayback';

vi.mock('../../dataset/video/videoPlayback', () => ({ playCameraVideo: vi.fn(() => new Promise<void>(() => {})) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
const source = { url: 'https://media.test/camera.mp4', bytes: 1000, timestamp: 240, width: 800, height: 1280, signal: new AbortController().signal };

it('pauses immediately, ignores obsolete callbacks, seeks and releases work on unmount', async () => {
  const view = render(<CameraVideoPlayer source={source} name="0028.png" onClose={vi.fn()} />);
  const first = vi.mocked(playCameraVideo).mock.calls[0][2];
  fireEvent.click(screen.getByRole('button', { name: 'Pause video' }));
  expect(first.signal.aborted).toBe(true);
  first.onReady(999); first.onFrame(800);
  expect(screen.getByRole('slider')).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Play video' }));
  await waitFor(() => expect(playCameraVideo).toHaveBeenCalledTimes(2));
  const second = vi.mocked(playCameraVideo).mock.calls[1][2];
  act(() => second.onReady(476));
  fireEvent.change(screen.getByRole('slider'), { target: { value: '250' } });
  expect(second.signal.aborted).toBe(true);
  await waitFor(() => expect(playCameraVideo).toHaveBeenCalledTimes(3));
  const third = vi.mocked(playCameraVideo).mock.calls[2][2];
  expect(third.timestamp).toBe(250);
  view.unmount();
  expect(third.signal.aborted).toBe(true);
});

it('pauses on a hidden tab without automatically resuming or keeping the session alive', async () => {
  render(<CameraVideoPlayer source={source} name="0028.png" onClose={vi.fn()} />);
  const session = vi.mocked(playCameraVideo).mock.calls[0][2];
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  fireEvent(document, new Event('visibilitychange'));
  expect(session.signal.aborted).toBe(true);
  hidden.mockReturnValue(false);
  fireEvent(document, new Event('visibilitychange'));
  expect(screen.getByRole('button', { name: 'Play video' })).toBeVisible();
  expect(playCameraVideo).toHaveBeenCalledOnce();
  hidden.mockRestore();
});

it('releases the player when its scene owner is disposed', () => {
  const lifetime = new AbortController();
  render(<CameraVideoPlayer source={{ ...source, signal: lifetime.signal }} name="0028.png" onClose={vi.fn()} />);
  const session = vi.mocked(playCameraVideo).mock.calls[0][2];
  act(() => lifetime.abort());
  expect(session.signal.aborted).toBe(true);
  expect(screen.getByRole('button', { name: 'Play video' })).toBeVisible();
});
