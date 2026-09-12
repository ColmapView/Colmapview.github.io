import { afterEach, describe, expect, it, vi } from 'vitest';
import { TrainingImageWorkerPool } from './trainingImageWorkerPool';
import type { TrainingImageRequest, TrainingImageResponse } from './trainingImagePolicy';

class FakeWorker {
  onmessage: ((event: MessageEvent<TrainingImageResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  postMessage = vi.fn<(message: TrainingImageRequest) => void>();
  terminate = vi.fn();
  send(data: TrainingImageResponse) { this.onmessage?.({ data } as MessageEvent<TrainingImageResponse>); }
  complete() {
    const request = this.postMessage.mock.lastCall![0];
    this.send({ type: 'encoded', attemptId: request.attemptId, taskId: request.taskId,
      blob: new Blob(['jpeg'], { type: 'image/jpeg' }), width: 1, height: 1, elapsedMs: 1 });
  }
}

const pools: TrainingImageWorkerPool[] = [];
function fixture(size = 2) {
  const workers: FakeWorker[] = [];
  const pool = new TrainingImageWorkerPool(size, () => {
    const worker = new FakeWorker(); workers.push(worker); return worker as unknown as Worker;
  });
  pools.push(pool);
  return { pool, workers };
}
afterEach(() => { for (const pool of pools.splice(0)) pool.dispose(); });

describe('bounded image worker lifecycle', () => {
  it('uses idle capacity and releases queued work without exceeding the worker limit', async () => {
    const { pool, workers } = fixture();
    const first = pool.encode(new Blob(), 'jpeg-q90', 'attempt');
    workers[0].send({ type: 'ready' });
    const second = pool.encode(new Blob(), 'jpeg-q90', 'attempt');
    expect(workers).toHaveLength(2);
    workers[1].send({ type: 'ready' });
    const third = pool.encode(new Blob(), 'jpeg-q90', 'attempt');
    expect(pool.inspect()).toMatchObject({ active: 2, queued: 1, workers: 2 });
    workers[0].complete();
    workers[1].complete();
    workers[0].complete();
    expect(await Promise.all([first, second, third])).toHaveLength(3);
    expect(pool.inspect()).toMatchObject({ active: 0, queued: 0, workers: 2 });
  });

  it('returns unsupported work to fallback once and never respawns a failed capability', async () => {
    const { pool, workers } = fixture(1);
    const task = pool.encode(new Blob(), 'jpeg-q90', 'attempt');
    workers[0].send({ type: 'unavailable' });
    expect(await task).toBeNull();
    expect(await pool.encode(new Blob(), 'jpeg-q90', 'attempt')).toBeNull();
    expect(workers).toHaveLength(1);
    expect(workers[0].terminate).toHaveBeenCalledOnce();
  });

  it('terminates cancelled active work before reusing its slot and ignores old replies', async () => {
    const { pool, workers } = fixture(1);
    const abort = new AbortController();
    const first = pool.encode(new Blob(), 'jpeg-q90', 'old', abort.signal);
    const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    workers[0].send({ type: 'ready' });
    const second = pool.encode(new Blob(), 'jpeg-q90', 'new');
    abort.abort();
    await rejected;
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(workers).toHaveLength(2);
    workers[0].complete();
    workers[1].send({ type: 'ready' });
    workers[1].complete();
    expect(await second).toBeInstanceOf(Blob);
  });

  it('rejects corrupt data without falling back or poisoning the next image', async () => {
    const { pool, workers } = fixture(1);
    const first = pool.encode(new Blob(), 'jpeg-q90', 'attempt');
    const rejected = expect(first).rejects.toThrow('Corrupt image');
    workers[0].send({ type: 'ready' });
    const request = workers[0].postMessage.mock.lastCall![0];
    workers[0].send({ type: 'error', taskId: request.taskId, attemptId: request.attemptId, message: 'Corrupt image' });
    await rejected;
    const next = pool.encode(new Blob(), 'jpeg-q90', 'attempt');
    workers[0].complete();
    expect(await next).toBeInstanceOf(Blob);
    expect(workers).toHaveLength(1);
  });
});
