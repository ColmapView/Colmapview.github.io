import type { SplatMeshOptions } from '@sparkjsdev/spark';
import { isSplatFilePath } from './splatFilePolicy';

export type SparkModule = typeof import('@sparkjsdev/spark');

let sparkModulePromise: Promise<SparkModule> | null = null;

export function preloadSparkModule(): Promise<SparkModule> {
  if (!sparkModulePromise) {
    sparkModulePromise = import('@sparkjsdev/spark').catch((error: unknown) => {
      sparkModulePromise = null;
      throw error;
    });
  }

  return sparkModulePromise;
}

export async function getSplatMeshSourceOptions(
  sourceFile: File
): Promise<Pick<SplatMeshOptions, 'fileBytes' | 'stream' | 'streamLength'>> {
  if (!isSplatFilePath(sourceFile.name)) {
    throw new Error(`Unsupported splat format: ${sourceFile.name}`);
  }

  if (typeof sourceFile.stream === 'function') {
    return {
      stream: sourceFile.stream(),
      streamLength: sourceFile.size,
    };
  }

  const fileBytes = await sourceFile.arrayBuffer();
  return {
    fileBytes: new Uint8Array(fileBytes),
  };
}
