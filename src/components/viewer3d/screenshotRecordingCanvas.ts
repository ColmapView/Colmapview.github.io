import type * as THREE from 'three';

type RecordingRenderer = Pick<THREE.WebGLRenderer, 'domElement' | 'render'>;

export type ScreenshotLogoDrawer = (canvas: HTMLCanvasElement, hideLogo: boolean) => void;
export type RecordingCanvasFactory = () => HTMLCanvasElement;

export interface RecordingFrameOptions {
  gl: RecordingRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
  canvas: HTMLCanvasElement;
  addLogoToCanvas: ScreenshotLogoDrawer;
  screenshotHideLogo: boolean;
}

export interface DownsampledRecordingFrameOptions extends Omit<RecordingFrameOptions, 'canvas'> {
  downsample: number;
  createCanvas?: RecordingCanvasFactory;
}

export function createRecordingCanvas(
  width: number,
  height: number,
  createCanvas: RecordingCanvasFactory = () => document.createElement('canvas')
): HTMLCanvasElement {
  const canvas = createCanvas();
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function createDownsampledRecordingCanvas(
  sourceCanvas: HTMLCanvasElement,
  downsample: number,
  createCanvas?: RecordingCanvasFactory
): HTMLCanvasElement {
  return createRecordingCanvas(
    Math.floor(sourceCanvas.width / downsample),
    Math.floor(sourceCanvas.height / downsample),
    createCanvas
  );
}

export function captureDownsampledRecordingFrame({
  gl,
  scene,
  camera,
  downsample,
  createCanvas,
  addLogoToCanvas,
  screenshotHideLogo,
}: DownsampledRecordingFrameOptions): HTMLCanvasElement {
  const canvas = createDownsampledRecordingCanvas(gl.domElement, downsample, createCanvas);
  drawRecordingFrameToCanvas({
    gl,
    scene,
    camera,
    canvas,
    addLogoToCanvas,
    screenshotHideLogo,
  });
  return canvas;
}

export function drawRecordingFrameToCanvas({
  gl,
  scene,
  camera,
  canvas,
  addLogoToCanvas,
  screenshotHideLogo,
}: RecordingFrameOptions): void {
  gl.render(scene, camera);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Recording canvas 2D context is unavailable');
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(gl.domElement, 0, 0, canvas.width, canvas.height);

  addLogoToCanvas(canvas, screenshotHideLogo);
}
