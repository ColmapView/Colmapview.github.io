export const DEFAULT_VIEWER_BACKGROUND_COLOR = '#ffffff';
export const DEFAULT_SPLAT_BACKGROUND_COLOR = '#000000';

function normalizeHexColor(color: string): string {
  return color.trim().toLowerCase();
}

export function getDefaultBackgroundColorForSplatLoad(
  backgroundColor: string,
  hasSplatFile: boolean
): string {
  if (!hasSplatFile) return backgroundColor;

  const normalizedColor = normalizeHexColor(backgroundColor);
  return normalizedColor === DEFAULT_VIEWER_BACKGROUND_COLOR || normalizedColor === '#fff'
    ? DEFAULT_SPLAT_BACKGROUND_COLOR
    : backgroundColor;
}
