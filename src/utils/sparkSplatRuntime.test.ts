import { describe, expect, it } from 'vitest';
import { getSplatMeshSourceOptions } from './sparkSplatRuntime';

describe('Spark splat runtime helpers', () => {
  it('rejects unsupported splat extensions before Spark receives file data', async () => {
    await expect(getSplatMeshSourceOptions(new File(['x'], 'scene.txt')))
      .rejects.toThrow('Unsupported splat format: scene.txt');
  });

  it('returns streaming source options for supported splat files', async () => {
    const stream = new ReadableStream();
    const file = {
      name: 'scene.spz',
      size: 1,
      stream: () => stream,
    } as File;

    await expect(getSplatMeshSourceOptions(file)).resolves.toEqual({
      stream,
      streamLength: file.size,
    });
  });
});
