import type { Camera, Point2D } from '../../types/colmap';
import { UNMATCHED_POINT3D_ID } from '../../types/colmap';
import { CANVAS_COLORS, VIZ_COLORS } from '../../theme';
import type { MatchViewLayout } from './imageDetailLayoutViewModel';

export interface ImageDetailCanvasContext {
  fillStyle: string | CanvasGradient | CanvasPattern;
  font: string;
  globalAlpha: number;
  lineCap: CanvasLineCap;
  lineWidth: number;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void;
  beginPath(): void;
  clearRect(x: number, y: number, width: number, height: number): void;
  fill(): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  fillText(text: string, x: number, y: number): void;
  lineTo(x: number, y: number): void;
  measureText(text: string): { width: number };
  moveTo(x: number, y: number): void;
  roundRect(x: number, y: number, width: number, height: number, radii?: number): void;
  setLineDash(segments: number[]): void;
  stroke(): void;
  strokeRect(x: number, y: number, width: number, height: number): void;
}

export interface DrawKeypointsOptions {
  points2D: Point2D[];
  camera: Camera;
  imageWidth: number;
  imageHeight: number;
  showPoints2D: boolean;
  showPoints3D: boolean;
}

export interface DrawMatchLinesOptions {
  lines: { point1: [number, number]; point2: [number, number] }[];
  layout: MatchViewLayout;
  containerWidth: number;
  containerHeight: number;
  lineOpacity: number;
}

export interface DrawImagePlaceholderOptions {
  width: number;
  height: number;
  cameraWidth: number;
  cameraHeight: number;
  label?: string;
}

export interface DrawDeletedCrossOverlayOptions {
  width: number;
  height: number;
}

interface CanvasPoint {
  x: number;
  y: number;
}

export function drawKeypoints(
  ctx: ImageDetailCanvasContext,
  {
    points2D,
    camera,
    imageWidth,
    imageHeight,
    showPoints2D,
    showPoints3D,
  }: DrawKeypointsOptions
): void {
  ctx.clearRect(0, 0, imageWidth, imageHeight);

  const scaleX = imageWidth / camera.width;
  const scaleY = imageHeight / camera.height;
  const triangulatedPoints: CanvasPoint[] = [];
  const untriangulatedPoints: CanvasPoint[] = [];

  for (const point of points2D) {
    const canvasPoint = {
      x: point.xy[0] * scaleX,
      y: point.xy[1] * scaleY,
    };

    if (point.point3DId !== UNMATCHED_POINT3D_ID) {
      triangulatedPoints.push(canvasPoint);
    } else {
      untriangulatedPoints.push(canvasPoint);
    }
  }

  if (showPoints2D && untriangulatedPoints.length > 0) {
    drawPointSet(ctx, untriangulatedPoints, VIZ_COLORS.point.triangulated);
  }

  if (triangulatedPoints.length > 0 && (showPoints2D || showPoints3D)) {
    drawPointSet(
      ctx,
      triangulatedPoints,
      showPoints3D ? VIZ_COLORS.point.untriangulated : VIZ_COLORS.point.triangulated
    );
  }
}

export function drawMatchLines(
  ctx: ImageDetailCanvasContext,
  {
    lines,
    layout,
    containerWidth,
    containerHeight,
    lineOpacity,
  }: DrawMatchLinesOptions
): void {
  if (
    layout.image1.width <= 0 ||
    layout.image1.height <= 0 ||
    layout.image2.width <= 0 ||
    layout.image2.height <= 0 ||
    containerWidth <= 0 ||
    containerHeight <= 0
  ) {
    ctx.clearRect(0, 0, containerWidth, containerHeight);
    return;
  }

  ctx.clearRect(0, 0, containerWidth, containerHeight);
  ctx.strokeStyle = VIZ_COLORS.point.triangulated;
  ctx.lineWidth = 1;
  ctx.globalAlpha = lineOpacity;

  for (const { point1, point2 } of lines) {
    const endpoints = getMatchLineEndpoints(point1, point2, layout);
    ctx.beginPath();
    ctx.moveTo(endpoints.x1, endpoints.y1);
    ctx.lineTo(endpoints.x2, endpoints.y2);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
  ctx.fillStyle = VIZ_COLORS.point.triangulated;
  for (const { point1, point2 } of lines) {
    const endpoints = getMatchLineEndpoints(point1, point2, layout);
    drawCircle(ctx, endpoints.x1, endpoints.y1, 2);
    drawCircle(ctx, endpoints.x2, endpoints.y2, 2);
  }
}

export function drawImagePlaceholder(
  ctx: ImageDetailCanvasContext,
  {
    width,
    height,
    cameraWidth,
    cameraHeight,
    label,
  }: DrawImagePlaceholderOptions
): void {
  if (width <= 0 || height <= 0) return;

  const tileSize = Math.max(10, Math.min(30, width / 15));
  const darkColor = CANVAS_COLORS.bgSecondary;
  const lightColor = CANVAS_COLORS.bgTertiary;

  for (let y = 0; y < height; y += tileSize) {
    for (let x = 0; x < width; x += tileSize) {
      const isLight = ((Math.floor(x / tileSize) + Math.floor(y / tileSize)) % 2) === 0;
      ctx.fillStyle = isLight ? lightColor : darkColor;
      ctx.fillRect(x, y, tileSize, tileSize);
    }
  }

  ctx.strokeStyle = CANVAS_COLORS.textMuted;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

  ctx.setLineDash([]);
  const fontSize = Math.max(10, Math.min(16, width / 25));
  ctx.font = `${fontSize}px "JetBrains Mono", "Fira Code", Consolas, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const text1 = `${cameraWidth} x ${cameraHeight}`;
  const text2 = label || 'No image loaded';
  const maxTextWidth = Math.max(ctx.measureText(text1).width, ctx.measureText(text2).width);
  const lineHeight = fontSize * 1.5;
  const padding = 12;
  const bgWidth = maxTextWidth + padding * 2;
  const bgHeight = lineHeight * 2 + padding;

  ctx.fillStyle = CANVAS_COLORS.bgSecondaryOverlay;
  ctx.beginPath();
  ctx.roundRect(
    width / 2 - bgWidth / 2,
    height / 2 - bgHeight / 2,
    bgWidth,
    bgHeight,
    4
  );
  ctx.fill();

  ctx.fillStyle = CANVAS_COLORS.textPrimary;
  ctx.fillText(text1, width / 2, height / 2 - lineHeight * 0.35);
  ctx.fillStyle = CANVAS_COLORS.textMuted;
  ctx.fillText(text2, width / 2, height / 2 + lineHeight * 0.5);
}

export function drawDeletedCrossOverlay(
  ctx: ImageDetailCanvasContext,
  { width, height }: DrawDeletedCrossOverlayOptions
): void {
  if (width <= 0 || height <= 0) return;

  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = CANVAS_COLORS.bgVoid;
  ctx.lineWidth = Math.max(3, Math.min(width, height) * 0.025);
  ctx.lineCap = 'square';

  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(width, height);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(width, 0);
  ctx.lineTo(0, height);
  ctx.stroke();
}

function drawPointSet(ctx: ImageDetailCanvasContext, points: CanvasPoint[], color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (const { x, y } of points) {
    ctx.moveTo(x + 2, y);
    ctx.arc(x, y, 2, 0, Math.PI * 2);
  }
  ctx.fill();
}

function drawCircle(ctx: ImageDetailCanvasContext, x: number, y: number, radius: number): void {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function getMatchLineEndpoints(
  point1: [number, number],
  point2: [number, number],
  layout: MatchViewLayout
): { x1: number; y1: number; x2: number; y2: number } {
  return {
    x1: layout.image1.offsetX + point1[0] * layout.image1.scaleX,
    y1: layout.image1.offsetY + point1[1] * layout.image1.scaleY,
    x2: layout.image2.offsetX + point2[0] * layout.image2.scaleX,
    y2: layout.image2.offsetY + point2[1] * layout.image2.scaleY,
  };
}
