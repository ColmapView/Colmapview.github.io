import { memo, useEffect, useRef, type CSSProperties } from 'react';
import type { Camera, Point2D } from '../../types/colmap';
import type { MatchViewLayout } from './imageDetailLayoutViewModel';
import {
  drawDeletedCrossOverlay,
  drawImagePlaceholder,
  drawKeypoints,
  drawMatchLines,
} from './imageDetailCanvasDrawing';
import { buildCameraPoseDisplayModel } from './imageDetailCameraPoseViewModel';
import {
  getCenteredCanvasOverlayState,
  getSizedCanvasOverlayState,
} from './imageDetailMediaViewModel';

export function CameraPoseInfoDisplay({ camera, qvec, tvec }: { camera: Camera; qvec: number[]; tvec: number[] }) {
  const poseInfo = buildCameraPoseDisplayModel(camera, qvec, tvec);

  return (
    <div className="flex items-center gap-2 text-xs flex-wrap">
      <span className="text-ds-accent font-mono" title={poseInfo.modelTitle}>{poseInfo.modelName}</span>
      <span className="text-ds-muted">|</span>
      <span className="font-mono text-ds-primary">
        {poseInfo.width}<span className="text-ds-muted">x</span>{poseInfo.height}
      </span>
      <span className="text-ds-muted">|</span>
      <span className="font-mono">
        {poseInfo.parameters.map((parameter, index) => (
          <span key={index}>
            {index > 0 && <span className="text-ds-muted">, </span>}
            <span className="text-ds-muted">{parameter.name}=</span>
            <span className="text-ds-primary">{parameter.value}</span>
          </span>
        ))}
      </span>
      <span className="text-ds-muted">|</span>
      <span className="font-mono">
        <span className="text-ds-muted">R=</span>
        {poseInfo.rotation.map((value, index) => (
          <span key={index}>
            {index > 0 && <span className="text-ds-muted">,</span>}
            <span className={value.className}>{value.value}</span>
          </span>
        ))}
      </span>
      <span className="text-ds-muted">|</span>
      <span className="font-mono">
        <span className="text-ds-muted">T=</span>
        {poseInfo.translation.map((value, index) => (
          <span key={index}>
            {index > 0 && <span className="text-ds-muted">,</span>}
            <span className={value.className}>{value.value}</span>
          </span>
        ))}
      </span>
    </div>
  );
}

interface KeypointCanvasProps {
  points2D: Point2D[];
  camera: Camera;
  imageWidth: number;
  imageHeight: number;
  containerWidth: number;
  containerHeight: number;
  showPoints2D: boolean;
  showPoints3D: boolean;
}

export const KeypointCanvas = memo(function KeypointCanvas({
  points2D,
  camera,
  imageWidth,
  imageHeight,
  containerWidth,
  containerHeight,
  showPoints2D,
  showPoints3D,
}: KeypointCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    drawKeypoints(ctx, {
      points2D,
      camera,
      imageWidth,
      imageHeight,
      showPoints2D,
      showPoints3D,
    });
  }, [points2D, camera, imageWidth, imageHeight, showPoints2D, showPoints3D]);

  const canvasState = getCenteredCanvasOverlayState({
    imageWidth,
    imageHeight,
    containerWidth,
    containerHeight,
  });

  if (!canvasState.canRender) return null;

  return (
    <canvas
      ref={canvasRef}
      width={canvasState.width}
      height={canvasState.height}
      className="absolute pointer-events-none"
      style={canvasState.style}
    />
  );
});

interface MatchCanvasProps {
  lines: { point1: [number, number]; point2: [number, number] }[];
  layout: MatchViewLayout;
  containerWidth: number;
  containerHeight: number;
  lineOpacity: number;
}

export const MatchCanvas = memo(function MatchCanvas({
  lines,
  layout,
  containerWidth,
  containerHeight,
  lineOpacity,
}: MatchCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    drawMatchLines(ctx, {
      lines,
      layout,
      containerWidth,
      containerHeight,
      lineOpacity,
    });
  }, [lines, layout, containerWidth, containerHeight, lineOpacity]);

  return (
    <canvas
      ref={canvasRef}
      width={containerWidth}
      height={containerHeight}
      className="absolute inset-0 pointer-events-none"
    />
  );
});

interface ImagePlaceholderProps {
  width: number;
  height: number;
  cameraWidth: number;
  cameraHeight: number;
  label?: string;
  style?: CSSProperties;
}

export function ImagePlaceholder({ width, height, cameraWidth, cameraHeight, label, style }: ImagePlaceholderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasState = getSizedCanvasOverlayState({ width, height, style });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0 || height <= 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    drawImagePlaceholder(ctx, {
      width,
      height,
      cameraWidth,
      cameraHeight,
      label,
    });
  }, [width, height, cameraWidth, cameraHeight, label]);

  if (!canvasState.canRender) return null;

  return (
    <canvas
      ref={canvasRef}
      width={canvasState.width}
      height={canvasState.height}
      style={canvasState.style}
    />
  );
}

interface DeletedCrossOverlayProps {
  width: number;
  height: number;
  style?: CSSProperties;
}

export function DeletedCrossOverlay({ width, height, style }: DeletedCrossOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasState = getSizedCanvasOverlayState({ width, height, style });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0 || height <= 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    drawDeletedCrossOverlay(ctx, { width, height });
  }, [width, height]);

  if (!canvasState.canRender) return null;

  return (
    <canvas
      ref={canvasRef}
      width={canvasState.width}
      height={canvasState.height}
      className="pointer-events-none"
      style={canvasState.style}
    />
  );
}
