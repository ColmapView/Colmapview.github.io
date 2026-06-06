import type { CSSProperties } from 'react';
import { SIZE } from '../../theme';

export const FOOTER_BRANDING_CLEAR_STATUS_CLASS_NAME = 'footer-status-clearance';
export const FOOTER_BRANDING_NO_STATUS_CLASS_NAME = 'footer-no-status-clearance';

export function getFooterLogoImageStyle(
  logoHeight = SIZE.logoHeight,
): CSSProperties {
  return {
    height: logoHeight,
  };
}

export function getFooterBrandingPositionClassName({
  clearStatusBar,
}: {
  clearStatusBar: boolean;
}): string {
  return clearStatusBar
    ? FOOTER_BRANDING_CLEAR_STATUS_CLASS_NAME
    : FOOTER_BRANDING_NO_STATUS_CLASS_NAME;
}
