import { useCallback, useEffect, useRef } from 'react';
import { SCREENSHOT } from '../../theme';
import { publicAsset } from '../../utils/paths';
import { getLogoPlacement } from './screenshotCaptureViewModel';

export type AddLogoToCanvas = (canvas: HTMLCanvasElement, hideLogo: boolean) => void;

export function useScreenshotLogo(): AddLogoToCanvas {
  const logoRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const img = new Image();
    img.src = publicAsset('LOGO.png');
    img.onload = () => { logoRef.current = img; };
  }, []);

  return useCallback((canvas: HTMLCanvasElement, hideLogo: boolean) => {
    const ctx = canvas.getContext('2d')!;
    const logo = logoRef.current;

    if (logo && !hideLogo) {
      const placement = getLogoPlacement(
        canvas.height,
        logo.width,
        logo.height,
        SCREENSHOT.logoHeightPercent,
        SCREENSHOT.paddingPercent
      );

      ctx.globalAlpha = SCREENSHOT.logoAlpha;
      ctx.drawImage(
        logo,
        placement.x,
        placement.y,
        placement.width,
        placement.height
      );
      ctx.globalAlpha = 1;
    }
  }, []);
}
