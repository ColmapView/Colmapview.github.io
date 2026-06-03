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
  download: ReconstructionFileDownloadFunction = downloadFile
): void {
  download(fileWriters.writeCameras(), 'cameras.txt');
  download(fileWriters.writeImages(), 'images.txt');
  download(fileWriters.writePoints3D(), 'points3D.txt');

  if (fileWriters.writeRigs) {
    download(fileWriters.writeRigs(), 'rigs.txt');
  }
  if (fileWriters.writeFrames) {
    download(fileWriters.writeFrames(), 'frames.txt');
  }
}

export function exportReconstructionBinaryFiles(
  fileWriters: ReconstructionBinaryFileWriters,
  download: ReconstructionFileDownloadFunction = downloadFile
): void {
  download(fileWriters.writeCameras(), 'cameras.bin');
  download(fileWriters.writeImages(), 'images.bin');
  download(fileWriters.writePoints3D(), 'points3D.bin');

  if (fileWriters.writeRigs) {
    download(fileWriters.writeRigs(), 'rigs.bin');
  }
  if (fileWriters.writeFrames) {
    download(fileWriters.writeFrames(), 'frames.bin');
  }
}

export function exportPointsPLYFile(
  writePointsPLY: () => string,
  download: ReconstructionFileDownloadFunction = downloadFile
): void {
  download(writePointsPLY(), 'points.ply');
}
