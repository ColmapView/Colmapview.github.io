import { zipSync } from 'fflate';

/** Test-only encoder; production never rewrites source camera arrays. */
export function numpyFixture(rows: number, columns: number, values: readonly number[],
  options: { float32?: boolean; bigEndian?: boolean; fortran?: boolean; version?: 1 | 2 | 3 } = {}): Uint8Array<ArrayBuffer> {
  const version = options.version ?? 1, prefix = version === 1 ? 10 : 12, size = options.float32 ? 4 : 8;
  const header = `{'descr': '${options.bigEndian ? '>' : '<'}f${size}', 'fortran_order': ${options.fortran ? 'True' : 'False'}, 'shape': (${rows}, ${columns}), }`;
  const encoded = new TextEncoder().encode(header + ' '.repeat((64 - (prefix + header.length + 1) % 64) % 64) + '\n');
  const bytes = new Uint8Array(prefix + encoded.length + rows * columns * size), view = new DataView(bytes.buffer);
  bytes.set([0x93, 78, 85, 77, 80, 89, version, 0]);
  if (version === 1) view.setUint16(8, encoded.length, true); else view.setUint32(8, encoded.length, true);
  bytes.set(encoded, prefix);
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const at = prefix + encoded.length + (options.fortran ? column * rows + row : row * columns + column) * size;
    if (size === 4) view.setFloat32(at, values[row * columns + column], !options.bigEndian);
    else view.setFloat64(at, values[row * columns + column], !options.bigEndian);
  }
  return bytes;
}

export function dtuFixture(projections: readonly (readonly number[])[], scales?: readonly (readonly number[])[]): Uint8Array<ArrayBuffer> {
  const files: Record<string, Uint8Array> = {};
  for (let index = 0; index < projections.length; index++) {
    const matrix = projections[index].length === 16 ? projections[index] : [...projections[index], 0, 0, 0, 1];
    files[`world_mat_${index}.npy`] = numpyFixture(4, 4, matrix);
    files[`scale_mat_${index}.npy`] = numpyFixture(4, 4, scales?.[index] ?? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  }
  return new Uint8Array(zipSync(files));
}
