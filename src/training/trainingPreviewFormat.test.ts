import { describe, expect, it } from 'vitest';
import { isTrainingPreviewFormat, supportsTrainingGeometryPreview } from './trainingPreviewFormat';

describe('training preview format negotiation', () => {
  it('accepts compact SPZ and legacy PLY previews only', () => {
    expect(isTrainingPreviewFormat('spz')).toBe(true);
    expect(isTrainingPreviewFormat('PLY')).toBe(true);
    expect(isTrainingPreviewFormat('splat')).toBe(false);
  });

  it('recognizes a supported format anywhere in the server capability list', () => {
    expect(supportsTrainingGeometryPreview(['future', 'spz'])).toBe(true);
    expect(supportsTrainingGeometryPreview(['future'])).toBe(false);
    expect(supportsTrainingGeometryPreview(undefined)).toBe(false);
  });
});
