import { useMemo, useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Line } from '@react-three/drei';
import { useReconstructionStore, useViewerStore } from '../../store';
import type { Camera, Image } from '../../types/colmap';

interface CameraFrustumProps {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  camera: Camera;
  scale: number;
  color?: string;
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
  scale,
  color = '#ff0000',
  imageFile,
  showImagePlane = false,
  imagePlaneOpacity = 0.9,
  onClick,
  onDoubleClick,
  onContextMenu,
}: CameraFrustumProps) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const urlsToCleanup = useRef<string[]>([]);

  // Load texture from image file
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

  // Cleanup all URLs on unmount
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

    // Define the 5 vertices
    const apex: [number, number, number] = [0, 0, 0];
    const bl: [number, number, number] = [-halfWidth, -halfHeight, depth];
    const br: [number, number, number] = [halfWidth, -halfHeight, depth];
    const tr: [number, number, number] = [halfWidth, halfHeight, depth];
    const tl: [number, number, number] = [-halfWidth, halfHeight, depth];

    // Create line segments as arrays of points for drei's Line component
    const lineSegments: [number, number, number][][] = [
      // Lines from apex to corners
      [apex, bl],
      [apex, br],
      [apex, tr],
      [apex, tl],
      // Near plane rectangle
      [bl, br],
      [br, tr],
      [tr, tl],
      [tl, bl],
    ];

    return {
      lineSegments,
      planeSize: { width: halfWidth * 2, height: halfHeight * 2, depth },
    };
  }, [camera, scale]);

  return (
    <group position={position} quaternion={quaternion}>
      {lineSegments.map((points, i) => (
        <Line key={i} points={points} color={color} lineWidth={1.5} />
      ))}

      {/* Front plane - either image texture or semi-transparent fill */}
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
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          document.body.style.cursor = 'auto';
        }}
      >
        <planeGeometry args={[planeSize.width, planeSize.height]} />
        <meshBasicMaterial
          key={showImagePlane && texture ? texture.uuid : 'no-texture'}
          map={showImagePlane && texture ? texture : null}
          color={showImagePlane && texture ? undefined : color}
          side={THREE.DoubleSide}
          transparent
          opacity={showImagePlane && texture ? imagePlaneOpacity : 0.3}
        />
      </mesh>
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

      // COLMAP stores cam_from_world (rotation and translation that transforms world to camera)
      // We need world_from_cam for rendering the camera position in world coordinates

      // Create quaternion from COLMAP format (qw, qx, qy, qz)
      const quat = new THREE.Quaternion(
        image.qvec[1], // qx
        image.qvec[2], // qy
        image.qvec[3], // qz
        image.qvec[0]  // qw
      );

      // Invert to get world_from_cam rotation
      const worldFromCamQuat = quat.clone().invert();

      // Translation in COLMAP is camera position in world = -R^T * t
      const translation = new THREE.Vector3(
        image.tvec[0],
        image.tvec[1],
        image.tvec[2]
      );
      const position = translation.clone().negate().applyQuaternion(worldFromCamQuat);

      // Find the corresponding image file
      const imageFile = loadedFiles?.imageFiles.get(image.name);

      result.push({
        image,
        camera,
        position,
        quaternion: worldFromCamQuat,
        imageFile,
      });
    }

    return result;
  }, [reconstruction, showCameras, loadedFiles]);

  if (!showCameras || frustums.length === 0) return null;

  return (
    <group>
      {frustums.map((f) => (
        <CameraFrustum
          key={f.image.imageId}
          position={f.position}
          quaternion={f.quaternion}
          camera={f.camera}
          scale={cameraScale}
          color={f.image.imageId === selectedImageId ? '#ff00ff' : '#ff0000'}
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

/**
 * Renders lines connecting the selected camera to all matched cameras.
 * Two cameras are "matched" if they share common 3D points.
 */
export function CameraMatches() {
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const selectedImageId = useViewerStore((s) => s.selectedImageId);
  const showMatches = useViewerStore((s) => s.showMatches);
  const matchesOpacity = useViewerStore((s) => s.matchesOpacity);
  const cameraScale = useViewerStore((s) => s.cameraScale);

  const matchLines = useMemo(() => {
    if (!reconstruction || selectedImageId === null || !showMatches) return [];

    const selectedImage = reconstruction.images.get(selectedImageId);
    if (!selectedImage) return [];

    // Get camera position for selected image
    const getImagePosition = (image: Image): THREE.Vector3 => {
      const quat = new THREE.Quaternion(
        image.qvec[1], image.qvec[2], image.qvec[3], image.qvec[0]
      ).invert();
      const t = new THREE.Vector3(image.tvec[0], image.tvec[1], image.tvec[2]);
      return t.negate().applyQuaternion(quat);
    };

    const selectedPos = getImagePosition(selectedImage);

    // Find matched images by looking at shared 3D points
    const matchedImageIds = new Set<number>();

    for (const point2D of selectedImage.points2D) {
      if (point2D.point3DId === BigInt(-1)) continue; // No 3D point

      const point3D = reconstruction.points3D.get(point2D.point3DId);
      if (!point3D) continue;

      // Add all other images that see this point
      for (const trackElem of point3D.track) {
        if (trackElem.imageId !== selectedImageId) {
          matchedImageIds.add(trackElem.imageId);
        }
      }
    }

    // Create lines to matched cameras (apex to apex)
    const lines: { start: [number, number, number]; end: [number, number, number] }[] = [];

    for (const matchedId of matchedImageIds) {
      const matchedImage = reconstruction.images.get(matchedId);
      if (!matchedImage) continue;

      const matchedPos = getImagePosition(matchedImage);

      // Line from selected camera apex to matched camera apex
      // Apex is at camera position (0,0,0 in local coords)
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
