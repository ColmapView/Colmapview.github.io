import { describe, expect, it } from 'vitest';
import type { Camera } from '../../types/colmap';
import { CameraModelId, UNMATCHED_POINT3D_ID, type Point2D } from '../../types/colmap';
import {
  drawDeletedCrossOverlay,
  drawImagePlaceholder,
  drawKeypoints,
  drawMatchLines,
  type ImageDetailCanvasContext,
} from './imageDetailCanvasDrawing';
import type { MatchViewLayout } from './imageDetailLayoutViewModel';

class RecordingCanvasContext implements ImageDetailCanvasContext {
  fillStyle: string | CanvasGradient | CanvasPattern = '';
  font = '';
  globalAlpha = 1;
  lineCap: CanvasLineCap = 'butt';
  lineWidth = 1;
  strokeStyle: string | CanvasGradient | CanvasPattern = '';
  textAlign: CanvasTextAlign = 'start';
  textBaseline: CanvasTextBaseline = 'alphabetic';
  readonly calls: string[] = [];

  arc(x: number, y: number, radius: number): void {
    this.calls.push(`arc:${x}:${y}:${radius}`);
  }

  beginPath(): void {
    this.calls.push('beginPath');
  }

  clearRect(x: number, y: number, width: number, height: number): void {
    this.calls.push(`clearRect:${x}:${y}:${width}:${height}`);
  }

  fill(): void {
    this.calls.push(`fill:${String(this.fillStyle)}:${this.globalAlpha}`);
  }

  fillRect(x: number, y: number, width: number, height: number): void {
    this.calls.push(`fillRect:${x}:${y}:${width}:${height}:${String(this.fillStyle)}`);
  }

  fillText(text: string, x: number, y: number): void {
    this.calls.push(`fillText:${text}:${x}:${y}`);
  }

  lineTo(x: number, y: number): void {
    this.calls.push(`lineTo:${x}:${y}`);
  }

  measureText(text: string): { width: number } {
    this.calls.push(`measureText:${text}`);
    return { width: text.length * 8 };
  }

  moveTo(x: number, y: number): void {
    this.calls.push(`moveTo:${x}:${y}`);
  }

  roundRect(x: number, y: number, width: number, height: number, radii?: number): void {
    this.calls.push(`roundRect:${x}:${y}:${width}:${height}:${radii}`);
  }

  setLineDash(segments: number[]): void {
    this.calls.push(`setLineDash:${segments.join(',')}`);
  }

  stroke(): void {
    this.calls.push(`stroke:${String(this.strokeStyle)}:${this.globalAlpha}:${this.lineWidth}`);
  }

  strokeRect(x: number, y: number, width: number, height: number): void {
    this.calls.push(`strokeRect:${x}:${y}:${width}:${height}`);
  }
}

describe('image detail canvas drawing', () => {
  it('scales and separates keypoints by 3D match state', () => {
    const ctx = new RecordingCanvasContext();
    const points2D: Point2D[] = [
      { xy: [10, 5], point3DId: UNMATCHED_POINT3D_ID },
      { xy: [20, 10], point3DId: 7n },
    ];

    drawKeypoints(ctx, {
      points2D,
      camera: buildCamera({ width: 100, height: 50 }),
      imageWidth: 200,
      imageHeight: 100,
      showPoints2D: true,
      showPoints3D: false,
    });

    expect(ctx.calls[0]).toBe('clearRect:0:0:200:100');
    expect(ctx.calls).toContain('arc:20:10:2');
    expect(ctx.calls).toContain('arc:40:20:2');
    expect(ctx.calls.filter(call => call.startsWith('fill:'))).toHaveLength(2);
  });

  it('draws match lines and endpoint markers from image placements', () => {
    const ctx = new RecordingCanvasContext();

    drawMatchLines(ctx, {
      lines: [{ point1: [2, 3], point2: [4, 8] }],
      layout: buildMatchLayout(),
      containerWidth: 320,
      containerHeight: 240,
      lineOpacity: 0.4,
    });

    expect(ctx.calls[0]).toBe('clearRect:0:0:320:240');
    expect(ctx.calls).toContain('moveTo:14:29');
    expect(ctx.calls).toContain('lineTo:102:202');
    expect(ctx.calls).toContain('stroke:#00ff00:0.4:1');
    expect(ctx.calls).toContain('arc:14:29:2');
    expect(ctx.calls).toContain('arc:102:202:2');
    expect(ctx.globalAlpha).toBe(1);
  });

  it('clears invalid match canvases without drawing stale geometry', () => {
    const ctx = new RecordingCanvasContext();

    drawMatchLines(ctx, {
      lines: [{ point1: [2, 3], point2: [4, 8] }],
      layout: {
        ...buildMatchLayout(),
        image1: { ...buildMatchLayout().image1, width: 0 },
      },
      containerWidth: 320,
      containerHeight: 240,
      lineOpacity: 0.4,
    });

    expect(ctx.calls).toEqual(['clearRect:0:0:320:240']);
  });

  it('draws image placeholders with checker tiles, bounds, and labels', () => {
    const ctx = new RecordingCanvasContext();

    drawImagePlaceholder(ctx, {
      width: 120,
      height: 60,
      cameraWidth: 4000,
      cameraHeight: 3000,
      label: 'missing.jpg',
    });

    expect(ctx.calls).toContain('fillRect:0:0:10:10:#1e1e1e');
    expect(ctx.calls).toContain('setLineDash:4,4');
    expect(ctx.calls).toContain('strokeRect:0.5:0.5:119:59');
    expect(ctx.calls).toContain('setLineDash:');
    expect(ctx.calls).toContain('measureText:4000 x 3000');
    expect(ctx.calls).toContain('measureText:missing.jpg');
    expect(ctx.calls.some(call => call.startsWith('roundRect:'))).toBe(true);
    expect(ctx.calls.some(call => call.startsWith('fillText:4000 x 3000:60:'))).toBe(true);
    expect(ctx.calls.some(call => call.startsWith('fillText:missing.jpg:60:'))).toBe(true);
  });

  it('draws the deleted overlay as two crossing strokes', () => {
    const ctx = new RecordingCanvasContext();

    drawDeletedCrossOverlay(ctx, { width: 200, height: 100 });

    expect(ctx.calls).toEqual([
      'clearRect:0:0:200:100',
      'beginPath',
      'moveTo:0:0',
      'lineTo:200:100',
      'stroke:#0a0a0a:1:3',
      'beginPath',
      'moveTo:200:0',
      'lineTo:0:100',
      'stroke:#0a0a0a:1:3',
    ]);
    expect(ctx.lineCap).toBe('square');
  });
});

function buildCamera(overrides: Partial<Camera> = {}): Camera {
  return {
    cameraId: 1,
    modelId: CameraModelId.PINHOLE,
    width: 100,
    height: 100,
    params: [],
    ...overrides,
  };
}

function buildMatchLayout(): MatchViewLayout {
  return {
    image1: {
      width: 120,
      height: 80,
      offsetX: 10,
      offsetY: 20,
      scaleX: 2,
      scaleY: 3,
    },
    image2: {
      width: 90,
      height: 60,
      offsetX: 100,
      offsetY: 200,
      scaleX: 0.5,
      scaleY: 0.25,
    },
  };
}
