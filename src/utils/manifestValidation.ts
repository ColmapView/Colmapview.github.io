import type { ZodIssue } from 'zod';
import { ColmapManifestSchema, type ColmapManifest } from '../types/manifest';

export type ColmapManifestValidationResult =
  | { success: true; manifest: ColmapManifest }
  | { success: false; details: string };

export function formatManifestValidationIssues(issues: readonly ZodIssue[]): string {
  return issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
}

export function validateColmapManifest(value: unknown): ColmapManifestValidationResult {
  const result = ColmapManifestSchema.safeParse(value);

  if (!result.success) {
    return {
      success: false,
      details: formatManifestValidationIssues(result.error.issues),
    };
  }

  return { success: true, manifest: result.data };
}
