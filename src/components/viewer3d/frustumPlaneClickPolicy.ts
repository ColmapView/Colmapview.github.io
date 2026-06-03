export type FrustumPlaneClickAction = 'disabled' | 'stopPropagation' | 'select';

export function getFrustumPlaneClickAction({
  disabled,
  touchMode,
}: {
  disabled: boolean;
  touchMode: boolean;
}): FrustumPlaneClickAction {
  if (disabled) return 'disabled';
  return touchMode ? 'stopPropagation' : 'select';
}

export function shouldEnableFrustumPlaneContextMenu({
  disabled,
  touchMode,
}: {
  disabled: boolean;
  touchMode: boolean;
}): boolean {
  return !disabled && !touchMode;
}
