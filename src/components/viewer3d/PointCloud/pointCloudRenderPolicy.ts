import type { ColorMode } from '../../../store';

interface PointGeometryVisibilityOptions {
  showPointCloud: boolean;
  colorMode: ColorMode;
  splatFile?: File;
  readySplatFile: File | null;
}

export function shouldRenderPointGeometry({
  showPointCloud,
  colorMode,
  splatFile,
  readySplatFile,
}: PointGeometryVisibilityOptions): boolean {
  if (!showPointCloud) {
    return false;
  }

  if (colorMode !== 'splats') {
    return true;
  }

  return !splatFile || readySplatFile !== splatFile;
}
