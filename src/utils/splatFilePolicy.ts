export const SPLAT_FILE_EXTENSIONS = ['.spz', '.ply'] as const;

export type SplatFileExtension = typeof SPLAT_FILE_EXTENSIONS[number];

const SPLAT_EXTENSION_PRIORITY: Record<SplatFileExtension, number> = {
  '.spz': 2,
  '.ply': 1,
};

export interface SplatCandidate {
  path: string;
  size: number;
}

export function getSplatFileExtension(path: string): SplatFileExtension | null {
  const lower = path.toLowerCase();
  return SPLAT_FILE_EXTENSIONS.find((extension) => lower.endsWith(extension)) ?? null;
}

export function isSplatFilePath(path: string): boolean {
  return getSplatFileExtension(path) !== null;
}

function getSplatCandidateRank(candidate: SplatCandidate): number {
  const extension = getSplatFileExtension(candidate.path);
  return extension ? SPLAT_EXTENSION_PRIORITY[extension] : 0;
}

export function compareSplatCandidates(a: SplatCandidate, b: SplatCandidate): number {
  const rankDelta = getSplatCandidateRank(a) - getSplatCandidateRank(b);
  if (rankDelta !== 0) return rankDelta;
  return a.size - b.size;
}

export function getPreferredSplatCandidate<TCandidate extends SplatCandidate>(
  current: TCandidate | null | undefined,
  candidate: TCandidate
): TCandidate {
  if (!current) return candidate;
  return compareSplatCandidates(candidate, current) > 0 ? candidate : current;
}

export function sortSplatCandidatesByPreference<TCandidate extends SplatCandidate>(
  candidates: readonly TCandidate[]
): TCandidate[] {
  return [...candidates].sort((a, b) => compareSplatCandidates(b, a));
}

/** Formats our WebGPU renderer, PSNR/SSIM evaluator and byte-less touch loader can decode. */
const WEBGPU_DECODABLE_EXTENSIONS = ['.ply', '.spz'] as const;

export type SplatRendererRequirement = 'any' | 'spark-only';

export function supportsWebGpuRenderer(path: string): boolean {
  const lower = path.toLowerCase();
  return WEBGPU_DECODABLE_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

export function isSogSplatPath(path: string): boolean {
  return path.toLowerCase().endsWith('.sog');
}

/** SOG bundles decode only in Spark; everything else may use either renderer. */
export function getSplatRendererRequirement(path: string | null | undefined): SplatRendererRequirement {
  return path && isSogSplatPath(path) ? 'spark-only' : 'any';
}
