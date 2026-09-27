import { zipSync } from 'fflate';
import type { ZipWorkerRequest, ZipWorkerResult } from './zipCompression';

const workerSelf = self as unknown as {
  onmessage: (event: MessageEvent<ZipWorkerRequest>) => void;
  postMessage: (message: ZipWorkerResult, transfer?: Transferable[]) => void;
};

workerSelf.onmessage = ({ data }) => {
  try {
    const { buffer } = zipSync(data.files, { level: data.level });
    workerSelf.postMessage({ buffer }, [buffer]);
  } catch (error) {
    workerSelf.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
