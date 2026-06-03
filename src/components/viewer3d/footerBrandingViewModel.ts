import type { CSSProperties } from 'react';
import { SIZE } from '../../theme';

export function getFooterLogoImageStyle(
  logoHeight = SIZE.logoHeight,
): CSSProperties {
  return {
    height: logoHeight,
  };
}
