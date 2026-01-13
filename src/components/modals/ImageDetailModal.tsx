import { useEffect, useRef, useState, useCallback, useMemo, memo } from 'react';
import { useReconstructionStore, useViewerStore } from '../../store';
import type { Camera, Image } from '../../types/colmap';
import { getImageFile, getMaskFile } from '../../utils/imageFileUtils';

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

function formatCameraInfo(camera: Camera): string {
  const modelName = CAMERA_MODEL_NAMES[camera.modelId] || `MODEL_${camera.modelId}`;
  const paramsStr = camera.params.map(p => p.toFixed(2)).join(', ');
  const paramNames = CAMERA_PARAM_NAMES[camera.modelId] || '';
  return `Camera(camera_id=${camera.cameraId}, model=${modelName}, width=${camera.width}, height=${camera.height}, params=[${paramsStr}] (${paramNames}))`;
}

function formatRigid3d(qvec: number[], tvec: number[]): string {
  const rotStr = [qvec[1], qvec[2], qvec[3], qvec[0]].map(v => v.toFixed(6)).join(', ');
  const transStr = tvec.map(v => v.toFixed(5)).join(', ');
  return `Rigid3d(rotation_xyzw=[${rotStr}], translation=[${transStr}])`;
}

interface KeypointCanvasProps {
  image: Image;
  camera: Camera;
  imageWidth: number;
  imageHeight: number;
  containerWidth: number;
  containerHeight: number;
  showPoints2D: boolean;
  showPoints3D: boolean;
}

const KeypointCanvas = memo(function KeypointCanvas({
  image,
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

    for (const point of image.points2D) {
      const isTriangulated = point.point3DId !== BigInt(-1);

      if (isTriangulated && !showPoints3D) continue;
      if (!isTriangulated && !showPoints2D) continue;

      const x = point.xy[0] * scaleX;
      const y = point.xy[1] * scaleY;

      if (isTriangulated) {
        triangulatedPoints.push({ x, y });
      } else {
        untriangulatedPoints.push({ x, y });
      }
    }

    if (untriangulatedPoints.length > 0) {
      ctx.fillStyle = '#ff0000';
      ctx.beginPath();
      for (const { x, y } of untriangulatedPoints) {
        ctx.moveTo(x + 2, y);
        ctx.arc(x, y, 2, 0, Math.PI * 2);
      }
      ctx.fill();
    }

    if (triangulatedPoints.length > 0) {
      ctx.fillStyle = '#00ff00';
      ctx.beginPath();
      for (const { x, y } of triangulatedPoints) {
        ctx.moveTo(x + 2, y);
        ctx.arc(x, y, 2, 0, Math.PI * 2);
      }
      ctx.fill();
    }
  }, [image, camera, imageWidth, imageHeight, showPoints2D, showPoints3D]);

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
  gap
}: MatchCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

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

    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.7;

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
    ctx.fillStyle = '#00ff00';
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
  }, [lines, image1Camera, image2Camera, image1Width, image1Height, image2Width, image2Height, containerWidth, containerHeight, gap]);

  return (
    <canvas
      ref={canvasRef}
      width={containerWidth}
      height={containerHeight}
      className="absolute inset-0 pointer-events-none"
    />
  );
});

const MIN_WIDTH = 400;
const MIN_HEIGHT = 300;
const RESIZE_DEBOUNCE_MS = 16;

export function ImageDetailModal() {
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const loadedFiles = useReconstructionStore((s) => s.loadedFiles);
  const imageDetailId = useViewerStore((s) => s.imageDetailId);
  const closeImageDetail = useViewerStore((s) => s.closeImageDetail);
  const openImageDetail = useViewerStore((s) => s.openImageDetail);
  const showPoints2D = useViewerStore((s) => s.showPoints2D);
  const showPoints3D = useViewerStore((s) => s.showPoints3D);
  const setShowPoints2D = useViewerStore((s) => s.setShowPoints2D);
  const setShowPoints3D = useViewerStore((s) => s.setShowPoints3D);
  const showMatchesInModal = useViewerStore((s) => s.showMatchesInModal);
  const setShowMatchesInModal = useViewerStore((s) => s.setShowMatchesInModal);
  const matchedImageId = useViewerStore((s) => s.matchedImageId);
  const setMatchedImageId = useViewerStore((s) => s.setMatchedImageId);
  const showMaskOverlay = useViewerStore((s) => s.showMaskOverlay);
  const setShowMaskOverlay = useViewerStore((s) => s.setShowMaskOverlay);
  const maskOpacity = useViewerStore((s) => s.maskOpacity);
  const setMaskOpacity = useViewerStore((s) => s.setMaskOpacity);

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

  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [matchedImageSrc, setMatchedImageSrc] = useState<string | null>(null);
  const [maskSrc, setMaskSrc] = useState<string | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const imageContainerRef = useRef<HTMLDivElement>(null);

  // Position and size state for draggable/resizable
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState(() => ({
    width: Math.round(window.innerWidth * 0.8),
    height: Math.round(window.innerHeight * 0.85),
  }));
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState<string | null>(null);
  const dragStart = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const resizeStart = useRef({ x: 0, y: 0, width: 0, height: 0, posX: 0, posY: 0 });

  const image = imageDetailId !== null ? reconstruction?.images.get(imageDetailId) : null;
  const camera = image ? reconstruction?.cameras.get(image.cameraId) : null;
  const imageFile = image ? getImageFile(loadedFiles?.imageFiles, image.name) : null;
  const maskFile = image ? getMaskFile(loadedFiles?.imageFiles, image.name) : null;
  const hasMask = !!maskFile;

  // Memoize point counts
  const { numPoints2D, numPoints3D } = useMemo(() => {
    if (!image) return { numPoints2D: 0, numPoints3D: 0 };
    const total = image.points2D.length;
    let triangulated = 0;
    for (const point of image.points2D) {
      if (point.point3DId !== BigInt(-1)) triangulated++;
    }
    return { numPoints2D: total, numPoints3D: triangulated };
  }, [image]);

  // Compute connected images (images that share 3D points with current image)
  const connectedImages = useMemo(() => {
    if (!reconstruction || !image) return [];

    const matchCounts = new Map<number, number>();
    for (const point2D of image.points2D) {
      if (point2D.point3DId === BigInt(-1)) continue;
      const point3D = reconstruction.points3D.get(point2D.point3DId);
      if (!point3D) continue;
      for (const trackElem of point3D.track) {
        if (trackElem.imageId !== imageDetailId) {
          matchCounts.set(trackElem.imageId,
            (matchCounts.get(trackElem.imageId) || 0) + 1);
        }
      }
    }

    return Array.from(matchCounts.entries())
      .sort((a, b) => b[1] - a[1]) // Sort by match count descending
      .map(([id, count]) => ({
        imageId: id,
        matchCount: count,
        name: reconstruction.images.get(id)?.name || `Image ${id}`
      }));
  }, [reconstruction, image, imageDetailId]);

  // Get matched image data
  const matchedImage = matchedImageId !== null ? reconstruction?.images.get(matchedImageId) : null;
  const matchedCamera = matchedImage ? reconstruction?.cameras.get(matchedImage.cameraId) : null;
  const matchedImageFile = matchedImage ? getImageFile(loadedFiles?.imageFiles, matchedImage.name) : null;

  // Compute match lines between current and matched image
  const matchLines = useMemo(() => {
    if (!showMatchesInModal || matchedImageId === null || !reconstruction || !image || !matchedImage)
      return [];

    const lines: {
      point1: [number, number]; // Current image 2D coords
      point2: [number, number]; // Matched image 2D coords
    }[] = [];

    for (const point2D of image.points2D) {
      if (point2D.point3DId === BigInt(-1)) continue;

      const point3D = reconstruction.points3D.get(point2D.point3DId);
      if (!point3D) continue;

      // Find matching point in the other image
      const matchTrack = point3D.track.find(t => t.imageId === matchedImageId);
      if (matchTrack) {
        const matchedPoint2D = matchedImage.points2D[matchTrack.point2DIdx];
        if (matchedPoint2D) {
          lines.push({
            point1: point2D.xy,
            point2: matchedPoint2D.xy
          });
        }
      }
    }

    return lines;
  }, [showMatchesInModal, matchedImageId, reconstruction, image, matchedImage]);

  // Check if we're in side-by-side match view mode
  const isMatchViewMode = showMatchesInModal && matchedImageId !== null && matchedImage && matchedCamera;
  const MATCH_VIEW_GAP = 16;

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
    const containerHeight = containerSize.height;

    // Calculate dimensions for image 1
    const aspect1 = camera.width / camera.height;
    const containerAspect1 = halfWidth / containerHeight;
    let image1Width: number, image1Height: number;
    if (aspect1 > containerAspect1) {
      image1Width = halfWidth;
      image1Height = halfWidth / aspect1;
    } else {
      image1Height = containerHeight;
      image1Width = containerHeight * aspect1;
    }

    // Calculate dimensions for image 2
    const aspect2 = matchedCamera.width / matchedCamera.height;
    const containerAspect2 = halfWidth / containerHeight;
    let image2Width: number, image2Height: number;
    if (aspect2 > containerAspect2) {
      image2Width = halfWidth;
      image2Height = halfWidth / aspect2;
    } else {
      image2Height = containerHeight;
      image2Width = containerHeight * aspect2;
    }

    return { image1Width, image1Height, image2Width, image2Height };
  }, [camera, matchedCamera, containerSize.width, containerSize.height]);

  // Center modal when it opens
  useEffect(() => {
    if (imageDetailId !== null) {
      const centerX = (window.innerWidth - size.width) / 2;
      const centerY = (window.innerHeight - size.height) / 2;
      setPosition({ x: centerX, y: centerY });
    }
  }, [imageDetailId]);

  // Load image when modal opens
  useEffect(() => {
    if (!imageFile) {
      setImageSrc(null);
      return;
    }

    const url = URL.createObjectURL(imageFile);
    setImageSrc(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [imageFile]);

  // Load matched image when selected
  useEffect(() => {
    if (!matchedImageFile) {
      setMatchedImageSrc(null);
      return;
    }

    const url = URL.createObjectURL(matchedImageFile);
    setMatchedImageSrc(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [matchedImageFile]);

  // Load mask when available
  useEffect(() => {
    if (!maskFile) {
      setMaskSrc(null);
      return;
    }

    const url = URL.createObjectURL(maskFile);
    setMaskSrc(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [maskFile]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeImageDetail();
      } else if (e.key === 'ArrowLeft') {
        goToPrev();
      } else if (e.key === 'ArrowRight') {
        goToNext();
      } else if (e.key === 'm' || e.key === 'M') {
        if (hasMask) {
          setShowMaskOverlay(!showMaskOverlay);
        }
      }
    };

    if (imageDetailId !== null) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [imageDetailId, closeImageDetail, goToPrev, goToNext, hasMask, showMaskOverlay, setShowMaskOverlay]);

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

  return (
    <div className="fixed inset-0 z-[1000] pointer-events-none">
      <div
        className="absolute inset-0 bg-ds-void/50 pointer-events-auto"
        onClick={closeImageDetail}
      />

      <div
        className="absolute bg-ds-tertiary rounded-lg shadow-ds-lg flex flex-col pointer-events-auto"
        style={{
          left: position.x,
          top: position.y,
          width: size.width,
          height: size.height,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-4 py-2 border-b border-ds cursor-move select-none"
          onMouseDown={handleDragStart}
        >
          <h2 className="text-ds-primary font-semibold">
            {isMatchViewMode
              ? `Image Matches: ${image?.name} ↔ ${matchedImage?.name} (${matchLines.length} matches)`
              : 'Image Information'}
          </h2>
          <button
            onClick={closeImageDetail}
            onMouseDown={(e) => e.stopPropagation()}
            className="text-ds-muted hover:text-ds-primary text-2xl leading-none px-2 cursor-pointer"
          >
            ×
          </button>
        </div>

        <div className="flex flex-col flex-1 overflow-hidden p-4 gap-4">
          <div className="flex-shrink-0 overflow-auto">
            <table className="w-full text-base">
              <tbody>
                <InfoRow label="image_id" value={image.imageId} />
                <InfoRow label="camera" value={formatCameraInfo(camera)} multiline />
                <InfoRow label="cam_from_world" value={formatRigid3d(image.qvec, image.tvec)} multiline />
                <InfoRow label="num_points2D" value={numPoints2D} valueColor="text-ds-error" />
                <InfoRow label="num_points3D" value={numPoints3D} valueColor="text-ds-success" />
                <InfoRow label="name" value={image.name} />
              </tbody>
            </table>
          </div>

          <div className="flex-1 min-h-0 flex flex-col">
            <div ref={imageContainerRef} className="relative flex-1 min-h-0 bg-ds-secondary rounded overflow-hidden">
              {isMatchViewMode ? (
                <>
                  <div className="absolute inset-0 flex" style={{ gap: MATCH_VIEW_GAP }}>
                    <div className="flex-1 flex items-center justify-center">
                      {imageSrc ? (
                        <img
                          src={imageSrc}
                          alt={image.name}
                          style={{ width: sideBySideDimensions.image1Width, height: sideBySideDimensions.image1Height }}
                          className="object-contain"
                          draggable={false}
                        />
                      ) : (
                        <div className="text-ds-muted">No image</div>
                      )}
                    </div>
                    <div className="flex-1 flex items-center justify-center">
                      {matchedImageSrc ? (
                        <img
                          src={matchedImageSrc}
                          alt={matchedImage?.name || ''}
                          style={{ width: sideBySideDimensions.image2Width, height: sideBySideDimensions.image2Height }}
                          className="object-contain"
                          draggable={false}
                        />
                      ) : (
                        <div className="text-ds-muted">No image</div>
                      )}
                    </div>
                  </div>
                  {matchLines.length > 0 && sideBySideDimensions.image1Width > 0 && (
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
                    />
                  )}
                </>
              ) : imageSrc ? (
                <>
                  <img
                    src={imageSrc}
                    alt={image.name}
                    className="absolute inset-0 w-full h-full object-contain"
                    draggable={false}
                  />
                  {showMaskOverlay && maskSrc && (
                    <img
                      src={maskSrc}
                      alt="mask"
                      className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                      style={{ opacity: maskOpacity ?? 0.7 }}
                      draggable={false}
                    />
                  )}
                  {(showPoints2D || showPoints3D) && renderedImageWidth > 0 && (
                    <KeypointCanvas
                      image={image}
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
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-ds-muted">No image file loaded</div>
              )}
            </div>

            <div className="mt-2 flex items-center justify-between">
              <div className="flex items-center gap-4">
                {!isMatchViewMode && (
                  <>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="showPoints2D"
                        checked={showPoints2D}
                        onChange={(e) => setShowPoints2D(e.target.checked)}
                        className="w-5 h-5 accent-ds-error"
                      />
                      <label htmlFor="showPoints2D" className="text-ds-primary text-base">
                        Show Points2D <span className="text-ds-error">({numPoints2D - numPoints3D})</span>
                      </label>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="showPoints3D"
                        checked={showPoints3D}
                        onChange={(e) => setShowPoints3D(e.target.checked)}
                        className="w-5 h-5 accent-ds-success"
                      />
                      <label htmlFor="showPoints3D" className="text-ds-primary text-base">
                        Show Points3D <span className="text-ds-success">({numPoints3D})</span>
                      </label>
                    </div>
                    {hasMask && (
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="showMaskOverlay"
                          checked={showMaskOverlay}
                          onChange={(e) => setShowMaskOverlay(e.target.checked)}
                          className="w-5 h-5 accent-ds-warning"
                        />
                        <label htmlFor="showMaskOverlay" className="text-ds-primary text-base">
                          Show Mask
                        </label>
                        {showMaskOverlay && (
                          <input
                            type="range"
                            min="0.1"
                            max="1"
                            step="0.1"
                            value={maskOpacity}
                            onChange={(e) => setMaskOpacity(parseFloat(e.target.value))}
                            className="w-20"
                            title={`Mask opacity: ${Math.round(maskOpacity * 100)}%`}
                          />
                        )}
                      </div>
                    )}
                  </>
                )}

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="showMatchesInModal"
                    checked={showMatchesInModal}
                    onChange={(e) => setShowMatchesInModal(e.target.checked)}
                    className="w-5 h-5 accent-ds-success"
                  />
                  <label htmlFor="showMatchesInModal" className="text-ds-primary text-base">
                    Show Matches
                  </label>
                </div>

                {showMatchesInModal && (
                  <select
                    value={matchedImageId ?? ''}
                    onChange={(e) => setMatchedImageId(e.target.value ? parseInt(e.target.value) : null)}
                    className="bg-ds-input text-ds-primary text-base px-2 py-1.5 rounded border border-ds focus-ds"
                  >
                    <option value="">Select connected image...</option>
                    {connectedImages.map(({ imageId, matchCount, name }) => (
                      <option key={imageId} value={imageId}>
                        {name} ({matchCount} matches)
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={goToPrev}
                  disabled={!hasPrev}
                  className={`px-4 py-1.5 rounded text-base ${
                    hasPrev
                      ? 'bg-ds-hover hover:bg-ds-elevated text-ds-primary'
                      : 'bg-ds-secondary text-ds-muted cursor-not-allowed'
                  }`}
                >
                  ← Previous
                </button>
                <div className="flex items-center text-base">
                  <input
                    type="text"
                    defaultValue={imageDetailId ?? ''}
                    key={imageDetailId}
                    className="w-16 px-2 py-1.5 rounded-l text-center bg-ds-input text-ds-primary border border-ds focus-ds"
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
                  <span className="w-16 px-2 py-1.5 text-center bg-ds-secondary text-ds-secondary border-y border-r border-ds rounded-r">
                    {imageIds.length}
                  </span>
                </div>
                <button
                  onClick={goToNext}
                  disabled={!hasNext}
                  className={`px-4 py-1.5 rounded text-base ${
                    hasNext
                      ? 'bg-ds-hover hover:bg-ds-elevated text-ds-primary'
                      : 'bg-ds-secondary text-ds-muted cursor-not-allowed'
                  }`}
                >
                  Next →
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="absolute top-0 left-0 w-3 h-3 cursor-nw-resize" onMouseDown={(e) => handleResizeStart(e, 'nw')} />
        <div className="absolute top-0 right-0 w-3 h-3 cursor-ne-resize" onMouseDown={(e) => handleResizeStart(e, 'ne')} />
        <div className="absolute bottom-0 left-0 w-3 h-3 cursor-sw-resize" onMouseDown={(e) => handleResizeStart(e, 'sw')} />
        <div className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize" onMouseDown={(e) => handleResizeStart(e, 'se')} />
        <div className="absolute top-0 left-3 right-3 h-1 cursor-n-resize" onMouseDown={(e) => handleResizeStart(e, 'n')} />
        <div className="absolute bottom-0 left-3 right-3 h-1 cursor-s-resize" onMouseDown={(e) => handleResizeStart(e, 's')} />
        <div className="absolute left-0 top-3 bottom-3 w-1 cursor-w-resize" onMouseDown={(e) => handleResizeStart(e, 'w')} />
        <div className="absolute right-0 top-3 bottom-3 w-1 cursor-e-resize" onMouseDown={(e) => handleResizeStart(e, 'e')} />
      </div>
    </div>
  );
}

interface InfoRowProps {
  label: string;
  value: string | number;
  valueColor?: string;
  multiline?: boolean;
}

function InfoRow({ label, value, valueColor = 'text-ds-primary', multiline = false }: InfoRowProps) {
  return (
    <tr className="border-b border-ds-subtle">
      <td className="px-3 py-2 text-ds-secondary align-top whitespace-nowrap">{label}</td>
      <td className={`px-3 py-2 ${valueColor} ${multiline ? 'break-all' : ''}`}>
        {value}
      </td>
    </tr>
  );
}
