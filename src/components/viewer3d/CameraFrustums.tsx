import { useMemo, useState, useRef, memo, useCallback, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame, useThree, extend } from '@react-three/fiber';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

// Extend R3F to recognize Line2 components
extend({ LineSegments2, LineSegmentsGeometry, LineMaterial });
import { Html } from '@react-three/drei';
import { useReconstructionStore, useCameraStore, useUIStore } from '../../store';
import type { SelectionColorMode } from '../../store/types';
import type { Camera, Image } from '../../types/colmap';
import { getCameraIntrinsics } from '../../utils/cameraIntrinsics';
import { useGuideStore } from '../../store/stores/guideStore';
import { getImageFile, getUrlImageCached, fetchUrlImage } from '../../utils/imageFileUtils';
import { getImageWorldPosition, getImageWorldQuaternion } from '../../utils/colmapTransforms';
import { useFrustumTexture, useSelectedImageTexture, prioritizeFrustumTexture, pauseFrustumTextureCache, resumeFrustumTextureCache } from '../../hooks/useFrustumTexture';
import { VIZ_COLORS, RAINBOW, OPACITY, TIMING, hoverCardStyles, ICON_SIZES, getCameraColor, contextMenuStyles, getMaterialTransparency } from '../../theme';
import { rainbowColor } from '../../utils/colorUtils';
import { UndistortedImageMaterial } from './UndistortedImageMaterial';

// Shared temp objects for color calculations
const tempColor = new THREE.Color();

// Helper to calculate rainbow color from hue (0-1)
function setRainbowColor(color: THREE.Color, hue: number): void {
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
  color.setRGB(r + m, g + m, b + m);
}

// Helper to calculate matches blink factor (0-1) from phase (0-2 seconds)
function getMatchesBlinkFactor(phase: number): number {
  if (phase < 0.3) return phase / 0.3;
  if (phase < 0.6) return 1;
  if (phase < 1.0) return 1 - (phase - 0.6) / 0.4;
  return 0;
}

// Helper to get frustum base color based on color mode
function getFrustumBaseColor(
  frustumColorMode: 'single' | 'byCamera' | 'byRigFrame',
  cameraIndex: number,
  imageId: number,
  imageFrameIndexMap: Map<number, number>
): string {
  if (frustumColorMode === 'byCamera') {
    return getCameraColor(cameraIndex);
  } else if (frustumColorMode === 'byRigFrame') {
    const frameIndex = imageFrameIndexMap.get(imageId);
    return frameIndex !== undefined ? getCameraColor(frameIndex) : VIZ_COLORS.frustum.default;
  }
  return VIZ_COLORS.frustum.default;
}

// Temp objects for image plane culling (angle check)
const tempForward = new THREE.Vector3();
const tempViewDir = new THREE.Vector3();
const tempWorldPos = new THREE.Vector3();
const tempWorldQuat = new THREE.Quaternion();


// Cosine thresholds for angle-based texture culling
const COS_45_DEG = Math.cos(Math.PI / 4); // ≈ 0.707 (for frustum mode with image planes)
const COS_90_DEG = Math.cos(Math.PI / 2); // = 0 (for imageplane mode - only cull when facing away)

// Custom shader material for lines with per-vertex alpha
const lineVertexShader = `
  attribute float alpha;
  varying float vAlpha;
  varying vec3 vColor;

  void main() {
    vColor = color;
    vAlpha = alpha;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const lineFragmentShader = `
  varying float vAlpha;
  varying vec3 vColor;

  void main() {
    gl_FragColor = vec4(vColor, vAlpha);
  }
`;

// Batched arrow rendering using instanced meshes (cylinder + cone)
interface BatchedArrowMeshesProps {
  frustums: {
    image: Image;
    camera: Camera;
    position: THREE.Vector3;
    quaternion: THREE.Quaternion;
    cameraIndex: number;
  }[];
  cameraScale: number;
  selectedImageId: number | null;
  hoveredImageId: number | null;
  matchedImageIds: Set<number>;
  matchesOpacity: number;
  matchesDisplayMode: 'off' | 'on' | 'blink';
  matchesColor: string;
  frustumColorMode: 'single' | 'byCamera' | 'byRigFrame';
  selectionColorMode: SelectionColorMode;
  selectionColor: string;
  selectionAnimationSpeed: number;
  unselectedCameraOpacity: number;
  imageFrameIndexMap: Map<number, number>;
}

// Temp objects for instanced mesh updates
const tempMatrix = new THREE.Matrix4();
const tempPosition = new THREE.Vector3();
const tempQuaternion = new THREE.Quaternion();
const tempScale = new THREE.Vector3(1, 1, 1);
const tempEuler = new THREE.Euler();

function BatchedArrowMeshes({
  frustums,
  cameraScale,
  selectedImageId,
  hoveredImageId,
  matchedImageIds,
  matchesOpacity,
  matchesDisplayMode,
  matchesColor,
  frustumColorMode,
  selectionColorMode,
  selectionColor,
  selectionAnimationSpeed,
  unselectedCameraOpacity,
  imageFrameIndexMap,
}: BatchedArrowMeshesProps) {
  const shaftRef = useRef<THREE.InstancedMesh>(null);
  const coneRef = useRef<THREE.InstancedMesh>(null);
  const rainbowHueRef = useRef(0);
  const matchesBlinkPhaseRef = useRef(0);

  // Arrow proportions (relative to cameraScale)
  const shaftLength = cameraScale * 0.8;
  const shaftRadius = cameraScale * 0.04;
  const coneLength = cameraScale * 0.2;
  const coneRadius = cameraScale * 0.08;

  // Create geometries once
  const shaftGeometry = useMemo(() => new THREE.CylinderGeometry(shaftRadius, shaftRadius, shaftLength, 8), [shaftRadius, shaftLength]);
  const coneGeometry = useMemo(() => new THREE.ConeGeometry(coneRadius, coneLength, 12), [coneRadius, coneLength]);

  // Create materials
  const shaftMaterial = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }), []);
  const coneMaterial = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }), []);

  // Dispose geometries and materials when they change to prevent GPU memory leaks
  useEffect(() => {
    return () => {
      shaftGeometry.dispose();
      coneGeometry.dispose();
    };
  }, [shaftGeometry, coneGeometry]);

  useEffect(() => {
    return () => {
      shaftMaterial.dispose();
      coneMaterial.dispose();
    };
  }, [shaftMaterial, coneMaterial]);

  // Update instance matrices and colors
  useFrame((state, delta) => {
    if (!shaftRef.current || !coneRef.current) return;
    const shaft = shaftRef.current;
    const cone = coneRef.current;

    // Check if animation is needed
    const isSelectionAnimated = (selectionColorMode === 'blink' || selectionColorMode === 'rainbow') && selectedImageId !== null;
    const isMatchesAnimated = matchesDisplayMode === 'blink' && matchedImageIds.size > 0;

    // Update animation phases
    if (isSelectionAnimated) {
      if (selectionColorMode === 'rainbow') {
        rainbowHueRef.current = (rainbowHueRef.current + delta * selectionAnimationSpeed * RAINBOW.speedMultiplier) % 1;
      }
      // blink uses clock.elapsedTime directly for sync across components
    }
    if (isMatchesAnimated) {
      matchesBlinkPhaseRef.current = (matchesBlinkPhaseRef.current + delta) % 2; // 2 second cycle synced with match lines
    }
    // Use clock time for blink to stay in sync across all components
    const blinkPhase = state.clock.elapsedTime * selectionAnimationSpeed * 2;

    frustums.forEach((f, i) => {
      const isSelected = f.image.imageId === selectedImageId;
      const isHovered = f.image.imageId === hoveredImageId;
      const isMatched = matchedImageIds.has(f.image.imageId);

      // Hide selected arrow (will show image plane instead)
      if (isSelected) {
        tempScale.set(0, 0, 0);
      } else {
        tempScale.set(1, 1, 1);
      }

      // Determine color
      if (isHovered) {
        tempColor.set(VIZ_COLORS.frustum.hover);
      } else if (isSelected) {
        if (selectionColorMode === 'rainbow') {
          setRainbowColor(tempColor, rainbowHueRef.current);
        } else if (selectionColorMode === 'blink') {
          const blinkFactor = (Math.sin(blinkPhase) + 1) / 2;
          const intensity = 0.5 + 0.5 * blinkFactor;
          tempColor.set(selectionColor);
          tempColor.multiplyScalar(intensity);
        } else {
          tempColor.set(selectionColor);
        }
      } else if (isMatched) {
        tempColor.set(matchesColor);
        if (matchesDisplayMode === 'blink') {
          const intensity = matchesOpacity * (0.1 + 0.9 * getMatchesBlinkFactor(matchesBlinkPhaseRef.current));
          tempColor.multiplyScalar(intensity);
        } else {
          tempColor.multiplyScalar(matchesOpacity);
        }
      } else {
        tempColor.set(getFrustumBaseColor(frustumColorMode, f.cameraIndex, f.image.imageId, imageFrameIndexMap));
      }

      // Calculate shaft transform - cylinder is Y-aligned, we need to rotate to face camera direction (Z)
      // Camera looks along local +Z, so we rotate from Y to Z
      tempEuler.set(Math.PI / 2, 0, 0); // Rotate 90° around X to align Y with Z
      tempQuaternion.setFromEuler(tempEuler);
      tempQuaternion.premultiply(f.quaternion); // Apply camera orientation

      // Shaft position: centered along the arrow direction
      tempPosition.set(0, 0, shaftLength / 2);
      tempPosition.applyQuaternion(f.quaternion);
      tempPosition.add(f.position);

      tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
      shaft.setMatrixAt(i, tempMatrix);
      shaft.setColorAt(i, tempColor);

      // Cone position: at the tip of the shaft
      tempPosition.set(0, 0, shaftLength + coneLength / 2);
      tempPosition.applyQuaternion(f.quaternion);
      tempPosition.add(f.position);

      tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
      cone.setMatrixAt(i, tempMatrix);
      cone.setColorAt(i, tempColor);
    });

    shaft.instanceMatrix.needsUpdate = true;
    cone.instanceMatrix.needsUpdate = true;
    if (shaft.instanceColor) shaft.instanceColor.needsUpdate = true;
    if (cone.instanceColor) cone.instanceColor.needsUpdate = true;
  });

  // Update material opacity - 0.9 when no selection, unselectedCameraOpacity when a camera is selected
  useEffect(() => {
    const opacity = selectedImageId === null ? 0.9 : unselectedCameraOpacity;
    // eslint-disable-next-line react-hooks/immutability -- THREE.js materials require direct mutation
    shaftMaterial.opacity = opacity;
    // eslint-disable-next-line react-hooks/immutability -- THREE.js materials require direct mutation
    coneMaterial.opacity = opacity;
  }, [shaftMaterial, coneMaterial, selectedImageId, unselectedCameraOpacity]);

  if (frustums.length === 0) return null;

  return (
    <>
      <instancedMesh ref={shaftRef} args={[shaftGeometry, shaftMaterial, frustums.length]} />
      <instancedMesh ref={coneRef} args={[coneGeometry, coneMaterial, frustums.length]} />
    </>
  );
}

// Batched frustum wireframe rendering (8 segments per frustum)
interface BatchedFrustumLinesProps {
  frustums: {
    image: Image;
    camera: Camera;
    position: THREE.Vector3;
    quaternion: THREE.Quaternion;
    cameraIndex: number;
  }[];
  cameraScale: number;
  selectedImageId: number | null;
  hoveredImageId: number | null;
  matchedImageIds: Set<number>;
  matchesOpacity: number;
  matchesDisplayMode: 'off' | 'on' | 'blink';
  matchesColor: string;
  frustumColorMode: 'single' | 'byCamera' | 'byRigFrame';
  selectionColorMode: SelectionColorMode;
  selectionColor: string;
  selectionAnimationSpeed: number;
  unselectedCameraOpacity: number;
  showImagePlanes: boolean;
  imageFrameIndexMap: Map<number, number>;
}

function BatchedFrustumLines({
  frustums,
  cameraScale,
  selectedImageId,
  hoveredImageId,
  matchedImageIds,
  matchesOpacity,
  matchesDisplayMode,
  matchesColor,
  frustumColorMode,
  selectionColorMode,
  selectionColor,
  selectionAnimationSpeed,
  unselectedCameraOpacity,
  showImagePlanes,
  imageFrameIndexMap,
}: BatchedFrustumLinesProps) {
  const geometryRef = useRef<THREE.BufferGeometry>(null);
  const rainbowHueRef = useRef(0);
  const matchesBlinkPhaseRef = useRef(0);
  // Track previous state to avoid unnecessary GPU uploads
  const prevStateRef = useRef<{
    selectedImageId: number | null;
    hoveredImageId: number | null;
    matchedImageIds: Set<number>;
    unselectedCameraOpacity: number;
    matchesOpacity: number;
    showImagePlanes: boolean;
  } | null>(null);

  // Build geometry with all frustums (8 segments per frustum = 16 vertices)
  const { positions, baseColors, baseAlphas } = useMemo(() => {
    // 8 segments * 2 vertices * 3 components = 48 floats per frustum
    const positions = new Float32Array(frustums.length * 48);
    const baseColors = new Float32Array(frustums.length * 48);
    // 8 segments * 2 vertices = 16 alphas per frustum
    const baseAlphas = new Float32Array(frustums.length * 16);

    frustums.forEach((f, i) => {
      const offset = i * 48;
      const alphaOffset = i * 16;

      // Compute frustum geometry in local space
      const aspectRatio = f.camera.width / f.camera.height;
      const focalLength = f.camera.params[0] || 1;
      const halfWidth = cameraScale * f.camera.width / (2 * focalLength);
      const halfHeight = halfWidth / aspectRatio;
      const depth = cameraScale;

      // Local space vertices
      const apex = new THREE.Vector3(0, 0, 0);
      const bl = new THREE.Vector3(-halfWidth, -halfHeight, depth);
      const br = new THREE.Vector3(halfWidth, -halfHeight, depth);
      const tr = new THREE.Vector3(halfWidth, halfHeight, depth);
      const tl = new THREE.Vector3(-halfWidth, halfHeight, depth);

      // Transform to world space
      apex.applyQuaternion(f.quaternion).add(f.position);
      bl.applyQuaternion(f.quaternion).add(f.position);
      br.applyQuaternion(f.quaternion).add(f.position);
      tr.applyQuaternion(f.quaternion).add(f.position);
      tl.applyQuaternion(f.quaternion).add(f.position);

      // 8 segments (16 vertices):
      // Segment 0: apex to bl
      positions[offset + 0] = apex.x; positions[offset + 1] = apex.y; positions[offset + 2] = apex.z;
      positions[offset + 3] = bl.x; positions[offset + 4] = bl.y; positions[offset + 5] = bl.z;
      // Segment 1: apex to br
      positions[offset + 6] = apex.x; positions[offset + 7] = apex.y; positions[offset + 8] = apex.z;
      positions[offset + 9] = br.x; positions[offset + 10] = br.y; positions[offset + 11] = br.z;
      // Segment 2: apex to tr
      positions[offset + 12] = apex.x; positions[offset + 13] = apex.y; positions[offset + 14] = apex.z;
      positions[offset + 15] = tr.x; positions[offset + 16] = tr.y; positions[offset + 17] = tr.z;
      // Segment 3: apex to tl
      positions[offset + 18] = apex.x; positions[offset + 19] = apex.y; positions[offset + 20] = apex.z;
      positions[offset + 21] = tl.x; positions[offset + 22] = tl.y; positions[offset + 23] = tl.z;
      // Segment 4: bl to br
      positions[offset + 24] = bl.x; positions[offset + 25] = bl.y; positions[offset + 26] = bl.z;
      positions[offset + 27] = br.x; positions[offset + 28] = br.y; positions[offset + 29] = br.z;
      // Segment 5: br to tr
      positions[offset + 30] = br.x; positions[offset + 31] = br.y; positions[offset + 32] = br.z;
      positions[offset + 33] = tr.x; positions[offset + 34] = tr.y; positions[offset + 35] = tr.z;
      // Segment 6: tr to tl
      positions[offset + 36] = tr.x; positions[offset + 37] = tr.y; positions[offset + 38] = tr.z;
      positions[offset + 39] = tl.x; positions[offset + 40] = tl.y; positions[offset + 41] = tl.z;
      // Segment 7: tl to bl
      positions[offset + 42] = tl.x; positions[offset + 43] = tl.y; positions[offset + 44] = tl.z;
      positions[offset + 45] = bl.x; positions[offset + 46] = bl.y; positions[offset + 47] = bl.z;

      // Base color for this camera
      tempColor.set(getFrustumBaseColor(frustumColorMode, f.cameraIndex, f.image.imageId, imageFrameIndexMap));

      // Set color and alpha for all 16 vertices
      for (let v = 0; v < 16; v++) {
        baseColors[offset + v * 3 + 0] = tempColor.r;
        baseColors[offset + v * 3 + 1] = tempColor.g;
        baseColors[offset + v * 3 + 2] = tempColor.b;
        baseAlphas[alphaOffset + v] = 1.0;
      }
    });

    return { positions, baseColors, baseAlphas };
  }, [frustums, cameraScale, frustumColorMode, imageFrameIndexMap]);

  // Update colors and alphas based on selection, hover, selection color mode, opacity
  useFrame((state, delta) => {
    if (!geometryRef.current) return;

    const colorAttr = geometryRef.current.getAttribute('color') as THREE.BufferAttribute;
    const alphaAttr = geometryRef.current.getAttribute('alpha') as THREE.BufferAttribute;
    if (!colorAttr || !alphaAttr) return;

    // Check if animation is needed
    const isSelectionAnimated = (selectionColorMode === 'blink' || selectionColorMode === 'rainbow') && selectedImageId !== null;
    const isMatchesAnimated = matchesDisplayMode === 'blink' && matchedImageIds.size > 0;
    const isAnimated = isSelectionAnimated || isMatchesAnimated;

    // Check if state changed - skip update if static and unchanged
    const prev = prevStateRef.current;
    const stateChanged = !prev ||
      prev.selectedImageId !== selectedImageId ||
      prev.hoveredImageId !== hoveredImageId ||
      prev.matchedImageIds !== matchedImageIds ||
      prev.unselectedCameraOpacity !== unselectedCameraOpacity ||
      prev.matchesOpacity !== matchesOpacity ||
      prev.showImagePlanes !== showImagePlanes;

    // Skip GPU update if nothing changed and no animation is running
    if (!isAnimated && !stateChanged) return;

    // Update tracked state
    prevStateRef.current = { selectedImageId, hoveredImageId, matchedImageIds, unselectedCameraOpacity, matchesOpacity, showImagePlanes };

    const colors = colorAttr.array as Float32Array;
    const alphas = alphaAttr.array as Float32Array;

    // Update animation phases based on mode
    if (isSelectionAnimated) {
      if (selectionColorMode === 'rainbow') {
        rainbowHueRef.current = (rainbowHueRef.current + delta * selectionAnimationSpeed * RAINBOW.speedMultiplier) % 1;
      }
      // blink uses clock.elapsedTime directly for sync across components
    }
    if (isMatchesAnimated) {
      matchesBlinkPhaseRef.current = (matchesBlinkPhaseRef.current + delta) % 2; // 2 second cycle synced with match lines
    }
    // Use clock time for blink to stay in sync across all components
    const blinkPhase = state.clock.elapsedTime * selectionAnimationSpeed * 2;

    frustums.forEach((f, i) => {
      const offset = i * 48;
      const alphaOffset = i * 16;
      const isSelected = f.image.imageId === selectedImageId;
      const isHovered = f.image.imageId === hoveredImageId;
      const isMatched = matchedImageIds.has(f.image.imageId);

      // Determine color
      if (isHovered) {
        tempColor.set(VIZ_COLORS.frustum.hover);
      } else if (isSelected) {
        if (selectionColorMode === 'rainbow') {
          setRainbowColor(tempColor, rainbowHueRef.current);
        } else {
          tempColor.set(selectionColor);
        }
      } else if (isMatched) {
        tempColor.set(matchesColor);
      } else {
        tempColor.setRGB(baseColors[offset], baseColors[offset + 1], baseColors[offset + 2]);
      }

      // Calculate opacity (true alpha, not color darkening)
      // When no camera is selected, use 0.9 opacity for all
      // When a camera is selected: selected/hovered = 1.0, matched = matchesOpacity, others = unselectedCameraOpacity
      let opacity: number;
      if (selectedImageId === null) {
        opacity = 0.9;
      } else if (isSelected || isHovered) {
        opacity = 1.0;
      } else if (isMatched) {
        opacity = matchesOpacity;
      } else {
        opacity = unselectedCameraOpacity;
      }

      // Apply blink effect via opacity for selected camera
      if (isSelected && selectionColorMode === 'blink') {
        const blinkFactor = (Math.sin(blinkPhase) + 1) / 2;
        opacity *= 0.1 + 0.9 * blinkFactor;
      }

      // Apply blink effect via opacity for matched cameras
      if (isMatched && matchesDisplayMode === 'blink') {
        opacity *= 0.1 + 0.9 * getMatchesBlinkFactor(matchesBlinkPhaseRef.current);
      }

      // Hide wireframe when image plane is showing for this frustum
      // In frustum mode: selected frustum shows image plane, so hide its wireframe
      const hasImagePlane = isSelected || (showImagePlanes && selectedImageId === null);
      if (hasImagePlane) opacity = 0;

      // Set color and alpha for all 16 vertices
      for (let v = 0; v < 16; v++) {
        colors[offset + v * 3 + 0] = tempColor.r;
        colors[offset + v * 3 + 1] = tempColor.g;
        colors[offset + v * 3 + 2] = tempColor.b;
        alphas[alphaOffset + v] = opacity;
      }
    });

    colorAttr.needsUpdate = true;
    alphaAttr.needsUpdate = true;
  });

  // Initial colors array (full brightness, alpha handles opacity)
  const initialColors = useMemo(() => {
    return new Float32Array(baseColors);
  }, [baseColors]);

  // Initial alphas array - 0.9 when no selection, unselectedCameraOpacity when a camera is selected
  const initialAlphas = useMemo(() => {
    const alphas = new Float32Array(baseAlphas.length);
    const opacity = selectedImageId === null ? 0.9 : unselectedCameraOpacity;
    for (let i = 0; i < baseAlphas.length; i++) {
      alphas[i] = opacity;
    }
    return alphas;
  }, [baseAlphas.length, unselectedCameraOpacity, selectedImageId]);

  // Create shader material
  const shaderMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: lineVertexShader,
      fragmentShader: lineFragmentShader,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      depthTest: true, // Ensure wireframes are occluded by opaque objects
      // Push wireframes slightly back in depth to avoid z-fighting with image planes
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
  }, []);

  if (frustums.length === 0) return null;

  return (
    <lineSegments material={shaderMaterial}>
      <bufferGeometry ref={geometryRef}>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
        <bufferAttribute
          attach="attributes-color"
          args={[initialColors, 3]}
        />
        <bufferAttribute
          attach="attributes-alpha"
          args={[initialAlphas, 1]}
        />
      </bufferGeometry>
    </lineSegments>
  );
}

// FOV adjustment constants
const FOV_MIN = 10;
const FOV_MAX = 179;
const FOV_STEP = 2;

// Number of segments for tessellated plane in fullFrame undistortion mode
const TESSELLATION_SEGMENTS = 32;

// Frustum plane with texture and interaction (per-frustum component)
interface FrustumPlaneProps {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  camera: Camera;
  image: Image;
  scale: number;
  imageFile?: File;
  showImagePlane: boolean;
  isSelected: boolean;
  isMatched?: boolean;
  wouldGoBack?: boolean; // Whether right-click would navigate back in history
  selectionPlaneOpacity: number;
  color: string;
  cullAngleThreshold?: number; // Cosine of angle threshold for culling (default: COS_45_DEG)
  undistortionEnabled?: boolean;
  undistortionMode?: 'cropped' | 'fullFrame';
  /** Pre-computed count of matched 3D points (from imageStats) */
  numPoints3D: number;
  /** Current hovered image ID from parent - used to sync local hover state */
  hoveredImageId: number | null;
  onHover: (id: number | null) => void;
  onClick: (imageId: number) => void;
  onDoubleClick: (imageId: number) => void;
  onContextMenu: (imageId: number) => void;
}

const FrustumPlane = memo(function FrustumPlane({
  position,
  quaternion,
  camera,
  image,
  scale,
  imageFile,
  showImagePlane,
  isSelected,
  isMatched = false,
  wouldGoBack = false,
  selectionPlaneOpacity,
  color,
  cullAngleThreshold = COS_45_DEG,
  undistortionEnabled = false,
  undistortionMode = 'fullFrame',
  numPoints3D,
  hoveredImageId,
  onHover,
  onClick,
  onDoubleClick,
  onContextMenu,
}: FrustumPlaneProps) {
  const [hovered, setHovered] = useState(false);
  const [viewAngleOk, setViewAngleOk] = useState(true);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  // Sync local hover state with parent - clear when parent clears hover or hovers different image
  useEffect(() => {
    if (hovered && hoveredImageId !== image.imageId) {
      setHovered(false);
      setMousePos(null);
      document.body.style.cursor = '';
    }
  }, [hovered, hoveredImageId, image.imageId]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { camera: threeCamera, controls } = useThree() as any;
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const groupRef = useRef<THREE.Group>(null);

  // FOV adjustment state
  const cameraProjection = useCameraStore((s) => s.cameraProjection);
  const cameraFov = useCameraStore((s) => s.cameraFov);
  const setCameraFov = useCameraStore((s) => s.setCameraFov);

  // Selection color animation state (synced with point cloud)
  const selectionColorMode = useCameraStore((s) => s.selectionColorMode);
  const selectionAnimationSpeed = useCameraStore((s) => s.selectionAnimationSpeed);
  const rainbowHueRef = useRef(0);

  // Handle wheel to adjust FOV when hovering selected image in perspective mode
  useEffect(() => {
    if (!isSelected || !hovered || cameraProjection !== 'perspective') return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // Signal to TrackballControls that we handled this wheel event
      if (controls?.wheelHandled) {
        controls.wheelHandled.current = true;
      }
      const delta = e.deltaY > 0 ? FOV_STEP : -FOV_STEP;
      const newFov = Math.max(FOV_MIN, Math.min(FOV_MAX, cameraFov + delta));
      setCameraFov(newFov);
    };

    // Use capture phase to intercept before controls
    window.addEventListener('wheel', handleWheel, { passive: false, capture: true });
    return () => window.removeEventListener('wheel', handleWheel, { capture: true });
  }, [isSelected, hovered, cameraProjection, cameraFov, setCameraFov, controls]);

  // Check if camera controls are dragging (orbit/pan in progress)
  const isDragging = () => controls?.dragging?.current ?? false;

  // Track hover state in a ref for cleanup
  const hoveredRef = useRef(false);
  hoveredRef.current = hovered;

  // Clear hover state on unmount to prevent stale hover when selection changes
  useEffect(() => {
    return () => {
      // Only clear hover if this specific component was hovered when it unmounts
      if (hoveredRef.current) {
        onHover(null);
        document.body.style.cursor = '';
      }
    };
  }, [onHover]);

  // Load low-res texture for non-selected images (128px)
  const lowResTexture = useFrustumTexture(imageFile, image.name, showImagePlane && !isSelected);

  // Load high-res texture for selected image (original resolution)
  const highResTexture = useSelectedImageTexture(imageFile, image.name, isSelected && showImagePlane);

  // Use high-res when selected, fall back to low-res
  const texture = isSelected ? (highResTexture ?? lowResTexture) : lowResTexture;

  // Keep last valid texture to prevent flashing during camera movement
  // When texture loading is paused, we continue showing the previous texture
  const lastTextureRef = useRef<THREE.Texture | null>(null);
  if (texture) {
    lastTextureRef.current = texture;
  }
  const displayTexture = texture ?? lastTextureRef.current;

  // Show texture when available and viewing angle is good
  const shouldShowTexture = showImagePlane && displayTexture && viewAngleOk;

  // Update material properties when texture state changes (avoids material recreation)
  const prevTextureRef = useRef<THREE.Texture | null>(null);
  if (materialRef.current && prevTextureRef.current !== (shouldShowTexture ? displayTexture : null)) {
    materialRef.current.map = shouldShowTexture ? displayTexture : null;
    materialRef.current.needsUpdate = true;
    prevTextureRef.current = shouldShowTexture ? displayTexture : null;
  }

  // Compute plane size
  const planeSize = useMemo(() => {
    const aspectRatio = camera.width / camera.height;
    const focalLength = camera.params[0] || 1;
    const halfWidth = scale * camera.width / (2 * focalLength);
    const halfHeight = halfWidth / aspectRatio;
    return { width: halfWidth * 2, height: halfHeight * 2, depth: scale };
  }, [camera, scale]);

  // Border line for selected image (rectangle around the plane)
  const borderLine = useMemo(() => {
    const hw = planeSize.width / 2;
    const hh = planeSize.height / 2;
    const points = [
      new THREE.Vector3(-hw, -hh, 0),
      new THREE.Vector3(hw, -hh, 0),
      new THREE.Vector3(hw, hh, 0),
      new THREE.Vector3(-hw, hh, 0),
    ];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: VIZ_COLORS.frustum.selected, transparent: true });
    const line = new THREE.LineLoop(geometry, material);
    line.position.z = planeSize.depth;
    return line;
  }, [planeSize.width, planeSize.height, planeSize.depth]);

  // Dispose borderLine geometry and material when it changes to prevent GPU memory leaks
  useEffect(() => {
    return () => {
      if (borderLine) {
        borderLine.geometry.dispose();
        (borderLine.material as THREE.Material).dispose();
      }
    };
  }, [borderLine]);

  // Viewing angle based texture culling and border color animation
  // Uses world coordinates to account for active transform
  useFrame((state, delta) => {
    // Animate border color when selected (synced with point cloud)
    if (isSelected && borderLine) {
      const mat = borderLine.material as THREE.LineBasicMaterial;
      if (selectionColorMode === 'rainbow') {
        rainbowHueRef.current = (rainbowHueRef.current + delta * selectionAnimationSpeed * RAINBOW.speedMultiplier) % 1;
        mat.color.copy(rainbowColor(rainbowHueRef.current));
      } else if (selectionColorMode === 'blink') {
        // Use clock time for blink to stay in sync across all components
        const blinkPhase = state.clock.elapsedTime * selectionAnimationSpeed * 2;
        const blinkFactor = (Math.sin(blinkPhase) + 1) / 2;
        // Use opacity variation instead of color darkening
        // eslint-disable-next-line react-hooks/immutability -- THREE.js material animation requires direct mutation
        mat.opacity = 0.3 + 0.7 * blinkFactor;
        mat.color.set(color);
      } else {
        // static or off: solid color at full opacity
         
        mat.opacity = 1;
        mat.color.set(color);
      }
    }

    if (showImagePlane && groupRef.current) {
      // Never cull the selected camera
      if (isSelected) {
        if (!viewAngleOk) setViewAngleOk(true);
        return;
      }

      // Get world position and quaternion (includes parent transform)
      groupRef.current.getWorldPosition(tempWorldPos);
      groupRef.current.getWorldQuaternion(tempWorldQuat);

      const distanceToCamera = tempWorldPos.distanceTo(threeCamera.position);

      // Skip angle culling when viewer is close (within 3x the frustum scale)
      const isClose = distanceToCamera < scale * 3;
      if (isClose) {
        if (!viewAngleOk) setViewAngleOk(true);
        return;
      }

      // Frustum forward is +Z in world space (after transform)
      tempForward.set(0, 0, 1).applyQuaternion(tempWorldQuat);
      tempViewDir.copy(threeCamera.position).sub(tempWorldPos).normalize();
      // Dot product: positive means viewport camera is in front of the image plane
      const dotProduct = -tempForward.dot(tempViewDir);
      const angleOk = dotProduct >= cullAngleThreshold;
      if (viewAngleOk !== angleOk) setViewAngleOk(angleOk);
    }
  });

  const displayColor = hovered ? VIZ_COLORS.frustum.hover : color;

  return (
    <group ref={groupRef} position={position} quaternion={quaternion}>
      <mesh
        position={[0, 0, planeSize.depth]}
        // Selected image planes render on top of frustum wireframes
        renderOrder={isSelected ? 100 : 0}
        // Mark mesh with selection state for hover priority checking
        userData={{ isSelectedPlane: isSelected }}
        onClick={(e) => { e.stopPropagation(); onClick(image.imageId); }}
        onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick(image.imageId); }}
        onContextMenu={(e) => { e.stopPropagation(); e.nativeEvent.preventDefault(); e.nativeEvent.stopPropagation(); onContextMenu(image.imageId); }}
        onPointerOver={(e) => {
          // Ignore hover during camera orbit/pan
          if (isDragging()) return;

          // If this is not the selected plane, check if selected plane is also intersected
          if (!isSelected) {
            // Yield to selected plane if it's among the intersections
            const selectedPlaneIntersected = e.intersections.some(
              i => i.object.userData?.isSelectedPlane === true
            );
            if (selectedPlaneIntersected) return;

            // Also only accept if this is the closest intersection
            if (e.intersections[0]?.object !== e.object) return;
          }

          e.stopPropagation();
          setHovered(true);
          setMousePos({ x: e.clientX, y: e.clientY });
          onHover(image.imageId);
          document.body.style.cursor = 'pointer';
        }}
        onPointerMove={(e) => {
          // Clear hover state if dragging started while hovering
          if (isDragging()) {
            if (hovered) {
              setHovered(false);
              setMousePos(null);
              onHover(null);
              document.body.style.cursor = '';
            }
            return;
          }
          if (hovered) {
            setMousePos({ x: e.clientX, y: e.clientY });
          }
        }}
        onPointerOut={() => {
          setHovered(false);
          setMousePos(null);
          onHover(null);
          document.body.style.cursor = '';
        }}
      >
        {/* Use tessellated geometry for fullFrame undistortion (vertex shader moves vertices) */}
        {undistortionEnabled && undistortionMode === 'fullFrame' ? (
          <planeGeometry args={[planeSize.width, planeSize.height, TESSELLATION_SEGMENTS, TESSELLATION_SEGMENTS]} />
        ) : (
          <planeGeometry args={[planeSize.width, planeSize.height]} />
        )}
        {/* Use undistortion shader when enabled and texture is available */}
        {undistortionEnabled && shouldShowTexture && displayTexture ? (
          <UndistortedImageMaterial
            map={displayTexture}
            camera={camera}
            undistortionEnabled={undistortionEnabled}
            undistortionMode={undistortionMode}
            planeWidth={planeSize.width}
            planeHeight={planeSize.height}
            opacity={hovered ? selectionPlaneOpacity * 0.5 : selectionPlaneOpacity}
            color={0xffffff}
            side={THREE.DoubleSide}
            // Selected planes: force transparent pass (renders after wireframes) with no depth test/write
            depthTest={!isSelected}
            forceTransparent={isSelected}
            forceDepthWrite={isSelected ? false : undefined}
          />
        ) : (
          (() => {
            const materialOpacity = hovered
              ? (shouldShowTexture ? selectionPlaneOpacity * 0.5 : OPACITY.frustum.hoveredNoTexture)
              : (shouldShowTexture ? selectionPlaneOpacity : selectionPlaneOpacity * 0.2);
            const { transparent, depthWrite } = getMaterialTransparency(materialOpacity);
            return (
              <meshBasicMaterial
                ref={materialRef}
                map={shouldShowTexture ? displayTexture : null}
                color={shouldShowTexture ? 0xffffff : displayColor}
                side={THREE.DoubleSide}
                // Selected planes: force transparent pass (renders after wireframes) with no depth test
                // Non-selected: use normal transparency based on opacity
                transparent={isSelected ? true : transparent}
                depthWrite={isSelected ? false : depthWrite}
                depthTest={!isSelected}
                toneMapped={false}
                opacity={materialOpacity}
              />
            );
          })()
        )}
      </mesh>
      {isSelected && <primitive object={borderLine} />}
      {hovered && mousePos && (
        <Html
          style={{
            position: 'fixed',
            left: mousePos.x + 12,
            top: mousePos.y + 12,
            pointerEvents: 'none',
            transform: 'none',
          }}
          calculatePosition={() => [0, 0]}
        >
          <div className={hoverCardStyles.container}>
            <div className={hoverCardStyles.title}>{image.name}</div>
            <div className={hoverCardStyles.subtitle}>#{image.imageId}</div>
            <div className={hoverCardStyles.subtitle}>{numPoints3D} points</div>
            <div className={hoverCardStyles.hint}>
              {isSelected && cameraProjection === 'perspective' && (
                <div className={hoverCardStyles.hintRow}>
                  <svg className={ICON_SIZES.hoverCard} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="6" y="2" width="12" height="20" rx="6"/>
                    <path d="M12 6v4M12 14v4M9 8l3-3 3 3M9 16l3 3 3-3"/>
                  </svg>
                  Scroll: FOV
                </div>
              )}
              <div className={hoverCardStyles.hintRow}>
                <svg className={ICON_SIZES.hoverCard} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="6" y="2" width="12" height="20" rx="6"/>
                  <path d="M12 2v8"/>
                  <rect x="6" y="2" width="6" height="8" rx="3" fill="currentColor" opacity="0.5"/>
                </svg>
                {isSelected ? 'Left: details' : 'Left: select'}
              </div>
              <div className={hoverCardStyles.hintRow}>
                <svg className={ICON_SIZES.hoverCard} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="6" y="2" width="12" height="20" rx="6"/>
                  <path d="M12 2v8"/>
                  <rect x="12" y="2" width="6" height="8" rx="3" fill="currentColor" opacity="0.5"/>
                </svg>
                {isMatched ? 'Right: matches' : wouldGoBack ? 'Right: back' : 'Right: fly to'}
              </div>
              {isSelected && (
                <div className={hoverCardStyles.hintRow}>(U) undistort</div>
              )}
            </div>
          </div>
        </Html>
      )}
    </group>
  );
});

// Invisible hit targets for arrow mode interactions
interface ArrowHitTargetProps {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  image: Image;
  scale: number;
  isMatched?: boolean;
  wouldGoBack?: boolean; // Whether right-click would navigate back in history
  /** Pre-computed count of matched 3D points (from imageStats) */
  numPoints3D: number;
  /** Current hovered image ID from parent - used to sync local hover state */
  hoveredImageId: number | null;
  onHover: (id: number | null) => void;
  onClick: (imageId: number) => void;
  onDoubleClick: (imageId: number) => void;
  onContextMenu: (imageId: number) => void;
}

const ArrowHitTarget = memo(function ArrowHitTarget({
  position,
  quaternion,
  image,
  scale,
  isMatched = false,
  wouldGoBack = false,
  numPoints3D,
  hoveredImageId,
  onHover,
  onClick,
  onDoubleClick,
  onContextMenu,
}: ArrowHitTargetProps) {
  const [hovered, setHovered] = useState(false);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { controls } = useThree() as any;

  // Sync local hover state with parent - clear when parent clears hover or hovers different image
  useEffect(() => {
    if (hovered && hoveredImageId !== image.imageId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: sync derived state from parent
      setHovered(false);
      setMousePos(null);
      document.body.style.cursor = '';
    }
  }, [hovered, hoveredImageId, image.imageId]);

  // Check if camera controls are dragging (orbit/pan in progress)
  const isDragging = () => controls?.dragging?.current ?? false;

  const depth = scale;

  return (
    <group position={position} quaternion={quaternion}>
      <mesh
        position={[0, 0, depth / 2]}
        rotation={[Math.PI / 2, 0, 0]}
        onClick={(e) => { e.stopPropagation(); onClick(image.imageId); }}
        onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick(image.imageId); }}
        onContextMenu={(e) => { e.stopPropagation(); e.nativeEvent.preventDefault(); e.nativeEvent.stopPropagation(); onContextMenu(image.imageId); }}
        onPointerOver={(e) => {
          // Ignore hover during camera orbit/pan
          if (isDragging()) return;
          e.stopPropagation();
          setHovered(true);
          setMousePos({ x: e.clientX, y: e.clientY });
          onHover(image.imageId);
          document.body.style.cursor = 'pointer';
        }}
        onPointerMove={(e) => {
          // Clear hover state if dragging started while hovering
          if (isDragging()) {
            if (hovered) {
              setHovered(false);
              setMousePos(null);
              onHover(null);
              document.body.style.cursor = '';
            }
            return;
          }
          if (hovered) {
            setMousePos({ x: e.clientX, y: e.clientY });
          }
        }}
        onPointerOut={() => {
          setHovered(false);
          setMousePos(null);
          onHover(null);
          document.body.style.cursor = '';
        }}
      >
        <cylinderGeometry args={[0.025 * scale, 0.025 * scale, depth, 8]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
      {hovered && mousePos && (
        <Html
          style={{
            position: 'fixed',
            left: mousePos.x + 12,
            top: mousePos.y + 12,
            pointerEvents: 'none',
            transform: 'none',
          }}
          calculatePosition={() => [0, 0]}
        >
          <div className={hoverCardStyles.container}>
            <div className={hoverCardStyles.title}>{image.name}</div>
            <div className={hoverCardStyles.subtitle}>#{image.imageId}</div>
            <div className={hoverCardStyles.subtitle}>{numPoints3D} points</div>
            <div className={hoverCardStyles.hint}>
              <div className={hoverCardStyles.hintRow}>
                <svg className={ICON_SIZES.hoverCard} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="6" y="2" width="12" height="20" rx="6"/>
                  <path d="M12 2v8"/>
                  <rect x="6" y="2" width="6" height="8" rx="3" fill="currentColor" opacity="0.5"/>
                </svg>
                Left: select
              </div>
              <div className={hoverCardStyles.hintRow}>
                <svg className={ICON_SIZES.hoverCard} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="6" y="2" width="12" height="20" rx="6"/>
                  <path d="M12 2v8"/>
                  <rect x="6" y="2" width="6" height="8" rx="3" fill="currentColor" opacity="0.5"/>
                  <text x="18" y="18" fontSize="8" fill="currentColor" stroke="none">2</text>
                </svg>
                2xLeft: details
              </div>
              <div className={hoverCardStyles.hintRow}>
                <svg className={ICON_SIZES.hoverCard} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="6" y="2" width="12" height="20" rx="6"/>
                  <path d="M12 2v8"/>
                  <rect x="12" y="2" width="6" height="8" rx="3" fill="currentColor" opacity="0.5"/>
                </svg>
                {isMatched ? 'Right: matches' : wouldGoBack ? 'Right: back' : 'Right: fly to'}
              </div>
            </div>
          </div>
        </Html>
      )}
    </group>
  );
});

// Context menu for frustum right-click
interface FrustumContextMenuProps {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  planeDepth: number;
  planeWidth: number;
  planeHeight: number;
  onSelect: () => void;
  onGoto: () => void;
  onInfo: () => void;
  onClose: () => void;
}

const FrustumContextMenu = memo(function FrustumContextMenu({
  position,
  quaternion,
  planeDepth,
  planeWidth,
  planeHeight,
  onSelect,
  onGoto,
  onInfo,
  onClose,
}: FrustumContextMenuProps) {
  return (
    <group position={position} quaternion={quaternion}>
      <Html
        position={[planeWidth / 2, planeHeight / 2, planeDepth]}
        style={{ pointerEvents: 'auto' }}
      >
        <div
          className={contextMenuStyles.container}
          onMouseLeave={onClose}
        >
          <button className={contextMenuStyles.button} onClick={onSelect}>
            <svg className={contextMenuStyles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <circle cx="12" cy="12" r="3" fill="currentColor"/>
            </svg>
            Select
          </button>
          <button className={contextMenuStyles.button} onClick={onGoto}>
            <svg className={contextMenuStyles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
            Go to
          </button>
          <button className={contextMenuStyles.button} onClick={onInfo}>
            <svg className={contextMenuStyles.icon} viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="2.5"/>
              <rect x="9.5" y="10" width="5" height="12" rx="1"/>
            </svg>
            Info
          </button>
        </div>
      </Html>
    </group>
  );
});

// Context menu state type
interface ContextMenuState {
  imageId: number;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  planeDepth: number;
  planeWidth: number;
  planeHeight: number;
}

export function CameraFrustums() {
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const loadedFiles = useReconstructionStore((s) => s.loadedFiles);
  const imageUrlBase = useReconstructionStore((s) => s.imageUrlBase);
  const cameraDisplayMode = useCameraStore((s) => s.cameraDisplayMode);
  const cameraScaleBase = useCameraStore((s) => s.cameraScale);
  const cameraScaleFactor = useCameraStore((s) => s.cameraScaleFactor);
  const cameraScale = cameraScaleBase * parseFloat(cameraScaleFactor);
  const selectedImageId = useCameraStore((s) => s.selectedImageId);
  const setSelectedImageId = useCameraStore((s) => s.setSelectedImageId);
  const selectionPlaneOpacity = useCameraStore((s) => s.selectionPlaneOpacity);
  const undistortionEnabled = useCameraStore((s) => s.undistortionEnabled);
  const undistortionMode = useCameraStore((s) => s.undistortionMode);

  // Image planes are shown in 'imageplane' mode
  const showImagePlanes = cameraDisplayMode === 'imageplane';
  const openImageDetail = useUIStore((s) => s.openImageDetail);
  const setMatchedImageId = useUIStore((s) => s.setMatchedImageId);
  const setShowMatchesInModal = useUIStore((s) => s.setShowMatchesInModal);
  const flyToImage = useCameraStore((s) => s.flyToImage);
  const pushNavigationHistory = useCameraStore((s) => s.pushNavigationHistory);
  const popNavigationHistory = useCameraStore((s) => s.popNavigationHistory);
  const peekNavigationHistory = useCameraStore((s) => s.peekNavigationHistory);
  const flyToState = useCameraStore((s) => s.flyToState);
  const selectionColorMode = useCameraStore((s) => s.selectionColorMode);
  const selectionColor = useCameraStore((s) => s.selectionColor);
  const selectionAnimationSpeed = useCameraStore((s) => s.selectionAnimationSpeed);
  const frustumColorMode = useCameraStore((s) => s.frustumColorMode);
  const unselectedCameraOpacity = useCameraStore((s) => s.unselectedCameraOpacity);
  const matchesDisplayMode = useUIStore((s) => s.matchesDisplayMode);
  const matchesOpacity = useUIStore((s) => s.matchesOpacity);
  const matchesColor = useUIStore((s) => s.matchesColor);

  // Hovered image ID for arrow mode (batched rendering needs this at parent level)
  const [hoveredImageId, setHoveredImageId] = useState<number | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // Camera movement detection - pauses texture loading during orbit/pan
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { camera: threeCamera, controls, gl } = useThree() as any;
  const lastCameraPosRef = useRef(new THREE.Vector3());
  const lastCameraQuatRef = useRef(new THREE.Quaternion());
  const lastMoveTimeRef = useRef(0);
  const isCameraMovingRef = useRef(false);

  // Track pending hover refresh after fly-to and last mouse position
  const pendingHoverRefreshRef = useRef(false);
  const lastMousePosRef = useRef<{ x: number; y: number } | null>(null);

  // Track mouse position at document level for hover refresh after fly-to
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    };
    document.addEventListener('mousemove', handleMouseMove);
    return () => document.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Detect camera movement and debounce texture loading (no setTimeout, pure frame-based)
  useFrame(() => {
    const posMoved = lastCameraPosRef.current.distanceToSquared(threeCamera.position) > 0.0001;
    const quatMoved = lastCameraQuatRef.current.angleTo(threeCamera.quaternion) > 0.001;
    const now = performance.now();

    if (posMoved || quatMoved) {
      lastCameraPosRef.current.copy(threeCamera.position);
      lastCameraQuatRef.current.copy(threeCamera.quaternion);
      lastMoveTimeRef.current = now;
      if (!isCameraMovingRef.current) {
        isCameraMovingRef.current = true;
        pauseFrustumTextureCache();
      }
    } else if (isCameraMovingRef.current && now - lastMoveTimeRef.current > TIMING.transitionBase) {
      isCameraMovingRef.current = false;
      resumeFrustumTextureCache();

      // After fly-to completes, dispatch synthetic pointer event to refresh hover
      if (pendingHoverRefreshRef.current && lastMousePosRef.current && gl?.domElement) {
        pendingHoverRefreshRef.current = false;
        const canvas = gl.domElement as HTMLCanvasElement;
        // Dispatch a synthetic pointermove to trigger R3F's hover detection
        const event = new PointerEvent('pointermove', {
          clientX: lastMousePosRef.current.x,
          clientY: lastMousePosRef.current.y,
          bubbles: true,
          cancelable: true,
          pointerType: 'mouse',
          pointerId: 1,
        });
        canvas.dispatchEvent(event);
      }
    }
  });

  // Extract imageFiles to avoid recalculating when other loadedFiles properties change
  const imageFiles = loadedFiles?.imageFiles;

  // Build a map from cameraId to index for consistent coloring
  const cameraIdToIndex = useMemo(() => {
    if (!reconstruction) return new Map<number, number>();
    const map = new Map<number, number>();
    let index = 0;
    for (const cameraId of reconstruction.cameras.keys()) {
      map.set(cameraId, index++);
    }
    return map;
  }, [reconstruction]);

  // Build a map from imageId to frame index for rig-frame coloring
  // Images with the same filename (different directories) belong to the same frame
  const imageFrameIndexMap = useMemo(() => {
    const map = new Map<number, number>();
    if (!reconstruction) return map;

    // Group images by frame identifier (filename without directory)
    const frameGroups = new Map<string, number[]>();
    for (const image of reconstruction.images.values()) {
      const parts = image.name.split(/[/\\]/);
      const frameId = parts.length >= 2 ? parts[parts.length - 1] : image.name;
      const existing = frameGroups.get(frameId) ?? [];
      existing.push(image.imageId);
      frameGroups.set(frameId, existing);
    }

    // Assign frame index to each image (only for multi-camera frames)
    let frameIndex = 0;
    for (const imageIds of frameGroups.values()) {
      if (imageIds.length >= 2) {
        for (const imageId of imageIds) {
          map.set(imageId, frameIndex);
        }
        frameIndex++;
      }
    }

    return map;
  }, [reconstruction]);

  // Compute matched image IDs when matches are shown
  // Uses pre-computed connectedImagesIndex (avoids iterating points3D Map)
  const matchedImageIds = useMemo(() => {
    if (!reconstruction || selectedImageId === null || matchesDisplayMode === 'off') {
      return new Set<number>();
    }

    // Use pre-computed connectedImagesIndex - O(1) lookup
    const connections = reconstruction.connectedImagesIndex.get(selectedImageId);
    if (!connections) {
      return new Set<number>();
    }

    // Return all connected image IDs (the keys of the connections map)
    return new Set(connections.keys());
  }, [reconstruction, selectedImageId, matchesDisplayMode]);

  // Get the last navigation target for "back" hint display
  // Subscribe to navigationHistory directly so we react to changes
  const navigationHistory = useCameraStore((s) => s.navigationHistory);
  const lastNavigationToImageId = useMemo(() => {
    if (navigationHistory.length === 0) return null;
    return navigationHistory[navigationHistory.length - 1].toImageId;
  }, [navigationHistory]);

  // Track URL image cache updates to trigger re-renders
  const [urlImageCacheVersion, setUrlImageCacheVersion] = useState(0);

  const frustums = useMemo(() => {
    if (!reconstruction || cameraDisplayMode === 'off') return [];

    const result: {
      image: Image;
      camera: Camera;
      position: THREE.Vector3;
      quaternion: THREE.Quaternion;
      imageFile?: File;
      cameraIndex: number;
      numPoints3D: number;
    }[] = [];

    for (const image of reconstruction.images.values()) {
      const camera = reconstruction.cameras.get(image.cameraId);
      if (!camera) continue;

      // Compute position and quaternion
      const position = getImageWorldPosition(image);
      const quaternion = getImageWorldQuaternion(image);

      // Skip images with invalid pose data (NaN values cause THREE.js errors)
      if (!Number.isFinite(position.x) || !Number.isFinite(position.y) || !Number.isFinite(position.z)) {
        continue;
      }

      // Get image file - use URL cache if in URL mode, otherwise local files
      let imageFile: File | undefined;
      if (imageUrlBase) {
        // URL mode: check cache first (sync)
        imageFile = getUrlImageCached(image.name);
      } else {
        // Local mode: use local file lookup
        imageFile = getImageFile(imageFiles, image.name);
      }

      result.push({
        image,
        camera,
        position,
        quaternion,
        imageFile,
        cameraIndex: cameraIdToIndex.get(image.cameraId) ?? 0,
        numPoints3D: reconstruction.imageStats.get(image.imageId)?.numPoints3D ?? 0,
      });
    }

    return result;
  }, [reconstruction, cameraDisplayMode, imageFiles, imageUrlBase, cameraIdToIndex, urlImageCacheVersion]);

  // Callbacks for arrow hit targets - use stable references to avoid breaking memo
  const handleArrowClick = useCallback((imageId: number) => {
    setContextMenu(null); // Close context menu on click
    if (imageId === selectedImageId) {
      // Clicking already selected image opens info panel
      openImageDetail(imageId);
    } else {
      // Clicking unselected image selects it
      setSelectedImageId(imageId);
    }
  }, [selectedImageId, setSelectedImageId, openImageDetail]);

  const handleArrowDoubleClick = useCallback((imageId: number) => {
    setContextMenu(null);
    openImageDetail(imageId);
  }, [openImageDetail]);

  // Right-click callback - if matched camera, show matches; if selected camera, deselect; otherwise fly to
  const handleArrowContextMenu = useCallback((imageId: number) => {
    const frustum = frustums.find(f => f.image.imageId === imageId);
    if (!frustum) return;

    // If right-clicking the selected camera, deselect it
    if (imageId === selectedImageId) {
      setSelectedImageId(null);
      return;
    }

    // Check if this is a matched camera (shares points with the selected camera)
    if (selectedImageId !== null && matchedImageIds.has(imageId)) {
      // Open image detail for the selected camera with this as the matched image
      setShowMatchesInModal(true);
      setMatchedImageId(imageId);
      openImageDetail(selectedImageId);
      // Need to set matchedImageId after openImageDetail since it resets it
      setTimeout(() => setMatchedImageId(imageId), 0);
      return;
    }

    // Prioritize texture loading
    if (frustum.imageFile) {
      prioritizeFrustumTexture(frustum.imageFile, frustum.image.name);
    }

    // Get current view state from controls for navigation history
    const getCurrentViewState = controls?.getCurrentViewState;
    const lastEntry = peekNavigationHistory();

    // Check if we're clicking the same image we just flew to (trace back)
    if (getCurrentViewState && lastEntry && lastEntry.toImageId === imageId) {
      // User wants to go back - pop and return
      const entry = popNavigationHistory();
      if (entry) {
        // Clear hover state before flying - hover won't auto-update during camera movement
        setHoveredImageId(null);
        document.body.style.cursor = '';
        // Signal to refresh hover after fly-to completes
        pendingHoverRefreshRef.current = true;
        flyToState(entry.fromState);
        setSelectedImageId(entry.fromImageId);
      }
      return;
    }

    // Push current state and fly to the image
    if (getCurrentViewState) {
      const currentViewState = getCurrentViewState();
      pushNavigationHistory({
        fromState: currentViewState,
        fromImageId: selectedImageId,
        toImageId: imageId,
      });
    }
    // Clear hover state before flying - hover won't auto-update during camera movement
    setHoveredImageId(null);
    document.body.style.cursor = '';
    // Signal to refresh hover after fly-to completes
    pendingHoverRefreshRef.current = true;
    setSelectedImageId(imageId);
    flyToImage(imageId);

    // Show undistortion tip if camera has lens distortion
    const intrinsics = getCameraIntrinsics(frustum.camera);
    const hasDistortion = intrinsics.k1 !== 0 || intrinsics.k2 !== 0 ||
                          intrinsics.k3 !== 0 || intrinsics.k4 !== 0 ||
                          intrinsics.p1 !== 0 || intrinsics.p2 !== 0;
    if (hasDistortion) {
      useGuideStore.getState().showTip(
        'undistortion',
        'Press U to toggle lens undistortion'
      );
    }
  }, [frustums, flyToImage, setSelectedImageId, selectedImageId, matchedImageIds, openImageDetail, setMatchedImageId, setShowMatchesInModal, controls, peekNavigationHistory, popNavigationHistory, pushNavigationHistory, flyToState]);

  // Helper to prioritize texture loading for an image
  const prioritizeTextureForImage = useCallback((imageId: number) => {
    const frustum = frustums.find(f => f.image.imageId === imageId);
    if (frustum?.imageFile) {
      prioritizeFrustumTexture(frustum.imageFile, frustum.image.name);
    }
  }, [frustums]);

  // Fetch URL image only for selected camera (URL mode only)
  // Image planes just display cached images - no auto-fetching for hover
  useEffect(() => {
    if (!imageUrlBase || !reconstruction || selectedImageId === null) {
      return;
    }

    const selectedImage = reconstruction.images.get(selectedImageId);
    if (!selectedImage) return;

    const cached = getUrlImageCached(selectedImage.name);
    if (!cached) {
      fetchUrlImage(imageUrlBase, selectedImage.name).then((file) => {
        if (file) {
          // Trigger re-render when image is cached
          setUrlImageCacheVersion(v => v + 1);
        }
      });
    }
  }, [imageUrlBase, reconstruction, selectedImageId]);

  // Context menu action handlers
  const handleContextMenuSelect = useCallback(() => {
    if (contextMenu) {
      prioritizeTextureForImage(contextMenu.imageId);
      setSelectedImageId(contextMenu.imageId);
      setContextMenu(null);
    }
  }, [contextMenu, setSelectedImageId, prioritizeTextureForImage]);

  const handleContextMenuGoto = useCallback(() => {
    if (!contextMenu) return;

    const targetImageId = contextMenu.imageId;
    prioritizeTextureForImage(targetImageId);

    // Get current view state from controls
    const getCurrentViewState = controls?.getCurrentViewState;

    // Clear hover state before flying - hover won't auto-update during camera movement
    setHoveredImageId(null);
    document.body.style.cursor = '';
    // Signal to refresh hover after fly-to completes
    pendingHoverRefreshRef.current = true;

    if (!getCurrentViewState) {
      // Fallback: just fly without history
      flyToImage(targetImageId);
      setContextMenu(null);
      return;
    }

    const currentViewState = getCurrentViewState();
    const lastEntry = peekNavigationHistory();

    // Check if we're clicking the same image we just flew to
    if (lastEntry && lastEntry.toImageId === targetImageId) {
      // User wants to go back - pop and return
      const entry = popNavigationHistory();
      if (entry) {
        flyToState(entry.fromState);
        setSelectedImageId(entry.fromImageId);
      }
    } else {
      // Different image - push current state and fly
      pushNavigationHistory({
        fromState: currentViewState,
        fromImageId: selectedImageId,
        toImageId: targetImageId,
      });
      flyToImage(targetImageId);
    }

    setContextMenu(null);
  }, [contextMenu, flyToImage, prioritizeTextureForImage, peekNavigationHistory, popNavigationHistory, pushNavigationHistory, flyToState, controls, selectedImageId, setSelectedImageId]);

  const handleContextMenuInfo = useCallback(() => {
    if (contextMenu) {
      openImageDetail(contextMenu.imageId);
      setContextMenu(null);
    }
  }, [contextMenu, openImageDetail]);

  const handleContextMenuClose = useCallback(() => {
    setContextMenu(null);
  }, []);

  if (cameraDisplayMode === 'off' || frustums.length === 0) return null;

  // Arrow mode: use batched rendering for efficiency
  if (cameraDisplayMode === 'arrow') {
    // Find selected frustum for image plane display
    const selectedFrustum = selectedImageId !== null
      ? frustums.find(f => f.image.imageId === selectedImageId)
      : null;

    return (
      <group>
        {/* Instanced meshes for all cone arrows */}
        <BatchedArrowMeshes
          frustums={frustums}
          cameraScale={cameraScale}
          selectedImageId={selectedImageId}
          hoveredImageId={hoveredImageId}
          matchedImageIds={matchedImageIds}
          matchesOpacity={matchesOpacity}
          matchesDisplayMode={matchesDisplayMode}
          matchesColor={matchesColor}
          frustumColorMode={frustumColorMode}
          selectionColorMode={selectionColorMode}
          selectionColor={selectionColor}
          selectionAnimationSpeed={selectionAnimationSpeed}
          unselectedCameraOpacity={unselectedCameraOpacity}
          imageFrameIndexMap={imageFrameIndexMap}
        />
        {/* Image plane for selected camera (replaces arrow) */}
        {selectedFrustum && (
          <FrustumPlane
            position={selectedFrustum.position}
            quaternion={selectedFrustum.quaternion}
            camera={selectedFrustum.camera}
            image={selectedFrustum.image}
            scale={cameraScale}
            imageFile={selectedFrustum.imageFile}
            showImagePlane={true}
            isSelected={true}
            wouldGoBack={selectedFrustum.image.imageId === lastNavigationToImageId}
            selectionPlaneOpacity={selectionPlaneOpacity}
            color={selectionColorMode === 'rainbow' ? VIZ_COLORS.frustum.selected : selectionColor}
            undistortionEnabled={undistortionEnabled}
            undistortionMode={undistortionMode}
            numPoints3D={selectedFrustum.numPoints3D}
            hoveredImageId={hoveredImageId}
            onHover={setHoveredImageId}
            onClick={handleArrowClick}
            onDoubleClick={handleArrowDoubleClick}
            onContextMenu={handleArrowContextMenu}
          />
        )}
        {/* Individual invisible hit targets for interactions (view frustum culled) */}
        {/* Skip selected image - it uses FrustumPlane for interaction instead */}
        {frustums
          .filter(f => f.image.imageId !== selectedImageId)
          .map((f) => (
            <ArrowHitTarget
              key={f.image.imageId}
              position={f.position}
              quaternion={f.quaternion}
              image={f.image}
              scale={cameraScale}
              isMatched={matchedImageIds.has(f.image.imageId)}
              wouldGoBack={f.image.imageId === lastNavigationToImageId}
              numPoints3D={f.numPoints3D}
              hoveredImageId={hoveredImageId}
              onHover={setHoveredImageId}
              onClick={handleArrowClick}
              onDoubleClick={handleArrowDoubleClick}
              onContextMenu={handleArrowContextMenu}
            />
          ))}
        {/* Context menu */}
        {contextMenu && (
          <FrustumContextMenu
            position={contextMenu.position}
            quaternion={contextMenu.quaternion}
            planeDepth={contextMenu.planeDepth}
            planeWidth={contextMenu.planeWidth}
            planeHeight={contextMenu.planeHeight}
            onSelect={handleContextMenuSelect}
            onGoto={handleContextMenuGoto}
            onInfo={handleContextMenuInfo}
            onClose={handleContextMenuClose}
          />
        )}
      </group>
    );
  }

  // Image plane mode: only image planes, no wireframes
  if (cameraDisplayMode === 'imageplane') {
    return (
      <group>
        {/* Per-frustum planes for texture + interaction (view frustum culled) */}
        {frustums.map((f) => {
          const isSelected = f.image.imageId === selectedImageId;
          const isMatched = matchedImageIds.has(f.image.imageId);
          let frustumColor: string;
          if (isSelected) {
            frustumColor = selectionColorMode === 'rainbow' ? VIZ_COLORS.frustum.selected : selectionColor;
          } else if (isMatched) {
            frustumColor = matchesColor;
          } else {
            frustumColor = getFrustumBaseColor(frustumColorMode, f.cameraIndex, f.image.imageId, imageFrameIndexMap);
          }
          // When no camera is selected, all use selectionPlaneOpacity
          // When selected, selected gets selectionPlaneOpacity, others get selectionPlaneOpacity * unselectedCameraOpacity
          let planeOpacity: number;
          if (selectedImageId === null) {
            planeOpacity = selectionPlaneOpacity;
          } else if (isSelected) {
            planeOpacity = selectionPlaneOpacity;
          } else if (isMatched) {
            planeOpacity = selectionPlaneOpacity * matchesOpacity;
          } else {
            planeOpacity = selectionPlaneOpacity * unselectedCameraOpacity;
          }
          return (
            <FrustumPlane
              key={f.image.imageId}
              position={f.position}
              quaternion={f.quaternion}
              camera={f.camera}
              image={f.image}
              scale={cameraScale}
              imageFile={f.imageFile}
              showImagePlane={selectedImageId === null || isSelected}
              isSelected={isSelected}
              isMatched={isMatched}
              wouldGoBack={f.image.imageId === lastNavigationToImageId}
              selectionPlaneOpacity={planeOpacity}
              color={frustumColor}
              cullAngleThreshold={COS_90_DEG}
              undistortionEnabled={undistortionEnabled}
              undistortionMode={undistortionMode}
              numPoints3D={f.numPoints3D}
              hoveredImageId={hoveredImageId}
              onHover={setHoveredImageId}
              onClick={handleArrowClick}
              onDoubleClick={handleArrowDoubleClick}
              onContextMenu={handleArrowContextMenu}
            />
          );
        })}
        {/* Context menu */}
        {contextMenu && (
          <FrustumContextMenu
            position={contextMenu.position}
            quaternion={contextMenu.quaternion}
            planeDepth={contextMenu.planeDepth}
            planeWidth={contextMenu.planeWidth}
            planeHeight={contextMenu.planeHeight}
            onSelect={handleContextMenuSelect}
            onGoto={handleContextMenuGoto}
            onInfo={handleContextMenuInfo}
            onClose={handleContextMenuClose}
          />
        )}
      </group>
    );
  }

  // Frustum mode: use batched lines + individual planes for textures
  return (
    <group>
      {/* Single batched geometry for all frustum wireframes */}
      <BatchedFrustumLines
        frustums={frustums}
        cameraScale={cameraScale}
        selectedImageId={selectedImageId}
        hoveredImageId={hoveredImageId}
        matchedImageIds={matchedImageIds}
        matchesOpacity={matchesOpacity}
        matchesDisplayMode={matchesDisplayMode}
        matchesColor={matchesColor}
        frustumColorMode={frustumColorMode}
        selectionColorMode={selectionColorMode}
        selectionColor={selectionColor}
        selectionAnimationSpeed={selectionAnimationSpeed}
        unselectedCameraOpacity={unselectedCameraOpacity}
        showImagePlanes={showImagePlanes}
        imageFrameIndexMap={imageFrameIndexMap}
      />
      {/* Per-frustum planes for texture + interaction (view frustum culled) */}
      {frustums.map((f) => {
          // Determine frustum color based on mode (for plane fallback color)
          const isSelected = f.image.imageId === selectedImageId;
          const isMatched = matchedImageIds.has(f.image.imageId);
          let frustumColor: string;
          if (isSelected) {
            frustumColor = selectionColorMode === 'rainbow' ? VIZ_COLORS.frustum.selected : selectionColor;
          } else if (isMatched) {
            frustumColor = matchesColor;
          } else {
            frustumColor = getFrustumBaseColor(frustumColorMode, f.cameraIndex, f.image.imageId, imageFrameIndexMap);
          }
          return (
            <FrustumPlane
              key={f.image.imageId}
              position={f.position}
              quaternion={f.quaternion}
              camera={f.camera}
              image={f.image}
              scale={cameraScale}
              imageFile={f.imageFile}
              showImagePlane={isSelected}
              isSelected={isSelected}
              isMatched={isMatched}
              wouldGoBack={f.image.imageId === lastNavigationToImageId}
              selectionPlaneOpacity={selectionPlaneOpacity}
              color={frustumColor}
              undistortionEnabled={undistortionEnabled}
              undistortionMode={undistortionMode}
              numPoints3D={f.numPoints3D}
              hoveredImageId={hoveredImageId}
              onHover={setHoveredImageId}
              onClick={handleArrowClick}
              onDoubleClick={handleArrowDoubleClick}
              onContextMenu={handleArrowContextMenu}
            />
          );
        })}
      {/* Context menu */}
      {contextMenu && (
        <FrustumContextMenu
          position={contextMenu.position}
          quaternion={contextMenu.quaternion}
          planeDepth={contextMenu.planeDepth}
          planeWidth={contextMenu.planeWidth}
          planeHeight={contextMenu.planeHeight}
          onSelect={handleContextMenuSelect}
          onGoto={handleContextMenuGoto}
          onInfo={handleContextMenuInfo}
          onClose={handleContextMenuClose}
        />
      )}
    </group>
  );
}

export function CameraMatches() {
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const selectedImageId = useCameraStore((s) => s.selectedImageId);
  const cameraDisplayMode = useCameraStore((s) => s.cameraDisplayMode);
  const matchesDisplayMode = useUIStore((s) => s.matchesDisplayMode);
  const matchesOpacity = useUIStore((s) => s.matchesOpacity);
  const matchesColor = useUIStore((s) => s.matchesColor);
  const materialRef = useRef<THREE.LineBasicMaterial>(null);
  const blinkPhaseRef = useRef(0);

  // Animate blink effect
  useFrame((_, delta) => {
    if (matchesDisplayMode === 'blink' && materialRef.current) {
      blinkPhaseRef.current = (blinkPhaseRef.current + delta) % 2;
      materialRef.current.opacity = matchesOpacity * (0.1 + 0.9 * getMatchesBlinkFactor(blinkPhaseRef.current));
    }
  });

  // Build geometry with all line segments in a single buffer
  const geometry = useMemo(() => {
    // Hide match lines when cameras are hidden or in imageplane mode
    if (!reconstruction || selectedImageId === null || matchesDisplayMode === 'off' || cameraDisplayMode === 'off' || cameraDisplayMode === 'imageplane') return null;

    const selectedImage = reconstruction.images.get(selectedImageId);
    if (!selectedImage) return null;

    const selectedPos = getImageWorldPosition(selectedImage);

    // Use pre-computed connectedImagesIndex (avoids iterating points3D Map)
    const connections = reconstruction.connectedImagesIndex.get(selectedImageId);
    if (!connections || connections.size === 0) return null;

    const matchedImageIds = new Set(connections.keys());

    // Build flat array of positions: [start1, end1, start2, end2, ...]
    const positions: number[] = [];

    for (const matchedId of matchedImageIds) {
      const matchedImage = reconstruction.images.get(matchedId);
      if (!matchedImage) continue;

      const matchedPos = getImageWorldPosition(matchedImage);
      // Start point
      positions.push(selectedPos.x, selectedPos.y, selectedPos.z);
      // End point
      positions.push(matchedPos.x, matchedPos.y, matchedPos.z);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return geo;
  }, [reconstruction, selectedImageId, matchesDisplayMode, cameraDisplayMode]);

  // Dispose geometry when it changes to prevent GPU memory leaks
  useEffect(() => {
    return () => {
      geometry?.dispose();
    };
  }, [geometry]);

  if (matchesDisplayMode === 'off' || cameraDisplayMode === 'off' || cameraDisplayMode === 'imageplane' || !geometry) return null;

  return (
    <lineSegments geometry={geometry} renderOrder={999}>
      <lineBasicMaterial
        ref={materialRef}
        color={matchesColor}
        transparent
        opacity={matchesOpacity}
        depthTest={false}
      />
    </lineSegments>
  );
}
