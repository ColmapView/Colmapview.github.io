import {
  parseFramesBinary,
  parseFramesText,
  parseRigsBinary,
  parseRigsText,
} from '../parsers';
import type { Frame, Rig, RigData } from '../types/rig';
import { appLogger } from '../utils/logger';

export interface RigDataParsers {
  parseRigsBinary: (buffer: ArrayBuffer) => Map<number, Rig>;
  parseRigsText: (text: string) => Map<number, Rig>;
  parseFramesBinary: (buffer: ArrayBuffer) => Map<number, Frame>;
  parseFramesText: (text: string) => Map<number, Frame>;
}

interface LoadOptionalRigDataOptions {
  wasmRigData?: RigData;
  rigsFile?: File;
  framesFile?: File;
  parsers?: RigDataParsers;
  log?: (message: string) => void;
  warn?: (...data: unknown[]) => void;
}

const defaultParsers: RigDataParsers = {
  parseRigsBinary,
  parseRigsText,
  parseFramesBinary,
  parseFramesText,
};

export async function loadOptionalRigData({
  wasmRigData,
  rigsFile,
  framesFile,
  parsers = defaultParsers,
  log = appLogger.info,
  warn = appLogger.warn,
}: LoadOptionalRigDataOptions): Promise<RigData | undefined> {
  if (wasmRigData) {
    return wasmRigData;
  }

  if (!rigsFile || !framesFile) {
    return undefined;
  }

  try {
    const [rigs, frames] = await Promise.all([
      rigsFile.name.endsWith('.bin')
        ? rigsFile.arrayBuffer().then(parsers.parseRigsBinary)
        : rigsFile.text().then(parsers.parseRigsText),
      framesFile.name.endsWith('.bin')
        ? framesFile.arrayBuffer().then(parsers.parseFramesBinary)
        : framesFile.text().then(parsers.parseFramesText),
    ]);

    log(`Loaded rig data: ${rigs.size} rigs, ${frames.size} frames`);
    return { rigs, frames };
  } catch (err) {
    warn('Failed to parse rig/frame files:', err);
    return undefined;
  }
}
