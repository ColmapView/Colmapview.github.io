export const ZIP_MIME_TYPE = 'application/zip';

export type ZipCompressionLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export const ZIP_COMPRESSION_LEVELS: readonly ZipCompressionLevel[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

const DEFAULT_ZIP_COMPRESSION_LEVEL: ZipCompressionLevel = 6;

export function normalizeZipCompressionLevel(level?: number): ZipCompressionLevel {
  if (level === undefined || Number.isNaN(level)) return DEFAULT_ZIP_COMPRESSION_LEVEL;

  const index = Math.max(
    0,
    Math.min(ZIP_COMPRESSION_LEVELS.length - 1, Math.trunc(level))
  );
  return ZIP_COMPRESSION_LEVELS[index];
}

export function createZipBlob(zipped: Uint8Array): Blob {
  const bytes = new Uint8Array(zipped.byteLength);
  bytes.set(zipped);
  return new Blob([bytes.buffer], { type: ZIP_MIME_TYPE });
}
