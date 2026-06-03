import { getResizedImageDimensions } from './asyncImageCachePolicy';
import {
  getCanvas2dContext,
  type TwoDimensionalCanvasContext,
} from '../utils/canvasTypeGuards';

export type ImageCacheCanvas = HTMLCanvasElement | OffscreenCanvas;
export type ImageCacheCanvasFactory = (width: number, height: number) => ImageCacheCanvas;

export function createBrowserImageCacheCanvas(width: number, height: number): ImageCacheCanvas {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function drawImageBitmapToCacheCanvas(
  bitmap: ImageBitmap,
  maxSize: number,
  createCanvas: ImageCacheCanvasFactory = createBrowserImageCacheCanvas
): ImageCacheCanvas {
  const { width, height } = getResizedImageDimensions(bitmap, maxSize);
  const canvas = createCanvas(width, height);
  const ctx = getCanvas2dContext(canvas);

  if (ctx) {
    ctx.drawImage(bitmap, 0, 0, width, height);
  }
  bitmap.close();

  return canvas;
}

export type ImageCacheCanvasContext = TwoDimensionalCanvasContext;
