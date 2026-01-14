import { useMemo, useState, useRef, memo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Line, Html } from '@react-three/drei';
import { useReconstructionStore, useViewerStore } from '../../store';
import type { Camera, Image } from '../../types/colmap';
import { getImageFile } from '../../utils/imageFileUtils';
import { getImageWorldPosition, getImageWorldQuaternion } from '../../utils/colmapTransforms';
import { useFrustumTexture } from '../../hooks/useFrustumTexture';
import { VIZ_COLORS, RAINBOW, OPACITY, LINE_WIDTH, hoverCardStyles, ICON_SIZES } from '../../theme';

interface CameraFrustumProps {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  camera: Camera;
  image: Image;
  scale: number;
  color?: string;
  isSelected?: boolean;
  dimmed?: boolean;
  imageFile?: File;
  showImagePlane?: boolean;
  imagePlaneOpacity?: number;
  rainbowMode?: boolean;
  rainbowSpeed?: number;
  onClick?: () => void;
  onDoubleClick?: () => void;
  onContextMenu?: () => void;
}

// Reusable color object
const tempColorFrustum = new THREE.Color();

const CameraFrustum = memo(function CameraFrustum({
  position,
  quaternion,
  camera,
  image,
  scale,
  color = VIZ_COLORS.frustum.default,
  isSelected = false,
  dimmed = false,
  imageFile,
  showImagePlane = false,
  imagePlaneOpacity = OPACITY.frustum.withTexture,
  rainbowMode = false,
  rainbowSpeed = 2.5,
  onClick,
  onDoubleClick,
  onContextMenu,
}: CameraFrustumProps) {
  const [hovered, setHovered] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lineRefs = useRef<any[]>([]);
  const planeMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const rainbowHueRef = useRef(0);

  // Use optimized texture loading with caching and thumbnails
  const texture = useFrustumTexture(imageFile, image.name, showImagePlane);

  // Track previous rainbow mode to detect when it's disabled
  const prevRainbowModeRef = useRef(rainbowMode);

  // Animate rainbow color for selected frustum without causing re-renders
  useFrame((_, delta) => {
    // When rainbow mode is disabled, reset colors to the display color (magenta for selected)
    if (prevRainbowModeRef.current && !rainbowMode && isSelected) {
      tempColorFrustum.set(color);
      for (const line of lineRefs.current) {
        if (line?.material && 'color' in line.material) {
          (line.material as THREE.LineBasicMaterial).color.copy(tempColorFrustum);
        }
      }
      if (planeMatRef.current && !showImagePlane) {
        planeMatRef.current.color.copy(tempColorFrustum);
      }
    }
    prevRainbowModeRef.current = rainbowMode;

    if (isSelected && rainbowMode && !hovered) {
      rainbowHueRef.current = (rainbowHueRef.current + delta * rainbowSpeed * RAINBOW.speedMultiplier) % 1;
      const hue = rainbowHueRef.current;
      // Compute RGB from HSL (saturation=1, lightness=RAINBOW.lightness)
      const c = RAINBOW.chroma;
      const x = c * (1 - Math.abs((hue * 6) % 2 - 1));
      const m = RAINBOW.lightness - c / 2;
      let r = 0, g = 0, b = 0;
      const { hueSegments } = RAINBOW;
      if (hue < hueSegments.redToYellow) { r = c; g = x; }
      else if (hue < hueSegments.yellowToGreen) { r = x; g = c; }
      else if (hue < hueSegments.greenToCyan) { g = c; b = x; }
      else if (hue < hueSegments.cyanToBlue) { g = x; b = c; }
      else if (hue < hueSegments.blueToMagenta) { r = x; b = c; }
      else { r = c; b = x; }
      tempColorFrustum.setRGB(r + m, g + m, b + m);
      // Update line colors
      for (const line of lineRefs.current) {
        if (line?.material && 'color' in line.material) {
          (line.material as THREE.LineBasicMaterial).color.copy(tempColorFrustum);
        }
      }
      // Update plane material color if not showing texture
      if (planeMatRef.current && !showImagePlane) {
        planeMatRef.current.color.copy(tempColorFrustum);
      }
    }
  });

  const { lineSegments, planeSize } = useMemo(() => {
    const aspectRatio = camera.width / camera.height;
    const focalLength = camera.params[0] || 1;
    const halfWidth = scale * camera.width / (2 * focalLength);
    const halfHeight = halfWidth / aspectRatio;
    const depth = scale;

    const apex: [number, number, number] = [0, 0, 0];
    const bl: [number, number, number] = [-halfWidth, -halfHeight, depth];
    const br: [number, number, number] = [halfWidth, -halfHeight, depth];
    const tr: [number, number, number] = [halfWidth, halfHeight, depth];
    const tl: [number, number, number] = [-halfWidth, halfHeight, depth];

    const lineSegments: [number, number, number][][] = [
      [apex, bl], [apex, br], [apex, tr], [apex, tl],
      [bl, br], [br, tr], [tr, tl], [tl, bl],
    ];

    return {
      lineSegments,
      planeSize: { width: halfWidth * 2, height: halfHeight * 2, depth },
    };
  }, [camera, scale]);

  // Compute hover color (muted cyan tint)
  const displayColor = hovered ? VIZ_COLORS.frustum.hover : color;
  const lineWidth = hovered ? LINE_WIDTH.hovered : LINE_WIDTH.default;
  const lineOpacity = dimmed && !hovered ? OPACITY.dimmed : 1;

  // Count valid 2D points (those with 3D correspondences)
  const numPoints = image.points2D.filter(p => p.point3DId !== BigInt(-1)).length;

  // Store line refs for imperative updates
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const setLineRef = (index: number) => (ref: any) => {
    if (ref) lineRefs.current[index] = ref;
  };

  return (
    <group position={position} quaternion={quaternion}>
      {lineSegments.map((points, i) => (
        <Line key={i} ref={setLineRef(i)} points={points} color={displayColor} lineWidth={lineWidth} transparent opacity={lineOpacity} />
      ))}
      <mesh
        position={[0, 0, planeSize.depth]}
        onClick={(e) => {
          e.stopPropagation();
          onClick?.();
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onDoubleClick?.();
        }}
        onContextMenu={(e) => {
          e.stopPropagation();
          onContextMenu?.();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = 'auto';
        }}
      >
        <planeGeometry args={[planeSize.width, planeSize.height]} />
        <meshBasicMaterial
          ref={planeMatRef}
          key={showImagePlane && texture ? texture.uuid : 'no-texture'}
          map={showImagePlane && texture ? texture : null}
          color={showImagePlane && texture ? undefined : displayColor}
          side={THREE.DoubleSide}
          transparent
          depthWrite={false}
          opacity={(hovered ? (showImagePlane && texture ? OPACITY.frustum.default : OPACITY.frustum.hoveredNoTexture) : (showImagePlane && texture ? imagePlaneOpacity : OPACITY.frustum.default)) * (dimmed && !hovered ? OPACITY.dimmed : 1)}
        />
      </mesh>
      {hovered && (
        <Html
          position={[planeSize.width / 2, planeSize.height / 2, planeSize.depth]}
          style={{ pointerEvents: 'none' }}
        >
          <div className={hoverCardStyles.container}>
            <div className={hoverCardStyles.title}>{image.name}</div>
            <div className={hoverCardStyles.subtitle}>#{image.imageId}</div>
            <div className={hoverCardStyles.subtitle}>{numPoints} points</div>
            <div className={hoverCardStyles.hint}>
              <div className={hoverCardStyles.hintRow}>
                <svg className={ICON_SIZES.hoverCard} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="6" y="2" width="12" height="20" rx="6"/>
                  <path d="M12 2v8"/>
                  <rect x="6" y="2" width="6" height="8" rx="3" fill="currentColor" opacity="0.5"/>
                </svg>
                Click: select
              </div>
              <div className={hoverCardStyles.hintRow}>
                <svg className={ICON_SIZES.hoverCard} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="6" y="2" width="12" height="20" rx="6"/>
                  <path d="M12 2v8"/>
                  <rect x="12" y="2" width="6" height="8" rx="3" fill="currentColor" opacity="0.5"/>
                </svg>
                Right-click: view
              </div>
              <div className={hoverCardStyles.hintRow}>
                <svg className={ICON_SIZES.hoverCard} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="6" y="2" width="12" height="20" rx="6"/>
                  <path d="M12 2v8"/>
                  <rect x="6" y="2" width="6" height="8" rx="3" fill="currentColor" opacity="0.5"/>
                  <text x="18" y="18" fontSize="8" fill="currentColor" stroke="none">2</text>
                </svg>
                Double-click: image info
              </div>
            </div>
          </div>
        </Html>
      )}
    </group>
  );
});

export function CameraFrustums() {
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const loadedFiles = useReconstructionStore((s) => s.loadedFiles);
  const showCameras = useViewerStore((s) => s.showCameras);
  const cameraScale = useViewerStore((s) => s.cameraScale);
  const selectedImageId = useViewerStore((s) => s.selectedImageId);
  const setSelectedImageId = useViewerStore((s) => s.setSelectedImageId);
  const showImagePlanes = useViewerStore((s) => s.showImagePlanes);
  const imagePlaneOpacity = useViewerStore((s) => s.imagePlaneOpacity);
  const openImageDetail = useViewerStore((s) => s.openImageDetail);
  const flyToImage = useViewerStore((s) => s.flyToImage);
  const rainbowMode = useViewerStore((s) => s.rainbowMode);
  const rainbowSpeed = useViewerStore((s) => s.rainbowSpeed);

  // Extract imageFiles to avoid recalculating when other loadedFiles properties change
  const imageFiles = loadedFiles?.imageFiles;

  const frustums = useMemo(() => {
    if (!reconstruction || !showCameras) return [];

    const result: {
      image: Image;
      camera: Camera;
      position: THREE.Vector3;
      quaternion: THREE.Quaternion;
      imageFile?: File;
    }[] = [];

    for (const image of reconstruction.images.values()) {
      const camera = reconstruction.cameras.get(image.cameraId);
      if (!camera) continue;

      result.push({
        image,
        camera,
        position: getImageWorldPosition(image),
        quaternion: getImageWorldQuaternion(image),
        imageFile: getImageFile(imageFiles, image.name),
      });
    }

    return result;
  }, [reconstruction, showCameras, imageFiles]);

  if (!showCameras || frustums.length === 0) return null;

  return (
    <group>
      {frustums.map((f) => {
        const isSelected = f.image.imageId === selectedImageId;
        return (
          <CameraFrustum
            key={f.image.imageId}
            position={f.position}
            quaternion={f.quaternion}
            camera={f.camera}
            image={f.image}
            scale={cameraScale}
            color={isSelected ? VIZ_COLORS.frustum.selected : VIZ_COLORS.frustum.default}
            isSelected={isSelected}
            dimmed={selectedImageId !== null && !isSelected}
            imageFile={f.imageFile}
            showImagePlane={showImagePlanes}
            imagePlaneOpacity={imagePlaneOpacity}
            rainbowMode={isSelected ? rainbowMode : false}
            rainbowSpeed={rainbowSpeed}
            onClick={() => setSelectedImageId(isSelected ? null : f.image.imageId)}
            onDoubleClick={() => openImageDetail(f.image.imageId)}
            onContextMenu={() => flyToImage(f.image.imageId)}
          />
        );
      })}
    </group>
  );
}

export function CameraMatches() {
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const selectedImageId = useViewerStore((s) => s.selectedImageId);
  const showMatches = useViewerStore((s) => s.showMatches);
  const matchesOpacity = useViewerStore((s) => s.matchesOpacity);

  const matchLines = useMemo(() => {
    if (!reconstruction || selectedImageId === null || !showMatches) return [];

    const selectedImage = reconstruction.images.get(selectedImageId);
    if (!selectedImage) return [];

    const selectedPos = getImageWorldPosition(selectedImage);
    const matchedImageIds = new Set<number>();

    for (const point2D of selectedImage.points2D) {
      if (point2D.point3DId === BigInt(-1)) continue;

      const point3D = reconstruction.points3D.get(point2D.point3DId);
      if (!point3D) continue;

      for (const trackElem of point3D.track) {
        if (trackElem.imageId !== selectedImageId) {
          matchedImageIds.add(trackElem.imageId);
        }
      }
    }

    const lines: { start: [number, number, number]; end: [number, number, number] }[] = [];

    for (const matchedId of matchedImageIds) {
      const matchedImage = reconstruction.images.get(matchedId);
      if (!matchedImage) continue;

      const matchedPos = getImageWorldPosition(matchedImage);
      lines.push({
        start: [selectedPos.x, selectedPos.y, selectedPos.z],
        end: [matchedPos.x, matchedPos.y, matchedPos.z],
      });
    }

    return lines;
  }, [reconstruction, selectedImageId, showMatches]);

  if (!showMatches || matchLines.length === 0) return null;

  return (
    <group>
      {matchLines.map((line, i) => (
        <Line
          key={i}
          points={[line.start, line.end]}
          color={VIZ_COLORS.match}
          lineWidth={LINE_WIDTH.match}
          transparent
          opacity={matchesOpacity}
        />
      ))}
    </group>
  );
}
