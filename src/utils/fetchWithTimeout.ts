/** Maximum inactivity while waiting for headers or the next body chunk. */
export const FETCH_TIMEOUT = 30_000;

/** Fetch with caller cancellation and an inactivity timeout covering the body. */
export async function fetchWithTimeout(
  url: string,
  timeout = FETCH_TIMEOUT,
  init: RequestInit = {}
): Promise<Response> {
  const controller = new AbortController();
  const signal = init.signal;
  signal?.throwIfAborted();
  let timer: ReturnType<typeof setTimeout>;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let bodyController: ReadableStreamDefaultController<Uint8Array> | undefined;
  let finished = false;

  const resetTimer = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      controller.abort(new DOMException('Request timed out', 'TimeoutError'));
    }, timeout);
  };
  const cancel = () => controller.abort(signal?.reason);
  const cleanup = () => {
    finished = true;
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
    controller.signal.removeEventListener('abort', abortBody);
  };
  const abortBody = () => {
    bodyController?.error(controller.signal.reason);
    void reader?.cancel(controller.signal.reason).catch(() => {});
    cleanup();
  };
  controller.signal.addEventListener('abort', abortBody, { once: true });
  signal?.addEventListener('abort', cancel, { once: true });
  resetTimer();

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (controller.signal.aborted) {
      void response.body?.cancel().catch(() => {});
      controller.signal.throwIfAborted();
    }
    if (!response.body) {
      cleanup();
      return response;
    }
    reader = response.body.getReader();
    resetTimer();
    const body = new ReadableStream<Uint8Array>({
      start(streamController) {
        bodyController = streamController;
      },
      async pull(streamController) {
        try {
          const { done, value } = await reader!.read();
          if (finished) return;
          if (done) {
            cleanup();
            streamController.close();
          } else {
            resetTimer();
            streamController.enqueue(value);
          }
        } catch (error) {
          if (finished) return;
          cleanup();
          streamController.error(error);
        }
      },
      cancel(reason) {
        cleanup();
        controller.abort(reason);
        return reader!.cancel(reason);
      },
    }, { highWaterMark: 0 });
    const result = new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
    // A reconstructed Response otherwise loses redirect/source metadata.
    Object.defineProperties(result, {
      url: { value: response.url },
      redirected: { value: response.redirected },
      type: { value: response.type },
    });
    return result;
  } catch (error) {
    cleanup();
    throw error;
  }
}
