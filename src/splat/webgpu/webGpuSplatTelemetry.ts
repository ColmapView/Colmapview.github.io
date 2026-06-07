export type WebGpuSplatTelemetryEventName =
  | 'gaussian-decode'
  | 'scene-upload'
  | 'first-frame'
  | 'render'
  | 'psnr-image'
  | 'psnr-reduction';

export type WebGpuSplatTelemetryValue = string | number | boolean | null;

export interface WebGpuSplatTelemetryEvent {
  name: WebGpuSplatTelemetryEventName;
  timestampMs: number;
  durationMs?: number;
  bytes?: number;
  readbackBytes?: number;
  readbackDurationMs?: number;
  imagesPerSecond?: number;
  details?: Record<string, WebGpuSplatTelemetryValue>;
}

export type WebGpuSplatTelemetryListener = (event: WebGpuSplatTelemetryEvent) => void;

const MAX_TELEMETRY_EVENTS = 500;
const telemetryEvents: WebGpuSplatTelemetryEvent[] = [];
const telemetryListeners = new Set<WebGpuSplatTelemetryListener>();

export function nowWebGpuSplatTelemetryMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

export function getWebGpuSplatTelemetryElapsedMs(startMs: number): number {
  return Math.max(0, nowWebGpuSplatTelemetryMs() - startMs);
}

export function recordWebGpuSplatTelemetryEvent(
  event: Omit<WebGpuSplatTelemetryEvent, 'timestampMs'> & { timestampMs?: number }
): void {
  const nextEvent = normalizeTelemetryEvent(event);
  telemetryEvents.push(nextEvent);
  if (telemetryEvents.length > MAX_TELEMETRY_EVENTS) {
    telemetryEvents.splice(0, telemetryEvents.length - MAX_TELEMETRY_EVENTS);
  }

  for (const listener of Array.from(telemetryListeners)) {
    listener(nextEvent);
  }
}

export function getWebGpuSplatTelemetryEvents(): WebGpuSplatTelemetryEvent[] {
  return telemetryEvents.map((event) => ({
    ...event,
    details: event.details ? { ...event.details } : undefined,
  }));
}

export function resetWebGpuSplatTelemetryEventsForTests(): void {
  telemetryEvents.length = 0;
  telemetryListeners.clear();
}

export function subscribeWebGpuSplatTelemetry(
  listener: WebGpuSplatTelemetryListener
): () => void {
  telemetryListeners.add(listener);
  return () => {
    telemetryListeners.delete(listener);
  };
}

function normalizeTelemetryEvent(
  event: Omit<WebGpuSplatTelemetryEvent, 'timestampMs'> & { timestampMs?: number }
): WebGpuSplatTelemetryEvent {
  return {
    ...event,
    timestampMs: event.timestampMs ?? nowWebGpuSplatTelemetryMs(),
    durationMs: event.durationMs === undefined ? undefined : Math.max(0, event.durationMs),
    bytes: event.bytes === undefined ? undefined : requireNonNegativeSafeInteger(event.bytes, 'bytes'),
    readbackBytes: event.readbackBytes === undefined
      ? undefined
      : requireNonNegativeSafeInteger(event.readbackBytes, 'readbackBytes'),
    readbackDurationMs: event.readbackDurationMs === undefined
      ? undefined
      : Math.max(0, event.readbackDurationMs),
    imagesPerSecond: event.imagesPerSecond === undefined
      ? undefined
      : Math.max(0, event.imagesPerSecond),
    details: event.details ? { ...event.details } : undefined,
  };
}

function requireNonNegativeSafeInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Invalid WebGPU splat telemetry ${name}: expected a non-negative safe integer`);
  }
  return value;
}
