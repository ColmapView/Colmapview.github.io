export type TwoDimensionalCanvas = HTMLCanvasElement | OffscreenCanvas;
export type TwoDimensionalCanvasContext = Pick<
  CanvasRenderingContext2D,
  'drawImage' | 'imageSmoothingEnabled' | 'imageSmoothingQuality'
>;

export function isOffscreenCanvas(canvas: TwoDimensionalCanvas): canvas is OffscreenCanvas {
  return typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas;
}

export function getCanvas2dContext(
  canvas: TwoDimensionalCanvas
): TwoDimensionalCanvasContext | null {
  return isOffscreenCanvas(canvas) ? canvas.getContext('2d') : canvas.getContext('2d');
}
