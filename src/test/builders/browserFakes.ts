import { EventEmitter } from 'events';
import type GifEncoder from 'gif.js';
import type * as THREE from 'three';
import type { TwoDimensionalCanvasContext } from '../../utils/canvasTypeGuards';

interface ImageBitmapBuilderOptions {
  width?: number;
  height?: number;
  close?: () => void;
}

interface IdleDeadlineBuilderOptions {
  didTimeout?: boolean;
  timeRemaining?: () => DOMHighResTimeStamp;
}

interface AnchorElementBuilderOptions {
  href?: string;
  download?: string;
  click?: HTMLAnchorElement['click'];
}

interface ImageCacheCanvasBuilderOptions {
  width?: number;
  height?: number;
  getContext?: (contextId: string, options?: unknown) => TwoDimensionalCanvasContext | null;
}

interface Canvas2dContextBuilderOptions {
  drawImage?: CanvasRenderingContext2D['drawImage'];
  imageSmoothingEnabled?: boolean;
  imageSmoothingQuality?: ImageSmoothingQuality;
}

interface ClipboardItemBuilderOptions {
  types?: string[];
  blobs?: Record<string, Blob>;
}

interface CaptureStreamCanvasBuilderOptions extends ImageCacheCanvasBuilderOptions {
  captureStream?: HTMLCanvasElement['captureStream'];
}

interface RecordingRendererBuilderOptions {
  domElement?: HTMLCanvasElement;
  render?: THREE.WebGLRenderer['render'];
}

interface GifEncoderBuilderOptions {
  addFrame?: GifEncoder['addFrame'];
  render?: GifEncoder['render'];
  on?: GifEncoder['on'];
  abort?: GifEncoder['abort'];
}

type GifEncoderEventName = 'abort' | 'finished' | 'progress' | 'start';

export interface GifEncoderEventHandlers {
  abort?: () => void;
  finished?: (blob: Blob, data: Uint8Array) => void;
  progress?: (percent: number) => void;
  start?: () => void;
}

type GifEncoderWithHandlersBuilderOptions = Omit<GifEncoderBuilderOptions, 'on'>;

interface EncodedVideoChunkBuilderOptions {
  byteLength?: number;
  duration?: number | null;
  timestamp?: number;
  type?: EncodedVideoChunkType;
  copyTo?: EncodedVideoChunk['copyTo'];
}

interface EncodedVideoChunkMetadataBuilderOptions {
  decoderConfig?: VideoDecoderConfig;
}

interface MediaStreamBuilderOptions {
  active?: boolean;
  id?: string;
}

interface MediaRecorderBuilderOptions {
  stream?: MediaStream;
  mimeType?: string;
  state?: RecordingState;
  videoBitsPerSecond?: number;
  audioBitsPerSecond?: number;
  start?: MediaRecorder['start'];
  stop?: MediaRecorder['stop'];
}

interface VideoEncoderBuilderOptions {
  init?: VideoEncoderInit;
  configure?: VideoEncoder['configure'];
  encode?: VideoEncoder['encode'];
  flush?: VideoEncoder['flush'];
  close?: VideoEncoder['close'];
  reset?: VideoEncoder['reset'];
  state?: CodecState;
  encodeQueueSize?: number;
}

interface VideoFrameBuilderOptions {
  close?: VideoFrame['close'];
  timestamp?: number;
}

interface ResponseBuilderOptions {
  body?: BodyInit | null;
  headers?: HeadersInit;
  status?: number;
  statusText?: string;
  blob?: Response['blob'];
}

interface SetTimeoutImplementationBuilderOptions {
  handle?: ReturnType<typeof setTimeout>;
  onSchedule?: (handler: TimerHandler, timeout?: number) => void;
}

export type TestVideoEncoder = VideoEncoder & {
  init?: VideoEncoderInit;
};

class TestClipboardItem implements ClipboardItem {
  readonly presentationStyle: PresentationStyle = 'unspecified';
  readonly types: ReadonlyArray<string>;
  private readonly blobs: ReadonlyMap<string, Blob>;

  constructor({
    types = [],
    blobs = {},
  }: ClipboardItemBuilderOptions = {}) {
    const blobEntries = Object.entries(blobs);
    this.types = types.length > 0 ? types : blobEntries.map(([type]) => type);
    this.blobs = new Map(blobEntries);
  }

  getType(type: string): Promise<Blob> {
    const blob = this.blobs.get(type);
    if (blob) {
      return Promise.resolve(blob);
    }

    return Promise.reject(new Error('ClipboardItem type is not available in this test fake'));
  }
}

class TestBlobEvent extends Event implements BlobEvent {
  readonly data: Blob;
  readonly timecode: DOMHighResTimeStamp;

  constructor(data: Blob, timecode = 0) {
    super('dataavailable');
    this.data = data;
    this.timecode = timecode;
  }
}

class TestVideoColorSpace implements VideoColorSpace {
  readonly fullRange: boolean | null = null;
  readonly matrix: VideoMatrixCoefficients | null = null;
  readonly primaries: VideoColorPrimaries | null = null;
  readonly transfer: VideoTransferCharacteristics | null = null;

  toJSON(): VideoColorSpaceInit {
    return {
      fullRange: this.fullRange,
      matrix: this.matrix,
      primaries: this.primaries,
      transfer: this.transfer,
    };
  }
}

class TestVideoFrame implements VideoFrame {
  readonly codedHeight = 0;
  readonly codedRect: DOMRectReadOnly | null = null;
  readonly codedWidth = 0;
  readonly colorSpace: VideoColorSpace = new TestVideoColorSpace();
  readonly displayHeight = 0;
  readonly displayWidth = 0;
  readonly duration: number | null = null;
  readonly format: VideoPixelFormat | null = null;
  readonly timestamp: number;
  readonly visibleRect: DOMRectReadOnly | null = null;
  readonly close: VideoFrame['close'];

  constructor({
    close = () => undefined,
    timestamp = 0,
  }: VideoFrameBuilderOptions = {}) {
    this.close = close;
    this.timestamp = timestamp;
  }

  allocationSize(): number {
    return 0;
  }

  clone(): VideoFrame {
    return new TestVideoFrame({
      close: this.close,
      timestamp: this.timestamp,
    });
  }

  copyTo(): Promise<PlaneLayout[]> {
    return Promise.resolve([]);
  }
}

class TestMediaStream extends EventTarget implements MediaStream {
  readonly active: boolean;
  readonly id: string;
  onaddtrack: MediaStream['onaddtrack'] = null;
  onremovetrack: MediaStream['onremovetrack'] = null;

  constructor({
    active = true,
    id = 'test-stream',
  }: MediaStreamBuilderOptions = {}) {
    super();
    this.active = active;
    this.id = id;
  }

  addTrack(): void {
    return undefined;
  }

  clone(): MediaStream {
    return new TestMediaStream({
      active: this.active,
      id: this.id,
    });
  }

  getAudioTracks(): MediaStreamAudioTrack[] {
    return [];
  }

  getTrackById(): MediaStreamTrack | null {
    return null;
  }

  getTracks(): MediaStreamTrack[] {
    return [];
  }

  getVideoTracks(): MediaStreamVideoTrack[] {
    return [];
  }

  removeTrack(): void {
    return undefined;
  }
}

class TestMediaRecorder extends EventTarget implements MediaRecorder {
  readonly audioBitsPerSecond: number;
  readonly mimeType: string;
  readonly state: RecordingState;
  readonly stream: MediaStream;
  readonly videoBitsPerSecond: number;
  ondataavailable: MediaRecorder['ondataavailable'] = null;
  onerror: MediaRecorder['onerror'] = null;
  onpause: MediaRecorder['onpause'] = null;
  onresume: MediaRecorder['onresume'] = null;
  onstart: MediaRecorder['onstart'] = null;
  onstop: MediaRecorder['onstop'] = null;
  readonly start: MediaRecorder['start'];
  readonly stop: MediaRecorder['stop'];

  constructor({
    stream = buildMediaStream(),
    mimeType = '',
    state = 'inactive',
    videoBitsPerSecond = 0,
    audioBitsPerSecond = 0,
    start = () => undefined,
    stop = () => undefined,
  }: MediaRecorderBuilderOptions = {}) {
    super();
    this.stream = stream;
    this.mimeType = mimeType;
    this.state = state;
    this.videoBitsPerSecond = videoBitsPerSecond;
    this.audioBitsPerSecond = audioBitsPerSecond;
    this.start = start;
    this.stop = stop;
  }

  pause(): void {
    return undefined;
  }

  requestData(): void {
    return undefined;
  }

  resume(): void {
    return undefined;
  }
}

class TestVideoEncoderFake extends EventTarget implements TestVideoEncoder {
  readonly init?: VideoEncoderInit;
  readonly encodeQueueSize: number;
  readonly state: CodecState;
  ondequeue: VideoEncoder['ondequeue'] = null;
  readonly close: VideoEncoder['close'];
  readonly configure: VideoEncoder['configure'];
  readonly encode: VideoEncoder['encode'];
  readonly flush: VideoEncoder['flush'];
  readonly reset: VideoEncoder['reset'];

  constructor({
    init,
    configure = () => undefined,
    encode = () => undefined,
    flush = () => Promise.resolve(),
    close = () => undefined,
    reset = () => undefined,
    state = 'configured',
    encodeQueueSize = 0,
  }: VideoEncoderBuilderOptions = {}) {
    super();
    this.init = init;
    this.configure = configure;
    this.encode = encode;
    this.flush = flush;
    this.close = close;
    this.reset = reset;
    this.state = state;
    this.encodeQueueSize = encodeQueueSize;
  }
}

class TestGifEncoder extends EventEmitter implements GifEncoder {
  readonly running = false;
  readonly addFrame: GifEncoder['addFrame'];
  readonly abort: GifEncoder['abort'];
  readonly render: GifEncoder['render'];

  constructor({
    addFrame = () => undefined,
    render = () => undefined,
    abort = () => undefined,
  }: GifEncoderWithHandlersBuilderOptions = {}) {
    super();
    this.addFrame = addFrame;
    this.abort = abort;
    this.render = render;
  }

  setOption(): void {
    return undefined;
  }

  setOptions(): void {
    return undefined;
  }

  on(_event: 'abort' | 'start', _listener: () => void): this;
  on(_event: 'finished', _listener: (blob: Blob, data: Uint8Array) => void): this;
  on(_event: 'progress', _listener: (percent: number) => void): this;
  on(_event: string | symbol, _listener: (...args: unknown[]) => void): this;
  on(): this {
    return this;
  }

  once(_event: 'abort' | 'start', _listener: () => void): this;
  once(_event: 'finished', _listener: (blob: Blob, data: Uint8Array) => void): this;
  once(_event: 'progress', _listener: (percent: number) => void): this;
  once(_event: string | symbol, _listener: (...args: unknown[]) => void): this;
  once(): this {
    return this;
  }
}

export function buildImageBitmap({
  width = 1,
  height = 1,
  close = () => undefined,
}: ImageBitmapBuilderOptions = {}): ImageBitmap {
  return {
    width,
    height,
    close,
  };
}

export function buildIdleDeadline({
  didTimeout = false,
  timeRemaining = () => 0,
}: IdleDeadlineBuilderOptions = {}): IdleDeadline {
  return {
    didTimeout,
    timeRemaining,
  };
}

export function buildResponse({
  body = null,
  headers,
  status = 200,
  statusText,
  blob,
}: ResponseBuilderOptions = {}): Response {
  const response = new Response(body, {
    headers,
    status,
    statusText,
  });

  if (blob) {
    Object.defineProperty(response, 'blob', {
      configurable: true,
      value: blob,
    });
  }

  return response;
}

export function buildAnchorElement({
  href = '',
  download = '',
  click = () => undefined,
}: AnchorElementBuilderOptions = {}): HTMLAnchorElement {
  const anchor = document.createElement('a');
  let currentHref = href;
  let currentDownload = download;

  Object.defineProperties(anchor, {
    click: {
      configurable: true,
      value: click,
    },
    download: {
      configurable: true,
      get: () => currentDownload,
      set: (value: string) => {
        currentDownload = value;
      },
    },
    href: {
      configurable: true,
      get: () => currentHref,
      set: (value: string) => {
        currentHref = value;
      },
    },
  });

  return anchor;
}

export function buildTimeoutHandle(): ReturnType<typeof setTimeout> {
  const handle = setTimeout(() => undefined, 0);
  clearTimeout(handle);
  return handle;
}

export function buildSetTimeoutImplementation({
  handle = buildTimeoutHandle(),
  onSchedule = () => undefined,
}: SetTimeoutImplementationBuilderOptions = {}): typeof setTimeout {
  return (handler: TimerHandler, timeout?: number) => {
    onSchedule(handler, timeout);
    return handle;
  };
}

export function buildImageCacheCanvas({
  width = 1,
  height = 1,
  getContext,
}: ImageCacheCanvasBuilderOptions = {}): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  if (getContext) {
    Object.defineProperty(canvas, 'getContext', {
      configurable: true,
      value: getContext,
    });
  }

  return canvas;
}

export function buildCanvas2dContext({
  drawImage = () => undefined,
  imageSmoothingEnabled = false,
  imageSmoothingQuality = 'low',
}: Canvas2dContextBuilderOptions = {}): TwoDimensionalCanvasContext {
  return {
    drawImage,
    imageSmoothingEnabled,
    imageSmoothingQuality,
  };
}

export function buildClipboardItem({
  types = [],
  blobs = {},
}: ClipboardItemBuilderOptions = {}): ClipboardItem {
  return new TestClipboardItem({ types, blobs });
}

export function buildCaptureStreamCanvas({
  captureStream = () => buildMediaStream(),
  ...canvasOptions
}: CaptureStreamCanvasBuilderOptions = {}): HTMLCanvasElement {
  const canvas = buildImageCacheCanvas(canvasOptions);

  Object.defineProperty(canvas, 'captureStream', {
    configurable: true,
    value: captureStream,
  });

  return canvas;
}

export function buildRecordingRenderer({
  domElement = buildImageCacheCanvas(),
  render = () => undefined,
}: RecordingRendererBuilderOptions = {}): Pick<THREE.WebGLRenderer, 'domElement' | 'render'> {
  return {
    domElement,
    render,
  };
}

export function buildGifEncoder({
  addFrame = () => undefined,
  render = () => undefined,
  on,
  abort = () => undefined,
}: GifEncoderBuilderOptions = {}): GifEncoder {
  const gif = new TestGifEncoder({
    addFrame,
    abort,
    render,
  });

  if (on) {
    Object.defineProperty(gif, 'on', {
      configurable: true,
      value: on,
    });
  }

  return gif;
}

export function buildGifEncoderWithHandlers(
  encoderOptions: GifEncoderWithHandlersBuilderOptions = {}
): {
  gif: GifEncoder;
  handlers: GifEncoderEventHandlers;
  registrations: GifEncoderEventName[];
} {
  const handlers: GifEncoderEventHandlers = {};
  const registrations: GifEncoderEventName[] = [];

  function on(...args: ['abort' | 'start', () => void]): GifEncoder;
  function on(...args: ['finished', (blob: Blob, data: Uint8Array) => void]): GifEncoder;
  function on(...args: ['progress', (percent: number) => void]): GifEncoder;
  function on(
    ...args:
      | ['abort' | 'start', () => void]
      | ['finished', (blob: Blob, data: Uint8Array) => void]
      | ['progress', (percent: number) => void]
  ): GifEncoder {
    registrations.push(args[0]);
    switch (args[0]) {
      case 'finished':
        handlers.finished = args[1];
        break;
      case 'progress':
        handlers.progress = args[1];
        break;
      case 'abort':
        handlers.abort = args[1];
        break;
      case 'start':
        handlers.start = args[1];
        break;
    }
    return gif;
  }

  const gif = buildGifEncoder({ ...encoderOptions, on });

  return {
    gif,
    handlers,
    registrations,
  };
}

export function buildEncodedVideoChunk({
  byteLength = 0,
  duration = null,
  timestamp = 0,
  type = 'key',
  copyTo = () => undefined,
}: EncodedVideoChunkBuilderOptions = {}): EncodedVideoChunk {
  return {
    byteLength,
    duration,
    timestamp,
    type,
    copyTo,
  };
}

export function buildEncodedVideoChunkMetadata({
  decoderConfig,
}: EncodedVideoChunkMetadataBuilderOptions = {}): EncodedVideoChunkMetadata {
  return decoderConfig === undefined ? {} : { decoderConfig };
}

export function buildMediaStream({
  active = true,
  id = 'test-stream',
}: MediaStreamBuilderOptions = {}): MediaStream {
  return new TestMediaStream({ active, id });
}

export function buildMediaRecorder({
  stream = buildMediaStream(),
  mimeType = '',
  state = 'inactive',
  videoBitsPerSecond = 0,
  audioBitsPerSecond = 0,
  start = () => undefined,
  stop = () => undefined,
}: MediaRecorderBuilderOptions = {}): MediaRecorder {
  return new TestMediaRecorder({
    stream,
    mimeType,
    state,
    videoBitsPerSecond,
    audioBitsPerSecond,
    start,
    stop,
  });
}

export function buildBlobEvent(data: Blob): BlobEvent {
  return new TestBlobEvent(data);
}

export function buildVideoEncoder({
  init,
  configure = () => undefined,
  encode = () => undefined,
  flush = () => Promise.resolve(),
  close = () => undefined,
  reset = () => undefined,
  state = 'configured',
  encodeQueueSize = 0,
}: VideoEncoderBuilderOptions = {}): TestVideoEncoder {
  return new TestVideoEncoderFake({
    init,
    configure,
    encode,
    flush,
    close,
    reset,
    state,
    encodeQueueSize,
  });
}

export function buildVideoFrame({
  close = () => undefined,
  timestamp = 0,
}: VideoFrameBuilderOptions = {}): VideoFrame {
  return new TestVideoFrame({ close, timestamp });
}
