import { MEDIA_PRIORITY_ORDER, type FileRequestContext } from '../../utils/imageFileRequestState';

interface Job {
  context: FileRequestContext;
  run(): Promise<File | null>;
  resolve(value: File | null): void;
  reject(error: unknown): void;
  cancel(): void;
}

/** One decoder job at a time bounds software-decoder memory and CPU on phones. */
export function createVideoFrameQueue() {
  const jobs: Job[] = [];
  let running = false, dispatches = 0;
  const drain = () => {
    if (running || !jobs.length) return;
    let next = 0;
    if (++dispatches % 8) {
      for (let index = 1; index < jobs.length; index++) {
        if (MEDIA_PRIORITY_ORDER[jobs[index].context.getPriority()] < MEDIA_PRIORITY_ORDER[jobs[next].context.getPriority()]) next = index;
      }
    }
    const [job] = jobs.splice(next, 1);
    job.context.signal.removeEventListener('abort', job.cancel);
    if (job.context.signal.aborted) { job.resolve(null); drain(); return; }
    running = true;
    void job.run().then(job.resolve, job.reject).finally(() => { running = false; drain(); });
  };
  return (context: FileRequestContext, run: Job['run']): Promise<File | null> => new Promise((resolve, reject) => {
    const job: Job = { context, run, resolve, reject, cancel() {
      const index = jobs.indexOf(job);
      if (index >= 0) jobs.splice(index, 1);
      resolve(null);
    } };
    if (context.signal.aborted) { resolve(null); return; }
    context.signal.addEventListener('abort', job.cancel, { once: true });
    jobs.push(job); drain();
  });
}

export const queueVideoFrame = createVideoFrameQueue();
