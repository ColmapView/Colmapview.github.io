import type { ReconstructionSourceType } from '../store/reconstructionStore';
import { appLogger } from '../utils/logger';

export interface MissingImageDiagnosticSummary {
  missingImages: Array<{ imageId: number; name: string }>;
  totalImages: number;
  totalFiles: number;
}

export interface MissingImageDiagnostic {
  summaryMessage: string;
  sampleLabel: string;
  sampleImages: string[];
  overflowMessage?: string;
}

export interface DecodeFailureDiagnostic {
  summaryMessage: string;
  fixMessage: string;
}

interface FileDropzoneDiagnosticsOptions {
  skipMissingImageDiagnostic?: boolean;
}

export function shouldSkipMissingImageDiagnosticForSource({
  sourceType,
  imageUrlBase,
}: {
  sourceType: ReconstructionSourceType;
  imageUrlBase: string | null;
}): boolean {
  return sourceType === 'zip' || imageUrlBase !== null;
}

export function getMissingImageDiagnostic(
  { missingImages, totalImages, totalFiles }: MissingImageDiagnosticSummary,
  sampleLimit = 10
): MissingImageDiagnostic | null {
  if (missingImages.length === 0) {
    return null;
  }

  const sampleCount = Math.min(Math.max(0, sampleLimit), missingImages.length);
  const overflowCount = missingImages.length - sampleCount;

  return {
    summaryMessage: `⚠️ ${missingImages.length}/${totalImages} images could not find their files (${totalFiles} image files in lookup map)`,
    sampleLabel: 'First missing images:',
    sampleImages: missingImages
      .slice(0, sampleCount)
      .map(image => `ID ${image.imageId}: "${image.name}"`),
    overflowMessage: overflowCount > 0 ? `... and ${overflowCount} more` : undefined,
  };
}

export function getDecodeFailureDiagnostic(failedCount: number): DecodeFailureDiagnostic | null {
  if (failedCount <= 0) {
    return null;
  }

  return {
    summaryMessage: `⚠️ ${failedCount} images failed to decode (createImageBitmap error). These images may be corrupted or use unsupported encoding.`,
    fixMessage: 'To fix: Re-export these images from your image editing software, or convert them using a tool like ImageMagick.',
  };
}

export function logFileDropzoneDiagnostics(
  missingImageSummary: MissingImageDiagnosticSummary,
  failedDecodeCount: number,
  warn: (...data: unknown[]) => void = appLogger.warn,
  { skipMissingImageDiagnostic = false }: FileDropzoneDiagnosticsOptions = {}
): void {
  if (!skipMissingImageDiagnostic) {
    const missingImageDiagnostic = getMissingImageDiagnostic(missingImageSummary);
    if (missingImageDiagnostic) {
      warn(missingImageDiagnostic.summaryMessage);
      warn(missingImageDiagnostic.sampleLabel, missingImageDiagnostic.sampleImages);
      if (missingImageDiagnostic.overflowMessage) {
        warn(missingImageDiagnostic.overflowMessage);
      }
    }
  }

  const decodeFailureDiagnostic = getDecodeFailureDiagnostic(failedDecodeCount);
  if (decodeFailureDiagnostic) {
    warn(decodeFailureDiagnostic.summaryMessage);
    warn(decodeFailureDiagnostic.fixMessage);
  }
}
