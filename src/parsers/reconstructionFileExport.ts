import { downloadFile } from '../utils/download';

export type ReconstructionFileDownloadFunction = (
  data: ArrayBuffer | string,
  filename: string
) => void;

export interface ReconstructionTextFileWriters {
  writeCameras: () => string;
  writeImages: () => string;
  writePoints3D: () => string;
  writeRigs?: () => string;
  writeFrames?: () => string;
}

export interface ReconstructionBinaryFileWriters {
  writeCameras: () => ArrayBuffer;
  writeImages: () => ArrayBuffer;
  writePoints3D: () => ArrayBuffer;
  writeRigs?: () => ArrayBuffer;
  writeFrames?: () => ArrayBuffer;
}

export function exportReconstructionTextFiles(
  fileWriters: ReconstructionTextFileWriters,
  download: ReconstructionFileDownloadFunction = downloadFile,
  signal?: AbortSignal,
): void {
  signal?.throwIfAborted();
  // Finish serialization before handing any files to the browser.
  const files: Array<[string, string]> = [
    [fileWriters.writeCameras(), 'cameras.txt'],
    [fileWriters.writeImages(), 'images.txt'],
    [fileWriters.writePoints3D(), 'points3D.txt'],
  ];

  if (fileWriters.writeRigs) {
    files.push([fileWriters.writeRigs(), 'rigs.txt']);
  }
  if (fileWriters.writeFrames) {
    files.push([fileWriters.writeFrames(), 'frames.txt']);
  }
  signal?.throwIfAborted();
  for (const [data, filename] of files) download(data, filename);
}

export function exportReconstructionBinaryFiles(
  fileWriters: ReconstructionBinaryFileWriters,
  download: ReconstructionFileDownloadFunction = downloadFile,
  signal?: AbortSignal,
): void {
  signal?.throwIfAborted();
  const files: Array<[ArrayBuffer, string]> = [
    [fileWriters.writeCameras(), 'cameras.bin'],
    [fileWriters.writeImages(), 'images.bin'],
    [fileWriters.writePoints3D(), 'points3D.bin'],
  ];

  if (fileWriters.writeRigs) {
    files.push([fileWriters.writeRigs(), 'rigs.bin']);
  }
  if (fileWriters.writeFrames) {
    files.push([fileWriters.writeFrames(), 'frames.bin']);
  }
  signal?.throwIfAborted();
  for (const [data, filename] of files) download(data, filename);
}

export function exportPointsPLYFile(
  writePointsPLY: () => string,
  download: ReconstructionFileDownloadFunction = downloadFile
): void {
  download(writePointsPLY(), 'points.ply');
}
