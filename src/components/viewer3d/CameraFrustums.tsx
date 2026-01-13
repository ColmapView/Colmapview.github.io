import { useMemo, useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Line, Html } from '@react-three/drei';
import { useReconstructionStore, useViewerStore } from '../../store';
import type { Camera, Image } from '../../types/colmap';

// Cycle through CMY colors (Cyan -> Magenta -> Yellow -> Cyan)
function cmyToHex(t: number): string {
  const phase = (t % 1) * 3;
  let r = 0, g = 0, b = 0;
  if (phase < 1) {
    // Cyan to Magenta
    r = phase;
    g = 1 - phase;
    b = 1;
  } else if (phase < 2) {
    // Magenta to Yellow
    const p = phase - 1;
    r = 1;
    g = p;
    b = 1 - p;
  } else {
    // Yellow to Cyan
    const p = phase - 2;
    r = 1 - p;
    g = 1;
    b = p;
  }
  const toHex = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function getImageWorldPosition(image: Image): THREE.Vector3 {
  const quat = new THREE.Quaternion(image.qvec[1], image.qvec[2], image.qvec[3], image.qvec[0]).invert();
  const t = new THREE.Vector3(image.tvec[0], image.tvec[1], image.tvec[2]);
  return t.negate().applyQuaternion(quat);
}

function getImageWorldQuaternion(image: Image): THREE.Quaternion {
  return new THREE.Quaternion(image.qvec[1], image.qvec[2], image.qvec[3], image.qvec[0]).invert();
}

interface CameraFrustumProps {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  camera: Camera;
  image: Image;
  scale: number;
  color?: string;
  isSelected?: boolean;
  imageFile?: File;
  showImagePlane?: boolean;
  imagePlaneOpacity?: number;
  onClick?: () => void;
  onDoubleClick?: () => void;
  onContextMenu?: () => void;
}

function CameraFrustum({
  position,
  quaternion,
  camera,
  image,
  scale,
  color = '#ff0000',
  isSelected = false,
  imageFile,
  showImagePlane = false,
  imagePlaneOpacity = 0.9,
  onClick,
  onDoubleClick,
  onContextMenu,
}: CameraFrustumProps) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const [hovered, setHovered] = useState(false);
  const urlsToCleanup = useRef<string[]>([]);

  useEffect(() => {
    if (!imageFile || !showImagePlane) {
      setTexture(null);
      return;
    }

    const url = URL.createObjectURL(imageFile);
    urlsToCleanup.current.push(url);

    let cancelled = false;
    const loader = new THREE.TextureLoader();
    loader.load(
      url,
      (tex) => {
        if (!cancelled) {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.flipY = false;
          tex.needsUpdate = true;
          setTexture(tex);
        }
      },
      undefined,
      (error) => {
        if (!cancelled) {
          console.error('Error loading texture:', error);
        }
      }
    );

    return () => {
      cancelled = true;
    };
  }, [imageFile, showImagePlane]);

  useEffect(() => {
    return () => {
      for (const url of urlsToCleanup.current) {
        URL.revokeObjectURL(url);
      }
      urlsToCleanup.current = [];
    };
  }, []);

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

  // Compute hover color (brighter/cyan tint)
  const displayColor = hovered ? '#00ffff' : color;
  const lineWidth = hovered ? 2.5 : 1.5;

  // Count valid 2D points (those with 3D correspondences)
  const numPoints = image.points2D.filter(p => p.point3DId !== BigInt(-1)).length;

  return (
    <group position={position} quaternion={quaternion}>
      {lineSegments.map((points, i) => (
        <Line key={i} points={points} color={displayColor} lineWidth={lineWidth} />
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
          key={showImagePlane && texture ? texture.uuid : 'no-texture'}
          map={showImagePlane && texture ? texture : null}
          color={showImagePlane && texture ? undefined : displayColor}
          side={THREE.DoubleSide}
          transparent={!isSelected}
          opacity={isSelected ? 1 : (hovered ? 0.6 : (showImagePlane && texture ? imagePlaneOpacity : 0.3))}
        />
      </mesh>
      {hovered && (
        <Html
          position={[0, 0, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <div className="bg-ds-tertiary border border-ds rounded-lg px-3 py-2 shadow-ds-lg whitespace-nowrap text-sm">
            <div className="text-ds-primary">{image.name}</div>
            <div className="text-ds-secondary">#{image.imageId}</div>
            <div className="text-ds-secondary">{numPoints} points</div>
            <div className="flex items-center gap-3 text-ds-tertiary mt-2 border-t border-ds pt-2">
              <span className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="6" y="2" width="12" height="20" rx="6"/>
                  <path d="M12 2v8"/>
                  <rect x="6" y="2" width="6" height="8" rx="3" fill="currentColor" opacity="0.5"/>
                </svg>
                select
              </span>
              <span className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="6" y="2" width="12" height="20" rx="6"/>
                  <path d="M12 2v8"/>
                  <rect x="12" y="2" width="6" height="8" rx="3" fill="currentColor" opacity="0.5"/>
                </svg>
                view
              </span>
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

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

  const [rainbowHue, setRainbowHue] = useState(0);

  useFrame((_, delta) => {
    if (rainbowMode && selectedImageId !== null) {
      setRainbowHue((h) => (h + delta * rainbowSpeed * 0.5) % 1);
    }
  });

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
        imageFile: loadedFiles?.imageFiles.get(image.name),
      });
    }

    return result;
  }, [reconstruction, showCameras, loadedFiles]);

  if (!showCameras || frustums.length === 0) return null;

  const selectedColor = rainbowMode ? cmyToHex(rainbowHue) : '#ff00ff';

  return (
    <group>
      {frustums.map((f) => (
        <CameraFrustum
          key={f.image.imageId}
          position={f.position}
          quaternion={f.quaternion}
          camera={f.camera}
          image={f.image}
          scale={cameraScale}
          color={f.image.imageId === selectedImageId ? selectedColor : '#ff0000'}
          isSelected={f.image.imageId === selectedImageId}
          imageFile={f.imageFile}
          showImagePlane={showImagePlanes}
          imagePlaneOpacity={imagePlaneOpacity}
          onClick={() => setSelectedImageId(f.image.imageId === selectedImageId ? null : f.image.imageId)}
          onDoubleClick={() => openImageDetail(f.image.imageId)}
          onContextMenu={() => flyToImage(f.image.imageId)}
        />
      ))}
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
          color="#ff00ff"
          lineWidth={1}
          transparent
          opacity={matchesOpacity}
        />
      ))}
    </group>
  );
}
