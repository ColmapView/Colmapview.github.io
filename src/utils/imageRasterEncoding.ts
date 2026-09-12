import { isOffscreenCanvas } from './canvasTypeGuards';

export interface RasterEncodingCanvas {
  drawImage(bitmap: ImageBitmap, width: number, height: number): void;
  fill(color: string): void;
  toBlob(type: string, quality?: number): Promise<Blob>;
}

export interface RasterEncodingOptions {
  signal?: AbortSignal;
  decodeOptions?: ImageBitmapOptions;
  decode?: (blob: Blob, options?: ImageBitmapOptions) => Promise<ImageBitmap>;
  createCanvas?: (width: number, height: number) => RasterEncodingCanvas | null;
}

/** Encode a browser-decodable image without resizing it. */
export async function encodeRasterImage(
  source: Blob,
  type: 'image/jpeg' | 'image/png',
  quality: number | undefined,
  options: RasterEncodingOptions = {},
): Promise<Blob> {
  const { signal, decodeOptions } = options;
  signal?.throwIfAborted();
  const decode = options.decode ?? decodeBrowserImage;
  const bitmap = await decode(source, decodeOptions);
  try {
    signal?.throwIfAborted();
    if (!Number.isSafeInteger(bitmap.width) || bitmap.width <= 0
      || !Number.isSafeInteger(bitmap.height) || bitmap.height <= 0) {
      throw new Error('Training image has invalid dimensions.');
    }
    const canvas = (options.createCanvas ?? createBrowserRasterCanvas)(bitmap.width, bitmap.height);
    if (!canvas) throw new Error('This browser cannot encode training images.');
    canvas.drawImage(bitmap, bitmap.width, bitmap.height);
    signal?.throwIfAborted();
    const encoded = await canvas.toBlob(type, quality);
    signal?.throwIfAborted();
    if (encoded.type.toLowerCase() !== type) {
      throw new Error(`This browser did not produce the requested ${type} image.`);
    }
    return encoded;
  } finally {
    bitmap.close();
  }
}

/** Encode a solid browser raster without first allocating or decoding a source image. */
export async function encodeSolidRasterImage(
  width: number,
  height: number,
  type: 'image/png',
  color: string,
  options: Omit<RasterEncodingOptions, 'decode' | 'decodeOptions'> = {},
): Promise<Blob> {
  const { signal } = options;
  signal?.throwIfAborted();
  if (!Number.isSafeInteger(width) || width <= 0 || !Number.isSafeInteger(height) || height <= 0) {
    throw new Error('Training mask has invalid dimensions.');
  }
  const canvas = (options.createCanvas ?? createBrowserRasterCanvas)(width, height);
  if (!canvas) throw new Error('This browser cannot encode training masks.');
  canvas.fill(color);
  signal?.throwIfAborted();
  const encoded = await canvas.toBlob(type);
  signal?.throwIfAborted();
  if (encoded.type.toLowerCase() !== type) {
    throw new Error(`This browser did not produce the requested ${type} image.`);
  }
  return encoded;
}

function decodeBrowserImage(blob: Blob, options?: ImageBitmapOptions): Promise<ImageBitmap> {
  return options === undefined ? createImageBitmap(blob) : createImageBitmap(blob, options);
}

function createBrowserRasterCanvas(width: number, height: number): RasterEncodingCanvas | null {
  let canvas: OffscreenCanvas | HTMLCanvasElement;
  let context: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
  if (typeof OffscreenCanvas !== 'undefined') {
    canvas = new OffscreenCanvas(width, height);
    context = canvas.getContext('2d');
  } else if (typeof document !== 'undefined') {
    canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    context = canvas.getContext('2d');
  } else {
    return null;
  }
  if (!context) return null;
  return {
    drawImage(bitmap, targetWidth, targetHeight) {
      context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    },
    fill(color) {
      context.fillStyle = color;
      context.fillRect(0, 0, width, height);
    },
    toBlob(type, quality) {
      if (isOffscreenCanvas(canvas)) return canvas.convertToBlob({ type, quality });
      return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          blob => blob ? resolve(blob) : reject(new Error(`Failed to encode ${type} image.`)),
          type,
          quality,
        );
      });
    },
  };
}
