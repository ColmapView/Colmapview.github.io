import { useEffect, useRef, useState, useCallback, useMemo, memo } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useReconstructionStore, selectCameraCount, useUIStore, useDeletionStore } from '../../store';
import type { Camera, Point2D } from '../../types/colmap';
import { getImageFile, getMaskFile, getUrlImageCached, fetchUrlImage, fetchUrlMask, getZipImageCached, fetchZipImage, fetchZipMask, isZipLoadingAvailable } from '../../utils/imageFileUtils';
import { useFileUrl } from '../../hooks/useFileUrl';
import { SIZE, TIMING, GAP, VIZ_COLORS, OPACITY, MODAL, TOUCH, buttonStyles, inputStyles, resizeHandleStyles, modalStyles, touchStyles } from '../../theme';
import { HOTKEYS } from '../../config/hotkeys';
import { ModalErrorBoundary } from './ModalErrorBoundary';

const CAMERA_MODEL_NAMES: Record<number, string> = {
  0: 'SIMPLE_PINHOLE',
  1: 'PINHOLE',
  2: 'SIMPLE_RADIAL',
  3: 'RADIAL',
  4: 'OPENCV',
  5: 'OPENCV_FISHEYE',
  6: 'FULL_OPENCV',
  7: 'FOV',
  8: 'SIMPLE_RADIAL_FISHEYE',
  9: 'RADIAL_FISHEYE',
  10: 'THIN_PRISM_FISHEYE',
};

const CAMERA_PARAM_NAMES: Record<number, string> = {
  0: 'f, cx, cy',
  1: 'fx, fy, cx, cy',
  2: 'f, cx, cy, k',
  3: 'f, cx, cy, k1, k2',
  4: 'fx, fy, cx, cy, k1, k2, p1, p2',
  5: 'fx, fy, cx, cy, k1, k2, k3, k4',
  6: 'fx, fy, cx, cy, k1, k2, p1, p2, k3, k4, k5, k6',
  7: 'fx, fy, cx, cy, omega',
  8: 'f, cx, cy, k',
  9: 'f, cx, cy, k1, k2',
  10: 'fx, fy, cx, cy, k1, k2, p1, p2, k3, k4, sx1, sy1',
};

// Format camera parameter with appropriate precision
// Large values (>=1): show 1 decimal place
// Small values (<1): show 4 significant figures to capture distortion coefficients
function formatParam(value: number): string {
  const absVal = Math.abs(value);
  if (absVal >= 1) {
    return value.toFixed(1);
  }
  if (absVal === 0) {
    return '0';
  }
  return value.toPrecision(4);
}

// Component to display camera info and pose in a single compact line
function CameraPoseInfoDisplay({ camera, qvec, tvec }: { camera: Camera; qvec: number[]; tvec: number[] }) {
  const modelName = CAMERA_MODEL_NAMES[camera.modelId] || `MODEL_${camera.modelId}`;
  const paramNames = (CAMERA_PARAM_NAMES[camera.modelId] || '').split(', ');
  // Convert to xyzw order for display (COLMAP uses wxyz internally)
  const rotXyzw = [qvec[1], qvec[2], qvec[3], qvec[0]];

  return (
    <div className="flex items-center gap-2 text-xs flex-wrap">
      {/* Camera Model */}
      <span className="text-ds-accent font-mono">{modelName}</span>
      <span className="text-ds-muted">|</span>

      {/* Size */}
      <span className="font-mono text-ds-primary">{camera.width}<span className="text-ds-muted">×</span>{camera.height}</span>
      <span className="text-ds-muted">|</span>

      {/* Intrinsics */}
      <span className="font-mono">
        {camera.params.map((p, i) => (
          <span key={i}>
            {i > 0 && <span className="text-ds-muted">, </span>}
            <span className="text-ds-muted">{paramNames[i] || `p${i}`}=</span>
            <span className="text-ds-primary">{formatParam(p)}</span>
          </span>
        ))}
      </span>
      <span className="text-ds-muted">|</span>

      {/* Rotation */}
      <span className="font-mono">
        <span className="text-ds-muted">R=</span>
        {rotXyzw.map((v, i) => (
          <span key={i}>
            {i > 0 && <span className="text-ds-muted">,</span>}
            <span className={v < 0 ? 'text-ds-error' : 'text-ds-primary'}>{v.toFixed(3)}</span>
          </span>
        ))}
      </span>
      <span className="text-ds-muted">|</span>

      {/* Translation */}
      <span className="font-mono">
        <span className="text-ds-muted">T=</span>
        {tvec.map((v, i) => (
          <span key={i}>
            {i > 0 && <span className="text-ds-muted">,</span>}
            <span className={v < 0 ? 'text-ds-error' : 'text-ds-primary'}>{v.toFixed(2)}</span>
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

const KeypointCanvas = memo(function KeypointCanvas({
  points2D,
  camera,
  imageWidth,
  imageHeight,
  containerWidth,
  containerHeight,
  showPoints2D,
  showPoints3D
}: KeypointCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const scaleX = imageWidth / camera.width;
    const scaleY = imageHeight / camera.height;

    const triangulatedPoints: { x: number; y: number }[] = [];
    const untriangulatedPoints: { x: number; y: number }[] = [];

    // showPoints2D: show all points in green
    // showPoints3D: show triangulated points in red (independent)
    for (const point of points2D) {
      const isTriangulated = point.point3DId !== BigInt(-1);

      const x = point.xy[0] * scaleX;
      const y = point.xy[1] * scaleY;

      if (isTriangulated) {
        triangulatedPoints.push({ x, y });
      } else {
        untriangulatedPoints.push({ x, y });
      }
    }

    // Draw untriangulated points in green (only when showPoints2D is on)
    if (showPoints2D && untriangulatedPoints.length > 0) {
      ctx.fillStyle = VIZ_COLORS.point.triangulated;
      ctx.beginPath();
      for (const { x, y } of untriangulatedPoints) {
        ctx.moveTo(x + 2, y);
        ctx.arc(x, y, 2, 0, Math.PI * 2);
      }
      ctx.fill();
    }

    // Draw triangulated points
    // - Green when only showPoints2D is on
    // - Red when showPoints3D is on
    if (triangulatedPoints.length > 0 && (showPoints2D || showPoints3D)) {
      ctx.fillStyle = showPoints3D ? VIZ_COLORS.point.untriangulated : VIZ_COLORS.point.triangulated;
      ctx.beginPath();
      for (const { x, y } of triangulatedPoints) {
        ctx.moveTo(x + 2, y);
        ctx.arc(x, y, 2, 0, Math.PI * 2);
      }
      ctx.fill();
    }
  }, [points2D, camera, imageWidth, imageHeight, showPoints2D, showPoints3D]);

  const offsetX = (containerWidth - imageWidth) / 2;
  const offsetY = (containerHeight - imageHeight) / 2;

  return (
    <canvas
      ref={canvasRef}
      width={imageWidth}
      height={imageHeight}
      className="absolute pointer-events-none"
      style={{
        left: offsetX,
        top: offsetY,
      }}
    />
  );
});

interface MatchCanvasProps {
  lines: { point1: [number, number]; point2: [number, number] }[];
  image1Camera: Camera;
  image2Camera: Camera;
  image1Width: number;
  image1Height: number;
  image2Width: number;
  image2Height: number;
  containerWidth: number;
  containerHeight: number;
  gap: number;
  lineOpacity: number;
}

const MatchCanvas = memo(function MatchCanvas({
  lines,
  image1Camera,
  image2Camera,
  image1Width,
  image1Height,
  image2Width,
  image2Height,
  containerWidth,
  containerHeight,
  gap,
  lineOpacity
}: MatchCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Validate all dimensions are positive to avoid division by zero or invalid scaling
    if (image1Width <= 0 || image1Height <= 0 || image2Width <= 0 || image2Height <= 0 ||
        image1Camera.width <= 0 || image1Camera.height <= 0 ||
        image2Camera.width <= 0 || image2Camera.height <= 0 ||
        containerWidth <= 0 || containerHeight <= 0) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const halfWidth = (containerWidth - gap) / 2;
    const offset1X = (halfWidth - image1Width) / 2;
    const offset1Y = (containerHeight - image1Height) / 2;
    const offset2X = halfWidth + gap + (halfWidth - image2Width) / 2;
    const offset2Y = (containerHeight - image2Height) / 2;

    const scale1X = image1Width / image1Camera.width;
    const scale1Y = image1Height / image1Camera.height;
    const scale2X = image2Width / image2Camera.width;
    const scale2Y = image2Height / image2Camera.height;

    ctx.strokeStyle = VIZ_COLORS.point.triangulated;
    ctx.lineWidth = 1;
    ctx.globalAlpha = lineOpacity;

    for (const { point1, point2 } of lines) {
      const x1 = offset1X + point1[0] * scale1X;
      const y1 = offset1Y + point1[1] * scale1Y;
      const x2 = offset2X + point2[0] * scale2X;
      const y2 = offset2Y + point2[1] * scale2Y;

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
    ctx.fillStyle = VIZ_COLORS.point.triangulated;
    for (const { point1, point2 } of lines) {
      const x1 = offset1X + point1[0] * scale1X;
      const y1 = offset1Y + point1[1] * scale1Y;
      const x2 = offset2X + point2[0] * scale2X;
      const y2 = offset2Y + point2[1] * scale2Y;

      ctx.beginPath();
      ctx.arc(x1, y1, 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(x2, y2, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [lines, image1Camera, image2Camera, image1Width, image1Height, image2Width, image2Height, containerWidth, containerHeight, gap, lineOpacity]);

  return (
    <canvas
      ref={canvasRef}
      width={containerWidth}
      height={containerHeight}
      className="absolute inset-0 pointer-events-none"
    />
  );
});

// Vertical match canvas for touch mode (images stacked top-bottom)
interface VerticalMatchCanvasProps {
  lines: { point1: [number, number]; point2: [number, number] }[];
  image1Camera: Camera;
  image2Camera: Camera;
  image1Width: number;
  image1Height: number;
  image2Width: number;
  image2Height: number;
  containerWidth: number;
  containerHeight: number;
  gap: number;
  lineOpacity: number;
}

const VerticalMatchCanvas = memo(function VerticalMatchCanvas({
  lines,
  image1Camera,
  image2Camera,
  image1Width,
  image1Height,
  image2Width,
  image2Height,
  containerWidth,
  containerHeight,
  gap,
  lineOpacity
}: VerticalMatchCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Validate all dimensions are positive
    if (image1Width <= 0 || image1Height <= 0 || image2Width <= 0 || image2Height <= 0 ||
        image1Camera.width <= 0 || image1Camera.height <= 0 ||
        image2Camera.width <= 0 || image2Camera.height <= 0 ||
        containerWidth <= 0 || containerHeight <= 0) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Vertical layout: images stacked top-bottom
    const halfHeight = (containerHeight - gap) / 2;
    const offset1X = (containerWidth - image1Width) / 2;
    const offset1Y = (halfHeight - image1Height) / 2;
    const offset2X = (containerWidth - image2Width) / 2;
    const offset2Y = halfHeight + gap + (halfHeight - image2Height) / 2;

    const scale1X = image1Width / image1Camera.width;
    const scale1Y = image1Height / image1Camera.height;
    const scale2X = image2Width / image2Camera.width;
    const scale2Y = image2Height / image2Camera.height;

    ctx.strokeStyle = VIZ_COLORS.point.triangulated;
    ctx.lineWidth = 1;
    ctx.globalAlpha = lineOpacity;

    for (const { point1, point2 } of lines) {
      const x1 = offset1X + point1[0] * scale1X;
      const y1 = offset1Y + point1[1] * scale1Y;
      const x2 = offset2X + point2[0] * scale2X;
      const y2 = offset2Y + point2[1] * scale2Y;

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
    ctx.fillStyle = VIZ_COLORS.point.triangulated;
    for (const { point1, point2 } of lines) {
      const x1 = offset1X + point1[0] * scale1X;
      const y1 = offset1Y + point1[1] * scale1Y;
      const x2 = offset2X + point2[0] * scale2X;
      const y2 = offset2Y + point2[1] * scale2Y;

      ctx.beginPath();
      ctx.arc(x1, y1, 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(x2, y2, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [lines, image1Camera, image2Camera, image1Width, image1Height, image2Width, image2Height, containerWidth, containerHeight, gap, lineOpacity]);

  return (
    <canvas
      ref={canvasRef}
      width={containerWidth}
      height={containerHeight}
      className="absolute inset-0 pointer-events-none"
    />
  );
});

const MIN_WIDTH = SIZE.modalMinWidth;
const MIN_HEIGHT = SIZE.modalMinHeight;
const RESIZE_DEBOUNCE_MS = TIMING.resizeDebounce;

// Placeholder component for when image is not loaded
// Uses canvas to create a proper placeholder image with correct dimensions
interface ImagePlaceholderProps {
  width: number;
  height: number;
  cameraWidth: number;
  cameraHeight: number;
  label?: string;
  style?: React.CSSProperties;
}

// Design system colors (from CSS variables)
const DS_COLORS = {
  bgSecondary: '#161616',
  bgTertiary: '#1e1e1e',
  textPrimary: '#e8e8e8',
  textSecondary: '#8a8a8a',
  textMuted: '#5a5a5a',
};

function ImagePlaceholder({ width, height, cameraWidth, cameraHeight, label, style }: ImagePlaceholderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0 || height <= 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw checkerboard pattern using design system colors
    const tileSize = Math.max(10, Math.min(30, width / 15));
    const darkColor = DS_COLORS.bgSecondary;
    const lightColor = DS_COLORS.bgTertiary;

    for (let y = 0; y < height; y += tileSize) {
      for (let x = 0; x < width; x += tileSize) {
        const isLight = ((Math.floor(x / tileSize) + Math.floor(y / tileSize)) % 2) === 0;
        ctx.fillStyle = isLight ? lightColor : darkColor;
        ctx.fillRect(x, y, tileSize, tileSize);
      }
    }

    // Draw border
    ctx.strokeStyle = DS_COLORS.textMuted;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

    // Draw text in center using monospace font
    ctx.setLineDash([]);
    const fontSize = Math.max(10, Math.min(16, width / 25));
    ctx.font = `${fontSize}px "JetBrains Mono", "Fira Code", Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Text content
    const text1 = `${cameraWidth} × ${cameraHeight}`;
    const text2 = label || 'No image loaded';
    const textMetrics1 = ctx.measureText(text1);
    const textMetrics2 = ctx.measureText(text2);
    const maxTextWidth = Math.max(textMetrics1.width, textMetrics2.width);
    const lineHeight = fontSize * 1.5;
    const padding = 12;

    // Background pill for text
    const bgWidth = maxTextWidth + padding * 2;
    const bgHeight = lineHeight * 2 + padding;
    ctx.fillStyle = 'rgba(22, 22, 22, 0.85)';
    ctx.beginPath();
    ctx.roundRect(
      width / 2 - bgWidth / 2,
      height / 2 - bgHeight / 2,
      bgWidth,
      bgHeight,
      4
    );
    ctx.fill();

    // Draw dimension text (primary color)
    ctx.fillStyle = DS_COLORS.textPrimary;
    ctx.fillText(text1, width / 2, height / 2 - lineHeight * 0.35);

    // Draw label text (muted color)
    ctx.fillStyle = DS_COLORS.textMuted;
    ctx.fillText(text2, width / 2, height / 2 + lineHeight * 0.5);
  }, [width, height, cameraWidth, cameraHeight, label]);

  if (width <= 0 || height <= 0) return null;

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{
        ...style,
        width,
        height,
      }}
    />
  );
}

// Cross overlay for deleted images - uses background color
interface DeletedCrossOverlayProps {
  width: number;
  height: number;
  style?: React.CSSProperties;
}

function DeletedCrossOverlay({ width, height, style }: DeletedCrossOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0 || height <= 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw cross using background color - extends to borders
    const strokeWidth = Math.max(3, Math.min(width, height) * 0.025);

    ctx.strokeStyle = '#0a0a0a'; // bg-ds-primary (dark background)
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = 'square';

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(width, height);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(width, 0);
    ctx.lineTo(0, height);
    ctx.stroke();
  }, [width, height]);

  if (width <= 0 || height <= 0) return null;

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="pointer-events-none"
      style={{
        ...style,
        width,
        height,
      }}
    />
  );
}

// Maximum number of images to cache lazy-loaded points for (LRU-style)
const MAX_LAZY_CACHE_SIZE = 20;

export function ImageDetailModal() {
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const loadedFiles = useReconstructionStore((s) => s.loadedFiles);
  const imageUrlBase = useReconstructionStore((s) => s.imageUrlBase);
  const maskUrlBase = useReconstructionStore((s) => s.maskUrlBase);
  const wasmReconstruction = useReconstructionStore((s) => s.wasmReconstruction);
  // Track URL/ZIP image cache version to trigger re-renders when images are fetched
  const [urlImageCacheVersion, setUrlImageCacheVersion] = useState(0);
  const [zipImageCacheVersion, setZipImageCacheVersion] = useState(0);
  // Track mask file fetched from URL or ZIP (lazy loaded, no cache)
  const [urlMaskFile, setUrlMaskFile] = useState<File | null>(null);
  const [zipMaskFile, setZipMaskFile] = useState<File | null>(null);
  const imageDetailId = useUIStore((s) => s.imageDetailId);
  const closeImageDetail = useUIStore((s) => s.closeImageDetail);
  const openImageDetail = useUIStore((s) => s.openImageDetail);
  const showPoints2D = useUIStore((s) => s.showPoints2D);
  const showPoints3D = useUIStore((s) => s.showPoints3D);
  const setShowPoints2D = useUIStore((s) => s.setShowPoints2D);
  const setShowPoints3D = useUIStore((s) => s.setShowPoints3D);
  const showMatchesInModal = useUIStore((s) => s.showMatchesInModal);
  const setShowMatchesInModal = useUIStore((s) => s.setShowMatchesInModal);
  const matchedImageId = useUIStore((s) => s.matchedImageId);
  const setMatchedImageId = useUIStore((s) => s.setMatchedImageId);
  const touchMode = useUIStore((s) => s.touchMode);
  const showModalControls = useUIStore((s) => s.touchUI.modalControls);

  // Deletion state
  const pendingDeletions = useDeletionStore((s) => s.pendingDeletions);
  const toggleDeletion = useDeletionStore((s) => s.toggleDeletion);
  const markBulkForDeletion = useDeletionStore((s) => s.markBulkForDeletion);
  const unmarkBulkDeletion = useDeletionStore((s) => s.unmarkBulkDeletion);
  const multiCamera = useReconstructionStore(selectCameraCount) > 1;

  // Check if current image is marked for deletion
  const isMarkedForDeletion = imageDetailId !== null && pendingDeletions.has(imageDetailId);

  // Handle delete/restore button click
  const handleDeleteToggle = useCallback(() => {
    if (imageDetailId === null) return;

    if (isMarkedForDeletion) {
      // Restore - no confirmation needed
      toggleDeletion(imageDetailId);
    } else {
      // Mark for deletion - confirm with user
      if (window.confirm('Mark this image for deletion? You can restore it or apply the deletion later.')) {
        toggleDeletion(imageDetailId);
      }
    }
  }, [imageDetailId, isMarkedForDeletion, toggleDeletion]);

  // Image IDs sharing the same camera as the current image
  const cameraImageIds = useMemo(() => {
    if (!reconstruction || imageDetailId === null) return [];
    const currentImage = reconstruction.images.get(imageDetailId);
    if (!currentImage) return [];
    const ids: number[] = [];
    for (const [id, img] of reconstruction.images) {
      if (img.cameraId === currentImage.cameraId) ids.push(id);
    }
    return ids;
  }, [reconstruction, imageDetailId]);

  // Image IDs in the same frame as the current image
  const frameImageIds = useMemo(() => {
    if (!reconstruction?.rigData || imageDetailId === null) return [];
    for (const [, frame] of reconstruction.rigData.frames) {
      if (frame.dataIds.some((d) => d.dataId === imageDetailId)) {
        return frame.dataIds
          .filter((d) => reconstruction.images.has(d.dataId))
          .map((d) => d.dataId);
      }
    }
    return [];
  }, [reconstruction, imageDetailId]);

  // Whether all camera/frame images are already marked for deletion
  const cameraAllMarked = cameraImageIds.length > 0 && cameraImageIds.every((id) => pendingDeletions.has(id));
  const frameAllMarked = frameImageIds.length > 0 && frameImageIds.every((id) => pendingDeletions.has(id));

  // Toggle camera images deletion
  const handleToggleCamera = useCallback(() => {
    if (cameraImageIds.length === 0) return;
    if (cameraAllMarked) {
      unmarkBulkDeletion(cameraImageIds);
    } else {
      markBulkForDeletion(cameraImageIds);
    }
  }, [cameraImageIds, cameraAllMarked, markBulkForDeletion, unmarkBulkDeletion]);

  // Toggle frame images deletion
  const handleToggleFrame = useCallback(() => {
    if (frameImageIds.length === 0) return;
    if (frameAllMarked) {
      unmarkBulkDeletion(frameImageIds);
    } else {
      markBulkForDeletion(frameImageIds);
    }
  }, [frameImageIds, frameAllMarked, markBulkForDeletion, unmarkBulkDeletion]);

  // Match line opacity state (default from theme)
  const [matchLineOpacity, setMatchLineOpacity] = useState<number>(OPACITY.matchLines);
  const [isEditingOpacity, setIsEditingOpacity] = useState(false);
  const [opacityInputValue, setOpacityInputValue] = useState('');
  const opacityInputRef = useRef<HTMLInputElement>(null);

  // Lazy-loaded 2D points cache (for images where points2D is empty but WASM has data)
  // Cache is keyed by imageId but must be cleared when wasmReconstruction changes
  const [lazyPoints2D, setLazyPoints2D] = useState<Map<number, Point2D[]>>(new Map());
  const lazyLoadOrder = useRef<number[]>([]);  // Track order for LRU eviction
  const prevWasmRef = useRef<typeof wasmReconstruction>(null);

  // Clear lazy cache when wasmReconstruction changes (new dataset loaded)
  // This must run BEFORE the lazy loading effect to prevent stale data
  useEffect(() => {
    if (wasmReconstruction !== prevWasmRef.current) {
      prevWasmRef.current = wasmReconstruction;
      // Always clear on wasmReconstruction change, even if cache appears empty
      setLazyPoints2D(new Map());
      lazyLoadOrder.current = [];
    }
  }, [wasmReconstruction]);

  // Lazy load 2D points when visualization is enabled
  useEffect(() => {
    if (!imageDetailId || (!showPoints2D && !showPoints3D && !showMatchesInModal)) return;
    if (!wasmReconstruction) return;
    // Skip if wasmReconstruction just changed (cache clearing effect will run)
    if (wasmReconstruction !== prevWasmRef.current) return;

    const idsToLoad: number[] = [];

    // Check if current image needs 2D points loaded
    // Also load when showMatchesInModal is enabled (need current image's 2D points for match computation)
    if ((showPoints2D || showPoints3D || showMatchesInModal) && !lazyPoints2D.has(imageDetailId)) {
      const img = reconstruction?.images.get(imageDetailId);
      // Only lazy-load if points2D is empty (lite mode) but numPoints2D suggests data exists
      if (img && img.points2D.length === 0 && (img.numPoints2D ?? 0) > 0) {
        idsToLoad.push(imageDetailId);
      }
    }

    // Check if matched image needs 2D points loaded
    if (showMatchesInModal && matchedImageId !== null && !lazyPoints2D.has(matchedImageId)) {
      const matchedImg = reconstruction?.images.get(matchedImageId);
      if (matchedImg && matchedImg.points2D.length === 0 && (matchedImg.numPoints2D ?? 0) > 0) {
        idsToLoad.push(matchedImageId);
      }
    }

    if (idsToLoad.length === 0) return;

    // Load points from WASM
    const newPoints = new Map(lazyPoints2D);
    const newOrder = [...lazyLoadOrder.current];

    for (const id of idsToLoad) {
      const points = wasmReconstruction.getImagePoints2DArray(id);
      if (points.length > 0) {
        newPoints.set(id, points);
        // Update LRU order
        const existingIdx = newOrder.indexOf(id);
        if (existingIdx !== -1) newOrder.splice(existingIdx, 1);
        newOrder.push(id);
      }
    }

    // Evict oldest entries if cache is too large
    while (newOrder.length > MAX_LAZY_CACHE_SIZE) {
      const oldestId = newOrder.shift()!;
      newPoints.delete(oldestId);
    }

    lazyLoadOrder.current = newOrder;
    setLazyPoints2D(newPoints);
  }, [imageDetailId, matchedImageId, showPoints2D, showPoints3D, showMatchesInModal, wasmReconstruction, reconstruction, lazyPoints2D]);

  // Fetch URL images for current and matched images (URL mode only)
  useEffect(() => {
    if (!imageUrlBase || !reconstruction) return;

    const imagesToFetch: string[] = [];

    // Check if current image needs fetching
    if (imageDetailId !== null) {
      const currentImage = reconstruction.images.get(imageDetailId);
      if (currentImage && !getUrlImageCached(currentImage.name)) {
        imagesToFetch.push(currentImage.name);
      }
    }

    // Check if matched image needs fetching
    if (matchedImageId !== null) {
      const matchedImg = reconstruction.images.get(matchedImageId);
      if (matchedImg && !getUrlImageCached(matchedImg.name)) {
        imagesToFetch.push(matchedImg.name);
      }
    }

    if (imagesToFetch.length === 0) return;

    // Fetch images in parallel
    let cancelled = false;
    Promise.all(imagesToFetch.map(name => fetchUrlImage(imageUrlBase, name))).then((results) => {
      if (!cancelled && results.some(f => f !== null)) {
        setUrlImageCacheVersion(v => v + 1);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [imageUrlBase, reconstruction, imageDetailId, matchedImageId]);

  // Fetch ZIP images for current and matched images (ZIP mode only)
  useEffect(() => {
    if (imageUrlBase || !isZipLoadingAvailable() || !reconstruction) return;

    const imagesToFetch: string[] = [];

    // Check if current image needs fetching
    if (imageDetailId !== null) {
      const currentImage = reconstruction.images.get(imageDetailId);
      if (currentImage && !getZipImageCached(currentImage.name)) {
        imagesToFetch.push(currentImage.name);
      }
    }

    // Check if matched image needs fetching
    if (matchedImageId !== null) {
      const matchedImg = reconstruction.images.get(matchedImageId);
      if (matchedImg && !getZipImageCached(matchedImg.name)) {
        imagesToFetch.push(matchedImg.name);
      }
    }

    if (imagesToFetch.length === 0) return;

    // Fetch images in parallel
    let cancelled = false;
    Promise.all(imagesToFetch.map(name => fetchZipImage(name))).then((results) => {
      if (!cancelled && results.some(f => f !== null)) {
        setZipImageCacheVersion(v => v + 1);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [imageUrlBase, reconstruction, imageDetailId, matchedImageId]);

  // Fetch URL mask for current image (URL mode only, lazy loaded, no cache)
  useEffect(() => {
    // Clear mask when image changes
    setUrlMaskFile(null);

    if (!maskUrlBase || !reconstruction || imageDetailId === null) return;

    const currentImage = reconstruction.images.get(imageDetailId);
    if (!currentImage) return;

    let cancelled = false;
    fetchUrlMask(maskUrlBase, currentImage.name).then((file) => {
      if (!cancelled) {
        setUrlMaskFile(file);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [maskUrlBase, reconstruction, imageDetailId]);

  // Fetch ZIP mask for current image (ZIP mode only, lazy loaded, no cache)
  useEffect(() => {
    // Clear mask when image changes
    setZipMaskFile(null);

    if (maskUrlBase || !isZipLoadingAvailable() || !reconstruction || imageDetailId === null) return;

    const currentImage = reconstruction.images.get(imageDetailId);
    if (!currentImage) return;

    let cancelled = false;
    fetchZipMask(currentImage.name).then((file) => {
      if (!cancelled) {
        setZipMaskFile(file);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [maskUrlBase, reconstruction, imageDetailId]);

  // Get sorted list of image IDs for navigation
  const imageIds = useMemo(() => {
    if (!reconstruction) return [];
    return Array.from(reconstruction.images.keys()).sort((a, b) => a - b);
  }, [reconstruction]);

  const currentIndex = imageDetailId !== null ? imageIds.indexOf(imageDetailId) : -1;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < imageIds.length - 1;

  const goToPrev = useCallback(() => {
    if (hasPrev) {
      openImageDetail(imageIds[currentIndex - 1]);
    }
  }, [hasPrev, imageIds, currentIndex, openImageDetail]);

  const goToNext = useCallback(() => {
    if (hasNext) {
      openImageDetail(imageIds[currentIndex + 1]);
    }
  }, [hasNext, imageIds, currentIndex, openImageDetail]);

  // Opacity input focus effect
  useEffect(() => {
    if (isEditingOpacity && opacityInputRef.current) {
      opacityInputRef.current.focus();
      opacityInputRef.current.select();
    }
  }, [isEditingOpacity]);

  const handleOpacityDoubleClick = useCallback(() => {
    setOpacityInputValue(String(Math.round(matchLineOpacity * 100)));
    setIsEditingOpacity(true);
  }, [matchLineOpacity]);

  const applyOpacityValue = useCallback(() => {
    const parsed = parseFloat(opacityInputValue);
    if (!isNaN(parsed)) {
      const clamped = Math.min(100, Math.max(0, parsed)) / 100;
      setMatchLineOpacity(clamped);
    }
    setIsEditingOpacity(false);
  }, [opacityInputValue]);

  const handleOpacityKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      applyOpacityValue();
    } else if (e.key === 'Escape') {
      setIsEditingOpacity(false);
    }
  }, [applyOpacityValue]);

  const handleOpacityWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const step = 0.05;
    const delta = e.deltaY > 0 ? -step : step;
    const newValue = Math.min(1, Math.max(0, matchLineOpacity + delta));
    setMatchLineOpacity(newValue);
  }, [matchLineOpacity]);

  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const imageContainerRef = useRef<HTMLDivElement>(null);

  // Position and size state for draggable/resizable
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ width: 800, height: 600 }); // Will be recalculated on open
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState<string | null>(null);
  const dragStart = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const resizeStart = useRef({ x: 0, y: 0, width: 0, height: 0, posX: 0, posY: 0 });

  const image = imageDetailId !== null ? reconstruction?.images.get(imageDetailId) : null;
  const camera = image ? reconstruction?.cameras.get(image.cameraId) : null;
  // Get image file - use URL cache if in URL mode, ZIP cache if ZIP mode, otherwise local files
  const imageFile = useMemo(() => {
    if (!image) return null;
    if (imageUrlBase) {
      return getUrlImageCached(image.name) ?? null;
    }
    if (isZipLoadingAvailable()) {
      return getZipImageCached(image.name) ?? null;
    }
    return getImageFile(loadedFiles?.imageFiles, image.name) ?? null;
  }, [image, imageUrlBase, loadedFiles?.imageFiles, urlImageCacheVersion, zipImageCacheVersion]);
  // Get mask file - use URL fetched mask if in URL mode, ZIP fetched mask if ZIP mode, otherwise local files
  const maskFile = useMemo(() => {
    if (!image) return null;
    // URL mode: use lazy-loaded mask from URL
    if (maskUrlBase) {
      return urlMaskFile;
    }
    // ZIP mode: use lazy-loaded mask from ZIP
    if (isZipLoadingAvailable()) {
      return zipMaskFile;
    }
    // Local mode: look for mask if masks folder exists
    if (loadedFiles?.hasMasks) {
      return getMaskFile(loadedFiles?.imageFiles, image.name) ?? null;
    }
    return null;
  }, [image, maskUrlBase, urlMaskFile, zipMaskFile, loadedFiles?.hasMasks, loadedFiles?.imageFiles]);
  const hasMask = !!maskFile;

  // Mask display mode: 'hover' (default), 'mask', 'image', 'split'
  // - hover: mask shows on hover with 50% opacity
  // - mask: mask fully visible
  // - image: mask hidden
  // - split: half image, half mask (vertical split at mouse X)
  type MaskMode = 'hover' | 'mask' | 'image' | 'split';
  const [maskMode, setMaskMode] = useState<MaskMode>('hover');
  const [splitX, setSplitX] = useState(0.5); // Split position as fraction (0-1)

  // Cycle through mask modes on click
  const cycleMaskMode = useCallback(() => {
    setMaskMode(prev => {
      const modes: MaskMode[] = ['hover', 'mask', 'split', 'image'];
      const currentIndex = modes.indexOf(prev);
      return modes[(currentIndex + 1) % modes.length];
    });
  }, []);

  // Track mouse position for split view
  const handleMaskMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    setSplitX(Math.max(0, Math.min(1, x)));
  }, []);

  // Reset to hover mode when mouse leaves the image area
  const handleMaskMouseLeave = useCallback(() => {
    setMaskMode('hover');
  }, []);

  // Reset mask mode when image changes
  useEffect(() => {
    setMaskMode('hover');
    setSplitX(0.5);
  }, [imageDetailId]);

  // Create blob URLs for images with automatic cleanup
  const imageSrc = useFileUrl(imageFile);
  const maskSrc = useFileUrl(maskFile);

  // Get point counts from pre-computed stats (works with lite mode)
  const { numPoints2D, numPoints3D } = useMemo(() => {
    if (!image || !reconstruction) return { numPoints2D: 0, numPoints3D: 0 };
    // Use numPoints2D field (from WASM/lite mode) or fall back to array length
    const total = image.numPoints2D ?? image.points2D.length;
    // Use pre-computed imageStats for triangulated count
    const stats = imageDetailId !== null ? reconstruction.imageStats.get(imageDetailId) : null;
    const triangulated = stats?.numPoints3D ?? 0;
    return { numPoints2D: total, numPoints3D: triangulated };
  }, [image, reconstruction, imageDetailId]);

  // Get connected images from pre-computed index (O(1) lookup instead of O(m*k))
  // Exclude images marked for deletion
  const connectedImages = useMemo(() => {
    if (!reconstruction || imageDetailId === null) return [];

    const connections = reconstruction.connectedImagesIndex.get(imageDetailId);
    if (!connections) return [];

    return Array.from(connections.entries())
      .filter(([id]) => !pendingDeletions.has(id)) // Exclude deleted images
      .sort((a, b) => b[1] - a[1]) // Sort by match count descending
      .map(([id, count]) => ({
        imageId: id,
        matchCount: count,
        name: reconstruction.images.get(id)?.name || `Image ${id}`
      }));
  }, [reconstruction, imageDetailId, pendingDeletions]);

  // Get match count for currently selected matched image (for consistent display)
  const currentMatchCount = useMemo(() => {
    if (matchedImageId === null) return 0;
    const match = connectedImages.find(img => img.imageId === matchedImageId);
    return match?.matchCount ?? 0;
  }, [connectedImages, matchedImageId]);

  // Get effective 2D points for current image (from JS memory or lazy-loaded from WASM)
  const effectivePoints2D = useMemo((): Point2D[] => {
    if (!image) return [];
    // Prefer points already in JS memory
    if (image.points2D.length > 0) return image.points2D;
    // Fall back to lazy-loaded from WASM
    return lazyPoints2D.get(image.imageId) ?? [];
  }, [image, lazyPoints2D]);

  // Get matched image data (declared before effectiveMatchedPoints2D which uses it)
  const matchedImage = matchedImageId !== null ? reconstruction?.images.get(matchedImageId) : null;

  // Get effective 2D points for matched image (from JS memory or lazy-loaded from WASM)
  const effectiveMatchedPoints2D = useMemo((): Point2D[] => {
    if (!matchedImage) return [];
    // Prefer points already in JS memory
    if (matchedImage.points2D.length > 0) return matchedImage.points2D;
    // Fall back to lazy-loaded from WASM
    return lazyPoints2D.get(matchedImage.imageId) ?? [];
  }, [matchedImage, lazyPoints2D]);

  const handleMatchedImageWheel = useCallback((e: React.WheelEvent) => {
    // Note: Cannot preventDefault on React wheel events (passive by default)
    e.stopPropagation();
    if (connectedImages.length === 0) return;
    const currentIndex = matchedImageId !== null
      ? connectedImages.findIndex(img => img.imageId === matchedImageId)
      : -1;
    if (e.deltaY > 0) {
      const nextIndex = Math.min(currentIndex + 1, connectedImages.length - 1);
      setMatchedImageId(connectedImages[nextIndex].imageId);
    } else {
      const prevIndex = Math.max(currentIndex - 1, 0);
      setMatchedImageId(connectedImages[prevIndex].imageId);
    }
  }, [connectedImages, matchedImageId, setMatchedImageId]);

  // Handle mouse wheel scrolling on image to navigate between images
  // When showMatchesInModal is enabled, scroll through connected images instead
  // Use native event listener with passive: false to allow preventDefault
  // Throttled to prevent rapid image switching and blob URL race conditions
  const lastWheelTime = useRef(0);
  const WHEEL_THROTTLE_MS = 100;

  useEffect(() => {
    const container = imageContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      // Throttle to prevent rapid switching
      const now = Date.now();
      if (now - lastWheelTime.current < WHEEL_THROTTLE_MS) return;
      lastWheelTime.current = now;

      if (showMatchesInModal && connectedImages.length > 0) {
        // Scroll through connected/matched images
        const currentMatchIndex = matchedImageId !== null
          ? connectedImages.findIndex(img => img.imageId === matchedImageId)
          : -1;

        if (e.deltaY > 0) {
          // Scroll down - next matched image
          const nextIndex = currentMatchIndex + 1;
          if (nextIndex < connectedImages.length) {
            setMatchedImageId(connectedImages[nextIndex].imageId);
          }
        } else if (e.deltaY < 0) {
          // Scroll up - previous matched image
          const prevIndex = currentMatchIndex - 1;
          if (prevIndex >= 0) {
            setMatchedImageId(connectedImages[prevIndex].imageId);
          }
        }
      } else {
        // Normal mode - scroll through all images
        if (e.deltaY > 0) {
          goToNext();
        } else if (e.deltaY < 0) {
          goToPrev();
        }
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [goToNext, goToPrev, showMatchesInModal, connectedImages, matchedImageId, setMatchedImageId]);

  // Get matched image related data (matchedImage is declared earlier, before effectiveMatchedPoints2D)
  const matchedCamera = matchedImage ? reconstruction?.cameras.get(matchedImage.cameraId) : null;
  // Get matched image file - use URL cache if in URL mode, ZIP cache if ZIP mode, otherwise local files
  const matchedImageFile = useMemo(() => {
    if (!matchedImage) return null;
    if (imageUrlBase) {
      return getUrlImageCached(matchedImage.name) ?? null;
    }
    if (isZipLoadingAvailable()) {
      return getZipImageCached(matchedImage.name) ?? null;
    }
    return getImageFile(loadedFiles?.imageFiles, matchedImage.name) ?? null;
  }, [matchedImage, imageUrlBase, loadedFiles?.imageFiles, urlImageCacheVersion, zipImageCacheVersion]);
  const matchedImageSrc = useFileUrl(matchedImageFile);

  // Compute match lines between current and matched image
  // Uses effectivePoints2D (from JS memory or lazy-loaded from WASM)
  // Matches points by shared point3DId (avoids needing points3D Map)
  const matchLines = useMemo(() => {
    if (!showMatchesInModal || matchedImageId === null || !reconstruction || !image || !matchedImage)
      return [];

    const lines: {
      point1: [number, number]; // Current image 2D coords
      point2: [number, number]; // Matched image 2D coords
    }[] = [];

    // Build lookup map: point3DId -> Point2D for matched image
    // This allows O(1) matching by shared point3DId without needing points3D.track
    const matchedLookup = new Map<bigint, { xy: [number, number] }>();
    for (const p2d of effectiveMatchedPoints2D) {
      if (p2d.point3DId !== BigInt(-1)) {
        matchedLookup.set(p2d.point3DId, p2d);
      }
    }

    // Use effective points (lazy-loaded if needed)
    // Match by shared point3DId
    for (const point2D of effectivePoints2D) {
      if (point2D.point3DId === BigInt(-1)) continue;

      // Find matching point in the other image by shared point3DId
      const matchedPoint2D = matchedLookup.get(point2D.point3DId);
      if (!matchedPoint2D) continue;

      lines.push({
        point1: point2D.xy,
        point2: matchedPoint2D.xy
      });
    }

    return lines;
  }, [showMatchesInModal, matchedImageId, reconstruction, image, matchedImage, effectivePoints2D, effectiveMatchedPoints2D]);

  // Check if we're in side-by-side match view mode
  const isMatchViewMode = showMatchesInModal && matchedImageId !== null && matchedImage && matchedCamera;
  const MATCH_VIEW_GAP = GAP.matchView;

  // Memoize rendered image dimensions (single image mode)
  const { renderedImageWidth, renderedImageHeight } = useMemo(() => {
    if (!camera || containerSize.width <= 0 || containerSize.height <= 0) {
      return { renderedImageWidth: 0, renderedImageHeight: 0 };
    }

    const originalAspect = camera.width / camera.height;
    const containerAspect = containerSize.width / containerSize.height;

    if (originalAspect > containerAspect) {
      // Image is wider than container - fit to width
      return {
        renderedImageWidth: containerSize.width,
        renderedImageHeight: containerSize.width / originalAspect,
      };
    } else {
      // Image is taller than container - fit to height
      return {
        renderedImageHeight: containerSize.height,
        renderedImageWidth: containerSize.height * originalAspect,
      };
    }
  }, [camera, containerSize.width, containerSize.height]);

  // Memoize rendered dimensions for side-by-side view
  const sideBySideDimensions = useMemo(() => {
    if (!camera || !matchedCamera || containerSize.width <= 0 || containerSize.height <= 0) {
      return { image1Width: 0, image1Height: 0, image2Width: 0, image2Height: 0 };
    }

    const halfWidth = (containerSize.width - MATCH_VIEW_GAP) / 2;
    const height = containerSize.height;
    const containerAspect = halfWidth / height;

    // Calculate dimensions for image 1
    const aspect1 = camera.width / camera.height;
    const image1Width = aspect1 > containerAspect ? halfWidth : height * aspect1;
    const image1Height = aspect1 > containerAspect ? halfWidth / aspect1 : height;

    // Calculate dimensions for image 2
    const aspect2 = matchedCamera.width / matchedCamera.height;
    const image2Width = aspect2 > containerAspect ? halfWidth : height * aspect2;
    const image2Height = aspect2 > containerAspect ? halfWidth / aspect2 : height;

    return { image1Width, image1Height, image2Width, image2Height };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- MATCH_VIEW_GAP is a constant, containerSize is intentionally destructured
  }, [camera, matchedCamera, containerSize.width, containerSize.height]);

  // Memoize rendered dimensions for vertical stacked view (touch mode)
  const verticalStackedDimensions = useMemo(() => {
    if (!camera || !matchedCamera || containerSize.width <= 0 || containerSize.height <= 0) {
      return { image1Width: 0, image1Height: 0, image2Width: 0, image2Height: 0 };
    }

    const halfHeight = (containerSize.height - MATCH_VIEW_GAP) / 2;
    const width = containerSize.width;
    const containerAspect = width / halfHeight;

    // Calculate dimensions for image 1 (top)
    const aspect1 = camera.width / camera.height;
    const image1Width = aspect1 > containerAspect ? width : halfHeight * aspect1;
    const image1Height = aspect1 > containerAspect ? width / aspect1 : halfHeight;

    // Calculate dimensions for image 2 (bottom)
    const aspect2 = matchedCamera.width / matchedCamera.height;
    const image2Width = aspect2 > containerAspect ? width : halfHeight * aspect2;
    const image2Height = aspect2 > containerAspect ? width / aspect2 : halfHeight;

    return { image1Width, image1Height, image2Width, image2Height };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- MATCH_VIEW_GAP is a constant
  }, [camera, matchedCamera, containerSize.width, containerSize.height]);

  // Compute optimal modal size and center when it first opens
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (imageDetailId !== null && !wasOpenRef.current && camera) {
      // Get available viewport space
      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;
      const maxW = Math.round(viewportW * MODAL.maxWidthPercent);
      const maxH = Math.round(viewportH * MODAL.maxHeightPercent);

      // Account for modal chrome (header, footer, padding)
      const chromeHeight = MODAL.headerHeight + MODAL.footerHeight + MODAL.padding;
      const chromeWidth = MODAL.padding;

      // Available space for the image itself
      const availableW = maxW - chromeWidth;
      const availableH = maxH - chromeHeight;

      // Image aspect ratio
      const imageAspect = camera.width / camera.height;

      // Fit image within available space while preserving aspect ratio
      let imageW: number, imageH: number;
      if (imageAspect > availableW / availableH) {
        // Image is wider - fit to width
        imageW = availableW;
        imageH = availableW / imageAspect;
      } else {
        // Image is taller - fit to height
        imageH = availableH;
        imageW = availableH * imageAspect;
      }

      // Final modal size = image size + chrome
      const modalW = Math.max(MIN_WIDTH, Math.round(imageW + chromeWidth));
      const modalH = Math.max(MIN_HEIGHT, Math.round(imageH + chromeHeight));

      setSize({ width: modalW, height: modalH });

      // Center the modal
      const centerX = (viewportW - modalW) / 2;
      const centerY = (viewportH - modalH) / 2;
      setPosition({ x: centerX, y: centerY });
    }
    wasOpenRef.current = imageDetailId !== null;
  }, [imageDetailId, camera]);

  // Handle keyboard shortcuts using centralized hotkey system
  useHotkeys(
    HOTKEYS.closeModal.keys,
    closeImageDetail,
    { scopes: HOTKEYS.closeModal.scopes, enabled: imageDetailId !== null },
    [closeImageDetail]
  );

  useHotkeys(
    HOTKEYS.prevImage.keys,
    goToPrev,
    { scopes: HOTKEYS.prevImage.scopes, enabled: imageDetailId !== null && hasPrev },
    [hasPrev, goToPrev]
  );

  useHotkeys(
    HOTKEYS.nextImage.keys,
    goToNext,
    { scopes: HOTKEYS.nextImage.scopes, enabled: imageDetailId !== null && hasNext },
    [hasNext, goToNext]
  );

  // Drag handlers
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      posX: position.x,
      posY: position.y,
    };
  }, [position]);

  // Resize handlers
  const handleResizeStart = useCallback((e: React.MouseEvent, direction: string) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(direction);
    resizeStart.current = {
      x: e.clientX,
      y: e.clientY,
      width: size.width,
      height: size.height,
      posX: position.x,
      posY: position.y,
    };
  }, [size, position]);

  // Mouse move and up handlers
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const dx = e.clientX - dragStart.current.x;
        const dy = e.clientY - dragStart.current.y;
        setPosition({
          x: dragStart.current.posX + dx,
          y: dragStart.current.posY + dy,
        });
      } else if (isResizing) {
        const dx = e.clientX - resizeStart.current.x;
        const dy = e.clientY - resizeStart.current.y;

        let newWidth = resizeStart.current.width;
        let newHeight = resizeStart.current.height;
        let newX = resizeStart.current.posX;
        let newY = resizeStart.current.posY;

        if (isResizing.includes('e')) {
          newWidth = Math.max(MIN_WIDTH, resizeStart.current.width + dx);
        }
        if (isResizing.includes('w')) {
          const proposedWidth = resizeStart.current.width - dx;
          if (proposedWidth >= MIN_WIDTH) {
            newWidth = proposedWidth;
            newX = resizeStart.current.posX + dx;
          }
        }
        if (isResizing.includes('s')) {
          newHeight = Math.max(MIN_HEIGHT, resizeStart.current.height + dy);
        }
        if (isResizing.includes('n')) {
          const proposedHeight = resizeStart.current.height - dy;
          if (proposedHeight >= MIN_HEIGHT) {
            newHeight = proposedHeight;
            newY = resizeStart.current.posY + dy;
          }
        }

        setSize({ width: newWidth, height: newHeight });
        setPosition({ x: newX, y: newY });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(null);
    };

    if (isDragging || isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, isResizing]);

  // Keep modal within viewport bounds when browser window is resized
  useEffect(() => {
    if (imageDetailId === null) return;

    const handleWindowResize = () => {
      setPosition(prev => ({
        x: Math.max(0, Math.min(prev.x, window.innerWidth - size.width)),
        y: Math.max(0, Math.min(prev.y, window.innerHeight - size.height)),
      }));
    };

    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, [imageDetailId, size.width, size.height]);

  const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const updateContainerSize = useCallback(() => {
    if (imageContainerRef.current) {
      setContainerSize({
        width: imageContainerRef.current.clientWidth,
        height: imageContainerRef.current.clientHeight,
      });
    }
  }, []);

  useEffect(() => {
    if (!imageContainerRef.current) return;

    updateContainerSize();

    const observer = new ResizeObserver(() => {
      if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current);
      resizeTimeoutRef.current = setTimeout(updateContainerSize, RESIZE_DEBOUNCE_MS);
    });

    observer.observe(imageContainerRef.current);
    return () => {
      observer.disconnect();
      if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current);
    };
  }, [updateContainerSize, imageDetailId]);

  if (imageDetailId === null || !image || !camera) return null;

  // Touch mode: full-screen modal with vertical match layout
  if (touchMode) {
    return (
      <div className="fixed inset-0 z-[1000] bg-ds-primary flex flex-col">
        {/* Header */}
        <div className="flex flex-col bg-ds-secondary border-b border-ds flex-shrink-0">
          <div className="flex items-center justify-between px-3 h-11">
            <span className={`text-ds-primary text-sm truncate flex-1 mr-2 ${isMarkedForDeletion ? 'line-through text-ds-error' : ''}`}>
              {isMatchViewMode
                ? `${image?.name} ↔ ${matchedImage?.name}`
                : image?.name}
            </span>
            <button
              onClick={closeImageDetail}
              className="w-10 h-10 flex items-center justify-center text-ds-muted hover:text-ds-primary text-2xl"
              style={{ minWidth: TOUCH.minTapTarget, minHeight: TOUCH.minTapTarget }}
            >
              ×
            </button>
          </div>
          {/* Camera parameters */}
          <div className="px-3 pb-1.5 overflow-x-auto">
            <CameraPoseInfoDisplay camera={camera} qvec={image.qvec} tvec={image.tvec} />
          </div>
        </div>

        {/* Image container */}
        <div ref={imageContainerRef} className="flex-1 min-h-0 bg-ds-secondary relative overflow-hidden">
          {isMatchViewMode ? (
            (() => {
              // Vertical layout: images stacked top-bottom
              const dims = verticalStackedDimensions;
              const halfHeight = (containerSize.height - MATCH_VIEW_GAP) / 2;
              const offset1X = (containerSize.width - dims.image1Width) / 2;
              const offset1Y = (halfHeight - dims.image1Height) / 2;
              const offset2X = (containerSize.width - dims.image2Width) / 2;
              const offset2Y = halfHeight + MATCH_VIEW_GAP + (halfHeight - dims.image2Height) / 2;

              return (
                <>
                  {/* Image 1 - top */}
                  {dims.image1Width > 0 && (imageSrc ? (
                    <img
                      src={imageSrc}
                      alt={image.name}
                      className="absolute object-contain"
                      style={{
                        width: dims.image1Width,
                        height: dims.image1Height,
                        left: offset1X,
                        top: offset1Y,
                      }}
                      draggable={false}
                    />
                  ) : (
                    <ImagePlaceholder
                      width={dims.image1Width}
                      height={dims.image1Height}
                      cameraWidth={camera.width}
                      cameraHeight={camera.height}
                      label={image.name}
                      style={{ position: 'absolute', left: offset1X, top: offset1Y }}
                    />
                  ))}
                  {/* Image 2 - bottom */}
                  {dims.image2Width > 0 && matchedCamera && (matchedImageSrc ? (
                    <img
                      src={matchedImageSrc}
                      alt={matchedImage?.name || ''}
                      className="absolute object-contain"
                      style={{
                        width: dims.image2Width,
                        height: dims.image2Height,
                        left: offset2X,
                        top: offset2Y,
                      }}
                      draggable={false}
                    />
                  ) : (
                    <ImagePlaceholder
                      width={dims.image2Width}
                      height={dims.image2Height}
                      cameraWidth={matchedCamera.width}
                      cameraHeight={matchedCamera.height}
                      label={matchedImage?.name}
                      style={{ position: 'absolute', left: offset2X, top: offset2Y }}
                    />
                  ))}
                  {/* Vertical match lines */}
                  {matchLines.length > 0 && dims.image1Width > 0 && dims.image2Width > 0 && (
                    <VerticalMatchCanvas
                      lines={matchLines}
                      image1Camera={camera}
                      image2Camera={matchedCamera}
                      image1Width={dims.image1Width}
                      image1Height={dims.image1Height}
                      image2Width={dims.image2Width}
                      image2Height={dims.image2Height}
                      containerWidth={containerSize.width}
                      containerHeight={containerSize.height}
                      gap={MATCH_VIEW_GAP}
                      lineOpacity={matchLineOpacity}
                    />
                  )}
                </>
              );
            })()
          ) : (
            (() => {
              const offsetX = (containerSize.width - renderedImageWidth) / 2;
              const offsetY = (containerSize.height - renderedImageHeight) / 2;

              return (
                <>
                  {renderedImageWidth > 0 && (imageSrc ? (
                    <>
                      <img
                        src={imageSrc}
                        alt={image.name}
                        className="absolute object-contain"
                        style={{
                          width: renderedImageWidth,
                          height: renderedImageHeight,
                          left: offsetX,
                          top: offsetY,
                          filter: isMarkedForDeletion ? 'grayscale(100%)' : undefined,
                        }}
                        draggable={false}
                      />
                      {isMarkedForDeletion && (
                        <DeletedCrossOverlay
                          width={renderedImageWidth}
                          height={renderedImageHeight}
                          style={{ position: 'absolute', left: offsetX, top: offsetY }}
                        />
                      )}
                    </>
                  ) : (
                    <ImagePlaceholder
                      width={renderedImageWidth}
                      height={renderedImageHeight}
                      cameraWidth={camera.width}
                      cameraHeight={camera.height}
                      label="No image loaded"
                      style={{ position: 'absolute', left: offsetX, top: offsetY }}
                    />
                  ))}
                  {!isMarkedForDeletion && (showPoints2D || showPoints3D) && renderedImageWidth > 0 && effectivePoints2D.length > 0 && (
                    <KeypointCanvas
                      points2D={effectivePoints2D}
                      camera={camera}
                      imageWidth={renderedImageWidth}
                      imageHeight={renderedImageHeight}
                      containerWidth={containerSize.width}
                      containerHeight={containerSize.height}
                      showPoints2D={showPoints2D}
                      showPoints3D={showPoints3D}
                    />
                  )}
                </>
              );
            })()
          )}
        </div>

        {/* Touch controls - bottom section */}
        {showModalControls && (
          <div className="flex-shrink-0 bg-ds-tertiary border-t border-ds">
            {/* Toggle buttons row */}
            <div className="flex gap-2 px-3 py-2 overflow-x-auto">
              {!showMatchesInModal && (
                <>
                  <button
                    onClick={() => !isMarkedForDeletion && setShowPoints2D(!showPoints2D)}
                    disabled={isMarkedForDeletion}
                    className={`${touchStyles.touchButton} flex-1 text-sm ${
                      isMarkedForDeletion
                        ? 'bg-ds-secondary text-ds-muted opacity-50'
                        : showPoints2D ? 'bg-ds-accent text-ds-void' : 'bg-ds-hover text-ds-primary'
                    }`}
                    style={{ minHeight: TOUCH.minTapTarget }}
                  >
                    2D <span className={isMarkedForDeletion ? '' : showPoints2D ? '' : 'text-ds-success'}>({numPoints2D})</span>
                  </button>
                  <button
                    onClick={() => !isMarkedForDeletion && setShowPoints3D(!showPoints3D)}
                    disabled={isMarkedForDeletion}
                    className={`${touchStyles.touchButton} flex-1 text-sm ${
                      isMarkedForDeletion
                        ? 'bg-ds-secondary text-ds-muted opacity-50'
                        : showPoints3D ? 'bg-ds-accent text-ds-void' : 'bg-ds-hover text-ds-primary'
                    }`}
                    style={{ minHeight: TOUCH.minTapTarget }}
                  >
                    3D <span className={isMarkedForDeletion ? '' : showPoints3D ? '' : 'text-ds-error'}>({numPoints3D})</span>
                  </button>
                </>
              )}
              <button
                onClick={() => !isMarkedForDeletion && setShowMatchesInModal(!showMatchesInModal)}
                disabled={isMarkedForDeletion}
                className={`${touchStyles.touchButton} flex-1 text-sm ${
                  isMarkedForDeletion
                    ? 'bg-ds-secondary text-ds-muted opacity-50'
                    : showMatchesInModal ? 'bg-ds-accent text-ds-void' : 'bg-ds-hover text-ds-primary'
                }`}
                style={{ minHeight: TOUCH.minTapTarget }}
              >
                Matches
              </button>
            </div>

            {/* Match controls (if showing matches) */}
            {showMatchesInModal && !isMarkedForDeletion && (
              <div className="px-3 pb-2">
                <select
                  value={matchedImageId ?? ''}
                  onChange={(e) => setMatchedImageId(e.target.value ? parseInt(e.target.value) : null)}
                  className={`${inputStyles.select} w-full py-2 text-sm`}
                  style={{ minHeight: TOUCH.minTapTarget }}
                >
                  <option value="">Select connected image...</option>
                  {connectedImages.map(({ imageId, matchCount, name }) => (
                    <option key={imageId} value={imageId}>
                      {name} ({matchCount})
                    </option>
                  ))}
                </select>
                {matchedImageId !== null && (
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-ds-secondary text-sm">Opacity</span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={matchLineOpacity}
                      onChange={(e) => setMatchLineOpacity(parseFloat(e.target.value))}
                      className="flex-1 accent-ds-success h-8"
                    />
                    <span className="text-ds-primary text-sm w-10 text-right">
                      {Math.round(matchLineOpacity * 100)}%
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Navigation row */}
            <div className="flex items-center gap-2 px-3 py-2 border-t border-ds">
              <button
                onClick={goToPrev}
                disabled={!hasPrev}
                className={`${touchStyles.touchButton} flex-1 text-sm ${
                  hasPrev ? 'bg-ds-hover text-ds-primary' : 'bg-ds-secondary text-ds-muted'
                }`}
                style={{ minHeight: TOUCH.minTapTarget }}
              >
                ← Prev
              </button>
              <span className="text-ds-primary text-sm px-2">
                {currentIndex + 1} / {imageIds.length}
              </span>
              <button
                onClick={goToNext}
                disabled={!hasNext}
                className={`${touchStyles.touchButton} flex-1 text-sm ${
                  hasNext ? 'bg-ds-hover text-ds-primary' : 'bg-ds-secondary text-ds-muted'
                }`}
                style={{ minHeight: TOUCH.minTapTarget }}
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Desktop mode: draggable/resizable modal
  return (
    <div className="fixed inset-0 z-[1000] pointer-events-none">
      <div
        className={modalStyles.backdrop}
        onClick={closeImageDetail}
        onContextMenu={(e) => { e.preventDefault(); closeImageDetail(); }}
      />

      <div
        className={modalStyles.panel}
        style={{
          left: position.x,
          top: position.y,
          width: size.width,
          height: size.height,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <ModalErrorBoundary onClose={closeImageDetail}>
          <div
            className="flex items-center justify-between px-4 py-2 rounded-t-lg bg-ds-secondary text-xs cursor-move select-none"
            onMouseDown={handleDragStart}
          >
            <span className={`text-ds-primary ${isMarkedForDeletion ? 'line-through text-ds-error' : ''}`}>
              {isMatchViewMode
                ? `Image Matches: ${image?.name} ↔ ${matchedImage?.name} (${currentMatchCount} matches)`
                : `Image #${imageDetailId}: ${image?.name}`}
            </span>
            <div className="flex items-center gap-1">
              {/* Delete/Restore image button */}
              <button
                onClick={handleDeleteToggle}
                onMouseDown={(e) => e.stopPropagation()}
                className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${
                  isMarkedForDeletion
                    ? 'text-ds-success hover:bg-ds-success/20'
                    : 'text-ds-muted hover:text-ds-error hover:bg-ds-error/20'
                }`}
                title={isMarkedForDeletion ? 'Restore image' : 'Delete image'}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18" />
                  <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" />
                  <path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                  <text x="12" y="18" textAnchor="middle" fontSize="11" fill="currentColor" stroke="none" fontWeight="bold">I</text>
                </svg>
              </button>
              {/* Toggle camera deletion (only when >1 cameras) */}
              {multiCamera && (
                <button
                  onClick={handleToggleCamera}
                  onMouseDown={(e) => e.stopPropagation()}
                  className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${
                    cameraAllMarked
                      ? 'text-ds-success hover:bg-ds-success/20'
                      : 'text-ds-muted hover:text-ds-error hover:bg-ds-error/20'
                  }`}
                  title={cameraAllMarked ? `Restore camera ${image?.cameraId}` : `Delete camera ${image?.cameraId}`}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h18" />
                    <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" />
                    <path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                    <text x="12" y="18" textAnchor="middle" fontSize="11" fill="currentColor" stroke="none" fontWeight="bold">C</text>
                  </svg>
                </button>
              )}
              {/* Toggle frame deletion (only when rig data exists) */}
              {frameImageIds.length > 0 && (
                <button
                  onClick={handleToggleFrame}
                  onMouseDown={(e) => e.stopPropagation()}
                  className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${
                    frameAllMarked
                      ? 'text-ds-success hover:bg-ds-success/20'
                      : 'text-ds-muted hover:text-ds-error hover:bg-ds-error/20'
                  }`}
                  title={frameAllMarked ? 'Restore frame' : 'Delete frame'}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h18" />
                    <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" />
                    <path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                    <text x="12" y="18" textAnchor="middle" fontSize="11" fill="currentColor" stroke="none" fontWeight="bold">F</text>
                  </svg>
                </button>
              )}
              <button
                onClick={closeImageDetail}
                onMouseDown={(e) => e.stopPropagation()}
                className="w-6 h-6 flex items-center justify-center rounded text-ds-muted hover:text-ds-primary hover:bg-ds-tertiary transition-colors"
                title="Close"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <div className="flex flex-col flex-1 overflow-hidden px-4 pt-1 pb-3 gap-2">
          <div className="flex-shrink-0 overflow-x-auto py-1">
            <CameraPoseInfoDisplay camera={camera} qvec={image.qvec} tvec={image.tvec} />
          </div>

          <div className="flex-1 min-h-0 flex flex-col">
            <div ref={imageContainerRef} className="group/scroll relative flex-1 min-h-0 bg-ds-secondary rounded overflow-hidden">
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 px-2 py-1 bg-ds-void/70 text-ds-secondary text-xs rounded opacity-0 group-hover/scroll:opacity-100 transition-opacity pointer-events-none whitespace-nowrap flex gap-3">
                <span>
                  Scroll: iterate through {showMatchesInModal && connectedImages.length > 0 ? 'matched images' : 'images'}
                </span>
                {hasMask && maskSrc && !showMatchesInModal && (
                  <span>
                    Click: <span className="text-ds-primary">{maskMode}</span> → {maskMode === 'hover' ? 'mask' : maskMode === 'mask' ? 'split' : maskMode === 'split' ? 'image' : 'hover'}
                  </span>
                )}
              </div>
              {isMatchViewMode ? (
                (() => {
                  // Calculate positions exactly as MatchCanvas does to ensure alignment
                  const halfWidth = (containerSize.width - MATCH_VIEW_GAP) / 2;
                  const offset1X = (halfWidth - sideBySideDimensions.image1Width) / 2;
                  const offset1Y = (containerSize.height - sideBySideDimensions.image1Height) / 2;
                  const offset2X = halfWidth + MATCH_VIEW_GAP + (halfWidth - sideBySideDimensions.image2Width) / 2;
                  const offset2Y = (containerSize.height - sideBySideDimensions.image2Height) / 2;

                  return (
                    <>
                      {/* Image 1 - absolutely positioned to match MatchCanvas calculations */}
                      {sideBySideDimensions.image1Width > 0 && (imageSrc ? (
                        <img
                          src={imageSrc}
                          alt={image.name}
                          className="absolute object-contain"
                          style={{
                            width: sideBySideDimensions.image1Width,
                            height: sideBySideDimensions.image1Height,
                            left: offset1X,
                            top: offset1Y,
                          }}
                          draggable={false}
                        />
                      ) : (
                        <ImagePlaceholder
                          width={sideBySideDimensions.image1Width}
                          height={sideBySideDimensions.image1Height}
                          cameraWidth={camera.width}
                          cameraHeight={camera.height}
                          label={image.name}
                          style={{
                            position: 'absolute',
                            left: offset1X,
                            top: offset1Y,
                          }}
                        />
                      ))}
                      {/* Image 2 - absolutely positioned to match MatchCanvas calculations */}
                      {sideBySideDimensions.image2Width > 0 && matchedCamera && (matchedImageSrc ? (
                        <img
                          src={matchedImageSrc}
                          alt={matchedImage?.name || ''}
                          className="absolute object-contain"
                          style={{
                            width: sideBySideDimensions.image2Width,
                            height: sideBySideDimensions.image2Height,
                            left: offset2X,
                            top: offset2Y,
                          }}
                          draggable={false}
                        />
                      ) : (
                        <ImagePlaceholder
                          width={sideBySideDimensions.image2Width}
                          height={sideBySideDimensions.image2Height}
                          cameraWidth={matchedCamera.width}
                          cameraHeight={matchedCamera.height}
                          label={matchedImage?.name}
                          style={{
                            position: 'absolute',
                            left: offset2X,
                            top: offset2Y,
                          }}
                        />
                      ))}
                      {/* Match lines - rendered even without images loaded */}
                      {matchLines.length > 0 && sideBySideDimensions.image1Width > 0 && sideBySideDimensions.image2Width > 0 && (
                        <MatchCanvas
                          lines={matchLines}
                          image1Camera={camera}
                          image2Camera={matchedCamera}
                          image1Width={sideBySideDimensions.image1Width}
                          image1Height={sideBySideDimensions.image1Height}
                          image2Width={sideBySideDimensions.image2Width}
                          image2Height={sideBySideDimensions.image2Height}
                          containerWidth={containerSize.width}
                          containerHeight={containerSize.height}
                          gap={MATCH_VIEW_GAP}
                          lineOpacity={matchLineOpacity}
                        />
                      )}
                    </>
                  );
                })()
              ) : (
                (() => {
                  // Calculate position exactly as KeypointCanvas does to ensure alignment
                  const offsetX = (containerSize.width - renderedImageWidth) / 2;
                  const offsetY = (containerSize.height - renderedImageHeight) / 2;

                  return (
                    <div
                      className="group absolute inset-0"
                      onClick={hasMask && maskSrc && !isMarkedForDeletion ? cycleMaskMode : undefined}
                      onMouseMove={hasMask && maskSrc && !isMarkedForDeletion ? handleMaskMouseMove : undefined}
                      onMouseLeave={hasMask && maskSrc && !isMarkedForDeletion ? handleMaskMouseLeave : undefined}
                      style={{ cursor: hasMask && maskSrc && !isMarkedForDeletion ? 'pointer' : undefined }}
                    >
                      {/* Image with optional grayscale for deleted, or placeholder */}
                      {renderedImageWidth > 0 && (imageSrc ? (
                        <>
                          <img
                            src={imageSrc}
                            alt={image.name}
                            className="absolute object-contain pointer-events-none"
                            style={{
                              width: renderedImageWidth,
                              height: renderedImageHeight,
                              left: offsetX,
                              top: offsetY,
                              // Hide image in mask-only mode
                              opacity: maskMode === 'mask' ? 0 : 1,
                              // Clip image in split mode (show left portion)
                              clipPath: maskMode === 'split' ? `inset(0 ${(1 - splitX) * 100}% 0 0)` : undefined,
                              // Grayscale for deleted images
                              filter: isMarkedForDeletion ? 'grayscale(100%)' : undefined,
                            }}
                            draggable={false}
                          />
                          {/* Cross overlay for deleted images */}
                          {isMarkedForDeletion && (
                            <DeletedCrossOverlay
                              width={renderedImageWidth}
                              height={renderedImageHeight}
                              style={{
                                position: 'absolute',
                                left: offsetX,
                                top: offsetY,
                              }}
                            />
                          )}
                          {hasMask && maskSrc && !isMarkedForDeletion && (
                            <img
                              src={maskSrc}
                              alt="mask"
                              className={`absolute object-contain pointer-events-none ${
                                maskMode === 'hover' ? 'opacity-0 group-hover:opacity-50' : ''
                              }`}
                              style={{
                                width: renderedImageWidth,
                                height: renderedImageHeight,
                                left: offsetX,
                                top: offsetY,
                                // Opacity based on mode (not applied in hover mode - uses CSS)
                                ...(maskMode !== 'hover' && {
                                  opacity: maskMode === 'image' ? 0 : 1,
                                }),
                                // Clip mask in split mode (show right portion)
                                clipPath: maskMode === 'split' ? `inset(0 0 0 ${splitX * 100}%)` : undefined,
                              }}
                              draggable={false}
                            />
                          )}
                        </>
                      ) : (
                        <ImagePlaceholder
                          width={renderedImageWidth}
                          height={renderedImageHeight}
                          cameraWidth={camera.width}
                          cameraHeight={camera.height}
                          label="No image loaded"
                          style={{
                            position: 'absolute',
                            left: offsetX,
                            top: offsetY,
                          }}
                        />
                      ))}
                      {/* Keypoint overlay - not shown for deleted images */}
                      {!isMarkedForDeletion && (showPoints2D || showPoints3D) && renderedImageWidth > 0 && effectivePoints2D.length > 0 && (
                        <KeypointCanvas
                          points2D={effectivePoints2D}
                          camera={camera}
                          imageWidth={renderedImageWidth}
                          imageHeight={renderedImageHeight}
                          containerWidth={containerSize.width}
                          containerHeight={containerSize.height}
                          showPoints2D={showPoints2D}
                          showPoints3D={showPoints3D}
                        />
                      )}
                    </div>
                  );
                })()
              )}
            </div>

            <div className="mt-2 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 flex-wrap">
                {!showMatchesInModal && (
                  <>
                    <button
                      onClick={() => !isMarkedForDeletion && setShowPoints2D(!showPoints2D)}
                      disabled={isMarkedForDeletion}
                      className={`${buttonStyles.base} ${buttonStyles.sizes.toggleResponsive} ${
                        isMarkedForDeletion
                          ? buttonStyles.disabled + ' bg-ds-secondary text-ds-muted'
                          : showPoints2D ? buttonStyles.variants.toggleActive : buttonStyles.variants.toggle
                      }`}
                    >
                      Points2D <span className={isMarkedForDeletion ? '' : showPoints2D ? '' : 'text-ds-success'}>({numPoints2D})</span>
                    </button>
                    <button
                      onClick={() => !isMarkedForDeletion && setShowPoints3D(!showPoints3D)}
                      disabled={isMarkedForDeletion}
                      className={`${buttonStyles.base} ${buttonStyles.sizes.toggleResponsive} ${
                        isMarkedForDeletion
                          ? buttonStyles.disabled + ' bg-ds-secondary text-ds-muted'
                          : showPoints3D ? buttonStyles.variants.toggleActive : buttonStyles.variants.toggle
                      }`}
                    >
                      Points3D <span className={isMarkedForDeletion ? '' : showPoints3D ? '' : 'text-ds-error'}>({numPoints3D})</span>
                    </button>
                  </>
                )}

                <button
                  onClick={() => !isMarkedForDeletion && setShowMatchesInModal(!showMatchesInModal)}
                  disabled={isMarkedForDeletion}
                  className={`${buttonStyles.base} ${buttonStyles.sizes.toggleResponsive} ${
                    isMarkedForDeletion
                      ? buttonStyles.disabled + ' bg-ds-secondary text-ds-muted'
                      : showMatchesInModal ? buttonStyles.variants.toggleActive : buttonStyles.variants.toggle
                  }`}
                >
                  Show Matches
                </button>

                {showMatchesInModal && !isMarkedForDeletion && (
                  <>
                    <select
                      value={matchedImageId ?? ''}
                      onChange={(e) => setMatchedImageId(e.target.value ? parseInt(e.target.value) : null)}
                      onWheel={handleMatchedImageWheel}
                      className={`${inputStyles.select} py-1 pl-2 pr-1 text-xs`}
                    >
                      <option value="">Select connected image...</option>
                      {connectedImages.map(({ imageId, matchCount, name }) => (
                        <option key={imageId} value={imageId}>
                          {name} ({matchCount} matches)
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center gap-2" onWheel={handleOpacityWheel}>
                      <label className="text-ds-secondary whitespace-nowrap text-xs pl-1">Opacity</label>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={matchLineOpacity}
                        onChange={(e) => setMatchLineOpacity(parseFloat(e.target.value))}
                        className="w-14 accent-ds-success"
                      />
                      {isEditingOpacity ? (
                        <input
                          ref={opacityInputRef}
                          type="text"
                          value={opacityInputValue}
                          onChange={(e) => setOpacityInputValue(e.target.value)}
                          onBlur={applyOpacityValue}
                          onKeyDown={handleOpacityKeyDown}
                          className="bg-transparent text-ds-primary text-xs w-8 text-right flex-shrink-0 border-none p-0 m-0 focus-outline-none"
                        />
                      ) : (
                        <span
                          className="text-ds-primary text-xs w-8 text-right flex-shrink-0 cursor-pointer hover-bg-ds-accent"
                          onDoubleClick={handleOpacityDoubleClick}
                          title="Double-click to edit"
                        >
                          {Math.round(matchLineOpacity * 100)}%
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={goToPrev}
                  disabled={!hasPrev}
                  className={`${buttonStyles.base} ${buttonStyles.sizes.toggleResponsive} ${
                    hasPrev ? buttonStyles.variants.toggle : buttonStyles.disabled + ' bg-ds-secondary text-ds-muted'
                  }`}
                >
                  ← Prev
                </button>
                <div className="flex items-center text-xs">
                  <input
                    type="text"
                    defaultValue={imageDetailId ?? ''}
                    key={imageDetailId}
                    className={`${inputStyles.base} py-1 w-14 rounded-l rounded-r-none text-center text-xs`}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === 'Enter') {
                        const id = parseInt((e.target as HTMLInputElement).value);
                        if (!isNaN(id) && reconstruction?.images.has(id)) {
                          openImageDetail(id);
                        }
                        (e.target as HTMLInputElement).blur();
                      } else if (e.key === 'Escape') {
                        (e.target as HTMLInputElement).value = String(imageDetailId ?? '');
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    onBlur={(e) => {
                      e.target.value = String(imageDetailId ?? '');
                    }}
                  />
                  <span className="w-14 px-2 py-1 text-center bg-ds-secondary text-ds-muted border-y border-r border-ds rounded-r">
                    {imageIds.length}
                  </span>
                </div>
                <button
                  onClick={goToNext}
                  disabled={!hasNext}
                  className={`${buttonStyles.base} ${buttonStyles.sizes.toggleResponsive} ${
                    hasNext ? buttonStyles.variants.toggle : buttonStyles.disabled + ' bg-ds-secondary text-ds-muted'
                  }`}
                >
                  Next →
                </button>
              </div>
            </div>
          </div>
        </div>
        </ModalErrorBoundary>

        <div className={`${resizeHandleStyles.corner} ${resizeHandleStyles.nw}`} onMouseDown={(e) => handleResizeStart(e, 'nw')} />
        <div className={`${resizeHandleStyles.corner} ${resizeHandleStyles.ne}`} onMouseDown={(e) => handleResizeStart(e, 'ne')} />
        <div className={`${resizeHandleStyles.corner} ${resizeHandleStyles.sw}`} onMouseDown={(e) => handleResizeStart(e, 'sw')} />
        <div className={`${resizeHandleStyles.corner} ${resizeHandleStyles.se}`} onMouseDown={(e) => handleResizeStart(e, 'se')} />
        <div className={`${resizeHandleStyles.edge} ${resizeHandleStyles.n}`} onMouseDown={(e) => handleResizeStart(e, 'n')} />
        <div className={`${resizeHandleStyles.edge} ${resizeHandleStyles.s}`} onMouseDown={(e) => handleResizeStart(e, 's')} />
        <div className={`${resizeHandleStyles.edge} ${resizeHandleStyles.w}`} onMouseDown={(e) => handleResizeStart(e, 'w')} />
        <div className={`${resizeHandleStyles.edge} ${resizeHandleStyles.e}`} onMouseDown={(e) => handleResizeStart(e, 'e')} />
      </div>
    </div>
  );
}

