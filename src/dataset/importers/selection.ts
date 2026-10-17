import { importError } from './types';

export interface CameraDatasetCandidate {
  path: string;
  sceneRoot: string;
  label: string;
  component?: number;
  purpose?: 'photos';
}
export type SelectCameraDataset = (candidates: readonly CameraDatasetCandidate[], signal?: AbortSignal)
  => Promise<CameraDatasetCandidate|null>;
let handler: SelectCameraDataset|null=null;

export function registerCameraDatasetSelector(next: SelectCameraDataset|null): void { handler=next; }
export function hasCameraDatasetSelector(): boolean { return handler !== null; }
export async function requestCameraDatasetSelection(candidates: readonly CameraDatasetCandidate[], signal?: AbortSignal): Promise<CameraDatasetCandidate|null> {
  signal?.throwIfAborted();
  if (!handler) return importError('AMBIGUOUS_DATASET','Multiple scenes are available. Choose one scene folder or metadata file.');
  return handler(candidates,signal);
}
