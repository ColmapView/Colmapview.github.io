import { ReconstructionAuthority } from './reconstructionAuthority';
import { isReconstructionRequest, reconstructionResultTransfers, type ReconstructionResponse } from './reconstructionProtocol';

const authority = new ReconstructionAuthority();
let generation: number | null = null;
let queue = Promise.resolve();
const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage: (message: ReconstructionResponse, transfer?: ArrayBuffer[]) => void;
};

workerScope.onmessage = event => {
  const request = event.data;
  if (!isReconstructionRequest(request)) return;
  if (generation !== null && generation !== request.generation) return;
  generation = request.generation;
  // Serialize edits/exports with observation access; embind memory must have exactly one active owner.
  queue = queue.then(async () => {
    const envelope = { requestId: request.requestId, generation: request.generation, operation: request.operation };
    try {
      const result = await authority.execute(request, phase => workerScope.postMessage({ ...envelope, type: 'progress', phase }));
      workerScope.postMessage({ ...envelope, type: 'result', result }, reconstructionResultTransfers(result));
    } catch (error) {
      if (request.operation === 'load') authority.dispose();
      workerScope.postMessage({ ...envelope, type: 'error', error: {
        code: request.operation === 'load' ? 'input' : 'operation',
        message: error instanceof Error ? error.message : String(error),
      } });
    }
  });
};
