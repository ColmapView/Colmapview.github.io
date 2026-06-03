import type { DatasetState } from '../../dataset/types';

export function buildDatasetState(overrides: Partial<DatasetState> = {}): DatasetState {
  return {
    sourceType: null,
    imageUrlBase: null,
    maskUrlBase: null,
    loadedFiles: null,
    ...overrides,
  };
}
