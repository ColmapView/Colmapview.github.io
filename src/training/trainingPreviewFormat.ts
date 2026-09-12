export const SUPPORTED_TRAINING_PREVIEW_FORMATS = ['spz', 'ply'] as const;

export type TrainingPreviewFormat = typeof SUPPORTED_TRAINING_PREVIEW_FORMATS[number];

export function isTrainingPreviewFormat(value: string | null | undefined): value is TrainingPreviewFormat {
  return SUPPORTED_TRAINING_PREVIEW_FORMATS.includes(value?.toLowerCase() as TrainingPreviewFormat);
}

export function supportsTrainingGeometryPreview(formats: readonly string[] | null | undefined): boolean {
  return Boolean(formats?.some(format => isTrainingPreviewFormat(format)));
}
