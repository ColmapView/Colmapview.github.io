import { MEDIA_PRIORITY_ORDER, type FileRequestContext } from '../../utils/imageFileRequestState';

type VideoDecodeContext = Pick<FileRequestContext, 'signal' | 'getPriority' | 'hasPriority'>;

interface Job {
  context: VideoDecodeContext;
  run(): Promise<File | null>;
  resolve(value: File | null): void;
  reject(error: unknown): void;
  cancel(): void;
  interrupt?: () => void;
}

/** One decoder job at a time bounds software-decoder memory and CPU on phones. */
export function createVideoFrameQueue() {
  const jobs: Job[] = [];
  let active: Job | undefined, dispatches = 0;
  const interruptPlayback = () => {
    const interrupt = active?.interrupt;
    if (active) active.interrupt = undefined;
    interrupt?.();
  };
  const foreground = (job: Job) => !job.interrupt && (['selected', 'metric'].includes(job.context.getPriority()) || job.context.hasPriority?.('metric'));
  const drain = () => {
    if (active || !jobs.length) return;
    let next = 0;
    if (++dispatches % 8) {
      for (let index = 1; index < jobs.length; index++) {
        if (MEDIA_PRIORITY_ORDER[jobs[index].context.getPriority()] < MEDIA_PRIORITY_ORDER[jobs[next].context.getPriority()]) next = index;
      }
    }
    // A long recording must not hold up an export/metric already waiting for stills.
    if (jobs[next].interrupt) {
      const required = jobs.findIndex(foreground);
      if (required >= 0) next = required;
    }
    const [job] = jobs.splice(next, 1);
    job.context.signal.removeEventListener('abort', job.cancel);
    if (job.context.signal.aborted) { job.resolve(null); drain(); return; }
    active = job;
    void job.run().then(job.resolve, job.reject).finally(() => { active = undefined; drain(); });
  };
  const enqueue = (context: VideoDecodeContext, run: Job['run'], interrupt?: () => void): Promise<File | null> => new Promise((resolve, reject) => {
    const job: Job = { context, run, resolve, reject, interrupt, cancel() {
      const index = jobs.indexOf(job);
      if (index >= 0) jobs.splice(index, 1);
      resolve(null);
    } };
    if (context.signal.aborted) { resolve(null); return; }
    if (foreground(job)) interruptPlayback();
    context.signal.addEventListener('abort', job.cancel, { once: true });
    jobs.push(job); drain();
  });
  return {
    read: (context: VideoDecodeContext, run: Job['run']) => enqueue(context, run),
    playback: (context: VideoDecodeContext, run: Job['run'], interrupt: () => void) => enqueue(context, run, interrupt),
    interruptPlayback,
  };
}

const queue = createVideoFrameQueue();
export const queueVideoFrame = queue.read;
export const queueVideoPlayback = queue.playback;
export const interruptVideoPlayback = queue.interruptPlayback;
