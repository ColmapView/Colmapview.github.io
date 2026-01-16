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
import { getImageFile } from '../../utils/imageFileUtils';
import { getImageWorldPosition, getImageWorldQuaternion } from '../../utils/colmapTransforms';
import { useFrustumTexture, useSelectedImageTexture, prioritizeFrustumTexture, pauseFrustumTextureCache, resumeFrustumTextureCache } from '../../hooks/useFrustumTexture';
import { VIZ_COLORS, RAINBOW, OPACITY, TIMING, hoverCardStyles, ICON_SIZES, getCameraColor, contextMenuStyles } from '../../theme';

// Shared temp objects for color calculations
const tempColor = new THREE.Color();

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

// Arrow line width in pixels
const ARROW_LINE_WIDTH = 2;

// Batched arrow rendering for efficient display of many cameras (using thick lines)
interface BatchedArrowLinesProps {
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
  frustumColorMode: 'single' | 'byCamera';
  selectionColorMode: SelectionColorMode;
  selectionAnimationSpeed: number;
  unselectedCameraOpacity: number;
}

function BatchedArrowLines({
  frustums,
  cameraScale,
  selectedImageId,
  hoveredImageId,
  matchedImageIds,
  matchesOpacity,
  frustumColorMode,
  selectionColorMode,
  selectionAnimationSpeed,
  unselectedCameraOpacity,
}: BatchedArrowLinesProps) {
  const lineRef = useRef<LineSegments2>(null);
  const materialRef = useRef<LineMaterial>(null);
  const { size } = useThree();
  const rainbowHueRef = useRef(0);
  const blinkPhaseRef = useRef(0);
  // Track previous state to avoid unnecessary GPU uploads
  const prevStateRef = useRef<{
    selectedImageId: number | null;
    hoveredImageId: number | null;
    matchedImageIds: Set<number>;
    unselectedCameraOpacity: number;
    matchesOpacity: number;
  } | null>(null);

  // Build geometry with all arrows (3 segments per arrow)
  const { positions, baseColors } = useMemo(() => {
    // 3 segments * 2 vertices * 3 components = 18 floats per arrow
    const positions: number[] = [];
    const baseColors: number[] = [];

    frustums.forEach((f) => {
      // Compute arrow geometry in local space
      const depth = cameraScale;
      const headLength = depth * 0.25;
      const headWidth = headLength * 0.6;

      // Local space vertices
      const apex = new THREE.Vector3(0, 0, 0);
      const tip = new THREE.Vector3(0, 0, depth);
      const leftBack = new THREE.Vector3(-headWidth, 0, depth - headLength);
      const rightBack = new THREE.Vector3(headWidth, 0, depth - headLength);

      // Transform to world space
      apex.applyQuaternion(f.quaternion).add(f.position);
      tip.applyQuaternion(f.quaternion).add(f.position);
      leftBack.applyQuaternion(f.quaternion).add(f.position);
      rightBack.applyQuaternion(f.quaternion).add(f.position);

      // Segment 1: apex to tip (shaft)
      positions.push(apex.x, apex.y, apex.z, tip.x, tip.y, tip.z);
      // Segment 2: tip to leftBack
      positions.push(tip.x, tip.y, tip.z, leftBack.x, leftBack.y, leftBack.z);
      // Segment 3: tip to rightBack
      positions.push(tip.x, tip.y, tip.z, rightBack.x, rightBack.y, rightBack.z);

      // Base color for this camera
      const color = frustumColorMode === 'byCamera'
        ? getCameraColor(f.cameraIndex)
        : VIZ_COLORS.frustum.default;
      tempColor.set(color);

      // Set color for all 6 vertices (2 per segment, 3 segments)
      for (let v = 0; v < 6; v++) {
        baseColors.push(tempColor.r, tempColor.g, tempColor.b);
      }
    });

    return { positions, baseColors };
  }, [frustums, cameraScale, frustumColorMode]);

  // Create and update geometry
  const geometry = useMemo(() => {
    const geo = new LineSegmentsGeometry();
    geo.setPositions(positions);
    geo.setColors(baseColors);
    return geo;
  }, [positions, baseColors]);

  // Create material
  const material = useMemo(() => {
    return new LineMaterial({
      color: 0xffffff,
      linewidth: ARROW_LINE_WIDTH,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      resolution: new THREE.Vector2(size.width, size.height),
    });
  }, [size.width, size.height]);

  // Update resolution when size changes
  useEffect(() => {
    if (materialRef.current) {
      materialRef.current.resolution.set(size.width, size.height);
    }
  }, [size.width, size.height]);

  // Update material opacity and colors based on selection, hover, etc.
  useFrame((_, delta) => {
    if (!lineRef.current) return;
    const geo = lineRef.current.geometry as LineSegmentsGeometry;
    const mat = lineRef.current.material as LineMaterial;
    if (!geo || !mat) return;

    // Check if animation is needed
    const isAnimated = (selectionColorMode === 'blink' || selectionColorMode === 'rainbow') && selectedImageId !== null;

    // Check if state changed - skip update if static and unchanged
    const prev = prevStateRef.current;
    const stateChanged = !prev ||
      prev.selectedImageId !== selectedImageId ||
      prev.hoveredImageId !== hoveredImageId ||
      prev.matchedImageIds !== matchedImageIds ||
      prev.unselectedCameraOpacity !== unselectedCameraOpacity ||
      prev.matchesOpacity !== matchesOpacity;

    // Skip GPU update if nothing changed and no animation is running
    if (!isAnimated && !stateChanged) return;

    // Update tracked state
    prevStateRef.current = { selectedImageId, hoveredImageId, matchedImageIds, unselectedCameraOpacity, matchesOpacity };

    // Update material opacity based on unselectedCameraOpacity
    mat.opacity = unselectedCameraOpacity;

    // Update animation phases based on mode
    if (isAnimated) {
      if (selectionColorMode === 'rainbow') {
        rainbowHueRef.current = (rainbowHueRef.current + delta * selectionAnimationSpeed * RAINBOW.speedMultiplier) % 1;
      } else if (selectionColorMode === 'blink') {
        blinkPhaseRef.current += delta * selectionAnimationSpeed * 2; // radians for sine wave
      }
    }

    // Build new colors array
    const newColors: number[] = [];

    frustums.forEach((f, i) => {
      const isSelected = f.image.imageId === selectedImageId;
      const isHovered = f.image.imageId === hoveredImageId;
      const isMatched = matchedImageIds.has(f.image.imageId);
      const isDimmed = selectedImageId !== null && !isSelected && !isMatched;

      // Determine color
      if (isHovered) {
        tempColor.set(VIZ_COLORS.frustum.hover);
      } else if (isSelected) {
        if (selectionColorMode === 'rainbow') {
          const hue = rainbowHueRef.current;
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
          tempColor.setRGB(r + m, g + m, b + m);
        } else if (selectionColorMode === 'blink') {
          const blinkFactor = (Math.sin(blinkPhaseRef.current) + 1) / 2;
          const intensity = 0.1 + 0.9 * blinkFactor;
          tempColor.set(VIZ_COLORS.frustum.selected);
          tempColor.multiplyScalar(intensity);
        } else {
          tempColor.set(VIZ_COLORS.frustum.selected);
        }
      } else {
        // Use base color
        const baseOffset = i * 18;
        tempColor.setRGB(baseColors[baseOffset], baseColors[baseOffset + 1], baseColors[baseOffset + 2]);
      }

      // Apply dimming effect via color (this is additional to material opacity)
      if (isDimmed && !isHovered) {
        tempColor.multiplyScalar(OPACITY.dimmed);
      }

      // Set color for all 6 vertices
      for (let v = 0; v < 6; v++) {
        newColors.push(tempColor.r, tempColor.g, tempColor.b);
      }
    });

    geo.setColors(newColors);
  });

  // Create the line object
  const lineObject = useMemo(() => {
    return new LineSegments2(geometry, material);
  }, [geometry, material]);

  if (frustums.length === 0) return null;

  return (
    <primitive object={lineObject} ref={lineRef} />
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
  frustumColorMode: 'single' | 'byCamera';
  selectionColorMode: SelectionColorMode;
  selectionAnimationSpeed: number;
  unselectedCameraOpacity: number;
  showImagePlanes: boolean;
}

function BatchedFrustumLines({
  frustums,
  cameraScale,
  selectedImageId,
  hoveredImageId,
  matchedImageIds,
  matchesOpacity,
  frustumColorMode,
  selectionColorMode,
  selectionAnimationSpeed,
  unselectedCameraOpacity,
  showImagePlanes,
}: BatchedFrustumLinesProps) {
  const geometryRef = useRef<THREE.BufferGeometry>(null);
  const rainbowHueRef = useRef(0);
  const blinkPhaseRef = useRef(0);
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
      const color = frustumColorMode === 'byCamera'
        ? getCameraColor(f.cameraIndex)
        : VIZ_COLORS.frustum.default;
      tempColor.set(color);

      // Set color and alpha for all 16 vertices
      for (let v = 0; v < 16; v++) {
        baseColors[offset + v * 3 + 0] = tempColor.r;
        baseColors[offset + v * 3 + 1] = tempColor.g;
        baseColors[offset + v * 3 + 2] = tempColor.b;
        baseAlphas[alphaOffset + v] = 1.0;
      }
    });

    return { positions, baseColors, baseAlphas };
  }, [frustums, cameraScale, frustumColorMode]);

  // Update colors and alphas based on selection, hover, selection color mode, opacity
  useFrame((_, delta) => {
    if (!geometryRef.current) return;

    const colorAttr = geometryRef.current.getAttribute('color') as THREE.BufferAttribute;
    const alphaAttr = geometryRef.current.getAttribute('alpha') as THREE.BufferAttribute;
    if (!colorAttr || !alphaAttr) return;

    // Check if animation is needed
    const isAnimated = (selectionColorMode === 'blink' || selectionColorMode === 'rainbow') && selectedImageId !== null;

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
    if (isAnimated) {
      if (selectionColorMode === 'rainbow') {
        rainbowHueRef.current = (rainbowHueRef.current + delta * selectionAnimationSpeed * RAINBOW.speedMultiplier) % 1;
      } else if (selectionColorMode === 'blink') {
        blinkPhaseRef.current += delta * selectionAnimationSpeed * 2; // radians for sine wave
      }
    }

    frustums.forEach((f, i) => {
      const offset = i * 48;
      const alphaOffset = i * 16;
      const isSelected = f.image.imageId === selectedImageId;
      const isHovered = f.image.imageId === hoveredImageId;
      const isMatched = matchedImageIds.has(f.image.imageId);
      const isDimmed = selectedImageId !== null && !isSelected && !isMatched;

      // Determine color
      if (isHovered) {
        tempColor.set(VIZ_COLORS.frustum.hover);
      } else if (isSelected) {
        if (selectionColorMode === 'rainbow') {
          // Rainbow color calculation
          const hue = rainbowHueRef.current;
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
          tempColor.setRGB(r + m, g + m, b + m);
        } else if (selectionColorMode === 'blink') {
          // Blink: smooth sine wave pulse between dim (0.1) and full brightness
          const blinkFactor = (Math.sin(blinkPhaseRef.current) + 1) / 2; // 0 to 1
          const intensity = 0.1 + 0.9 * blinkFactor;
          tempColor.set(VIZ_COLORS.frustum.selected);
          tempColor.multiplyScalar(intensity);
        } else {
          // off or static: solid selected color
          tempColor.set(VIZ_COLORS.frustum.selected);
        }
      } else {
        // Use base color
        tempColor.setRGB(baseColors[offset], baseColors[offset + 1], baseColors[offset + 2]);
      }

      // Calculate opacity (true alpha, not color darkening)
      let opacity = 1;
      if (!isSelected && !isHovered) opacity *= unselectedCameraOpacity;
      if (isDimmed && !isHovered) opacity *= OPACITY.dimmed;
      if (isMatched) opacity *= matchesOpacity;

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

  // Initial alphas array - apply unselected opacity
  const initialAlphas = useMemo(() => {
    const alphas = new Float32Array(baseAlphas.length);
    for (let i = 0; i < baseAlphas.length; i++) {
      alphas[i] = unselectedCameraOpacity;
    }
    return alphas;
  }, [baseAlphas.length, unselectedCameraOpacity]);

  // Create shader material
  const shaderMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: lineVertexShader,
      fragmentShader: lineFragmentShader,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
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
  imagePlaneOpacity: number;
  color: string;
  cullAngleThreshold?: number; // Cosine of angle threshold for culling (default: COS_45_DEG)
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
  imagePlaneOpacity,
  color,
  cullAngleThreshold = COS_45_DEG,
  onHover,
  onClick,
  onDoubleClick,
  onContextMenu,
}: FrustumPlaneProps) {
  const [hovered, setHovered] = useState(false);
  const [viewAngleOk, setViewAngleOk] = useState(true);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { camera: threeCamera, controls } = useThree() as any;
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const groupRef = useRef<THREE.Group>(null);

  // Check if camera controls are dragging (orbit/pan in progress)
  const isDragging = () => controls?.dragging?.current ?? false;

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

  // Viewing angle based texture culling (disabled when close to the frustum or selected)
  // Uses world coordinates to account for active transform
  useFrame(() => {
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

  const numPoints = image.points2D.filter(p => p.point3DId !== BigInt(-1)).length;
  const displayColor = hovered ? VIZ_COLORS.frustum.hover : color;

  return (
    <group ref={groupRef} position={position} quaternion={quaternion}>
      <mesh
        position={[0, 0, planeSize.depth]}
        onClick={(e) => { e.stopPropagation(); onClick(image.imageId); }}
        onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick(image.imageId); }}
        onContextMenu={(e) => { e.stopPropagation(); onContextMenu(image.imageId); }}
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
              document.body.style.cursor = 'auto';
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
          document.body.style.cursor = 'auto';
        }}
      >
        <planeGeometry args={[planeSize.width, planeSize.height]} />
        <meshBasicMaterial
          ref={materialRef}
          map={shouldShowTexture ? displayTexture : null}
          color={shouldShowTexture ? 0xffffff : displayColor}
          side={THREE.DoubleSide}
          transparent
          depthWrite={false}
          opacity={hovered
            ? (shouldShowTexture ? OPACITY.frustum.default : OPACITY.frustum.hoveredNoTexture)
            : (shouldShowTexture ? imagePlaneOpacity : imagePlaneOpacity * 0.2)}
        />
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
            <div className={hoverCardStyles.subtitle}>{numPoints} points</div>
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
                2xLeft: info
              </div>
              <div className={hoverCardStyles.hintRow}>
                <svg className={ICON_SIZES.hoverCard} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="6" y="2" width="12" height="20" rx="6"/>
                  <path d="M12 2v8"/>
                  <rect x="12" y="2" width="6" height="8" rx="3" fill="currentColor" opacity="0.5"/>
                </svg>
                Right: goto
              </div>
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
  camera: Camera;
  image: Image;
  scale: number;
  onHover: (id: number | null) => void;
  onClick: (imageId: number) => void;
  onDoubleClick: (imageId: number) => void;
  onContextMenu: (imageId: number) => void;
}

const ArrowHitTarget = memo(function ArrowHitTarget({
  position,
  quaternion,
  camera: _camera,
  image,
  scale,
  onHover,
  onClick,
  onDoubleClick,
  onContextMenu,
}: ArrowHitTargetProps) {
  const [hovered, setHovered] = useState(false);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { controls } = useThree() as any;

  // Check if camera controls are dragging (orbit/pan in progress)
  const isDragging = () => controls?.dragging?.current ?? false;

  const depth = scale;

  const numPoints = image.points2D.filter(p => p.point3DId !== BigInt(-1)).length;

  return (
    <group position={position} quaternion={quaternion}>
      <mesh
        position={[0, 0, depth / 2]}
        rotation={[Math.PI / 2, 0, 0]}
        onClick={(e) => { e.stopPropagation(); onClick(image.imageId); }}
        onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick(image.imageId); }}
        onContextMenu={(e) => { e.stopPropagation(); onContextMenu(image.imageId); }}
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
              document.body.style.cursor = 'auto';
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
          document.body.style.cursor = 'auto';
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
            <div className={hoverCardStyles.subtitle}>{numPoints} points</div>
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
                2xLeft: info
              </div>
              <div className={hoverCardStyles.hintRow}>
                <svg className={ICON_SIZES.hoverCard} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="6" y="2" width="12" height="20" rx="6"/>
                  <path d="M12 2v8"/>
                  <rect x="12" y="2" width="6" height="8" rx="3" fill="currentColor" opacity="0.5"/>
                </svg>
                Right: goto
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
  const cameraDisplayMode = useCameraStore((s) => s.cameraDisplayMode);
  const cameraScale = useCameraStore((s) => s.cameraScale);
  const selectedImageId = useCameraStore((s) => s.selectedImageId);
  const setSelectedImageId = useCameraStore((s) => s.setSelectedImageId);
  const toggleSelectedImageId = useCameraStore((s) => s.toggleSelectedImageId);
  const imagePlaneOpacity = useCameraStore((s) => s.imagePlaneOpacity);

  // Image planes are shown in 'imageplane' mode
  const showImagePlanes = cameraDisplayMode === 'imageplane';
  const openImageDetail = useUIStore((s) => s.openImageDetail);
  const flyToImage = useCameraStore((s) => s.flyToImage);
  const selectionColorMode = useCameraStore((s) => s.selectionColorMode);
  const selectionAnimationSpeed = useCameraStore((s) => s.selectionAnimationSpeed);
  const imageLoadMode = useUIStore((s) => s.imageLoadMode);
  const frustumColorMode = useCameraStore((s) => s.frustumColorMode);
  const unselectedCameraOpacity = useCameraStore((s) => s.unselectedCameraOpacity);
  const matchesDisplayMode = useUIStore((s) => s.matchesDisplayMode);
  const matchesOpacity = useUIStore((s) => s.matchesOpacity);

  // Hovered image ID for arrow mode (batched rendering needs this at parent level)
  const [hoveredImageId, setHoveredImageId] = useState<number | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // Camera movement detection - pauses texture loading during orbit/pan
  const { camera: threeCamera } = useThree();
  const lastCameraPosRef = useRef(new THREE.Vector3());
  const lastCameraQuatRef = useRef(new THREE.Quaternion());
  const lastMoveTimeRef = useRef(0);
  const isCameraMovingRef = useRef(false);

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
    }
  });

  // TODO: Re-enable view frustum culling state
  // const [visibleFrustumIds, setVisibleFrustumIds] = useState<Set<number>>(() => new Set());
  // const visibilityNeedsUpdate = useRef(true);
  // const hasComputedOnce = useRef(false);
  // Note: trigger visibility update when camera stops moving (check isCameraMovingRef in useFrame)

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

  // Compute matched image IDs when matches are shown
  const matchedImageIds = useMemo(() => {
    if (!reconstruction || selectedImageId === null || matchesDisplayMode === 'off') {
      return new Set<number>();
    }
    const selectedImage = reconstruction.images.get(selectedImageId);
    if (!selectedImage) return new Set<number>();

    const matched = new Set<number>();
    for (const point2D of selectedImage.points2D) {
      if (point2D.point3DId === BigInt(-1)) continue;
      const point3D = reconstruction.points3D.get(point2D.point3DId);
      if (!point3D) continue;
      for (const trackElem of point3D.track) {
        if (trackElem.imageId !== selectedImageId) {
          matched.add(trackElem.imageId);
        }
      }
    }
    return matched;
  }, [reconstruction, selectedImageId, matchesDisplayMode]);

  const frustums = useMemo(() => {
    if (!reconstruction || cameraDisplayMode === 'off') return [];

    const result: {
      image: Image;
      camera: Camera;
      position: THREE.Vector3;
      quaternion: THREE.Quaternion;
      imageFile?: File;
      cameraIndex: number;
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
        cameraIndex: cameraIdToIndex.get(image.cameraId) ?? 0,
      });
    }

    return result;
  }, [reconstruction, cameraDisplayMode, imageFiles, cameraIdToIndex]);

  // TODO: Re-enable view frustum culling
  // Compute visible frustums using view frustum culling (in useFrame to ensure camera matrices are ready)
  // const pendingVisibilityUpdate = useRef<Set<number> | null>(null);
  // useFrame(() => { ... visibility computation ... });
  // useEffect(() => { ... apply pending update ... });

  // Callbacks for arrow hit targets - use stable references to avoid breaking memo
  const handleArrowClick = useCallback((imageId: number) => {
    setContextMenu(null); // Close context menu on click
    toggleSelectedImageId(imageId); // Use store's toggle - no dependency on selectedImageId
  }, [toggleSelectedImageId]);

  const handleArrowDoubleClick = useCallback((imageId: number) => {
    setContextMenu(null);
    openImageDetail(imageId);
  }, [openImageDetail]);

  // Right-click callback - select and go to the image
  const handleArrowContextMenu = useCallback((imageId: number) => {
    const frustum = frustums.find(f => f.image.imageId === imageId);
    if (!frustum) return;

    // Prioritize texture loading, select, and fly to the image
    if (frustum.imageFile) {
      prioritizeFrustumTexture(frustum.imageFile, frustum.image.name);
    }
    setSelectedImageId(imageId);
    flyToImage(imageId);
  }, [frustums, flyToImage, setSelectedImageId]);

  // Helper to prioritize texture loading for an image
  const prioritizeTextureForImage = useCallback((imageId: number) => {
    const frustum = frustums.find(f => f.image.imageId === imageId);
    if (frustum?.imageFile) {
      prioritizeFrustumTexture(frustum.imageFile, frustum.image.name);
    }
  }, [frustums]);

  // Context menu action handlers
  const handleContextMenuSelect = useCallback(() => {
    if (contextMenu) {
      prioritizeTextureForImage(contextMenu.imageId);
      setSelectedImageId(contextMenu.imageId);
      setContextMenu(null);
    }
  }, [contextMenu, setSelectedImageId, prioritizeTextureForImage]);

  const handleContextMenuGoto = useCallback(() => {
    if (contextMenu) {
      prioritizeTextureForImage(contextMenu.imageId);
      flyToImage(contextMenu.imageId);
      setContextMenu(null);
    }
  }, [contextMenu, flyToImage, prioritizeTextureForImage]);

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
    return (
      <group>
        {/* Single batched geometry for all arrow lines */}
        <BatchedArrowLines
          frustums={frustums}
          cameraScale={cameraScale}
          selectedImageId={selectedImageId}
          hoveredImageId={hoveredImageId}
          matchedImageIds={matchedImageIds}
          matchesOpacity={matchesOpacity}
          frustumColorMode={frustumColorMode}
          selectionColorMode={selectionColorMode}
          selectionAnimationSpeed={selectionAnimationSpeed}
          unselectedCameraOpacity={unselectedCameraOpacity}
        />
        {/* Individual invisible hit targets for interactions */}
        {/* TODO: Re-enable view frustum culling: .filter(f => visibleFrustumIds.size === 0 || visibleFrustumIds.has(f.image.imageId) || f.image.imageId === selectedImageId) */}
        {frustums.map((f) => (
            <ArrowHitTarget
              key={f.image.imageId}
              position={f.position}
              quaternion={f.quaternion}
              camera={f.camera}
              image={f.image}
              scale={cameraScale}
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
        {/* Per-frustum planes for texture + interaction (no wireframe) */}
        {frustums.map((f) => {
          const isSelected = f.image.imageId === selectedImageId;
          let frustumColor: string;
          if (isSelected) {
            frustumColor = VIZ_COLORS.frustum.selected;
          } else if (frustumColorMode === 'byCamera') {
            frustumColor = getCameraColor(f.cameraIndex);
          } else {
            frustumColor = VIZ_COLORS.frustum.default;
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
              showImagePlane={imageLoadMode !== 'skip' && (selectedImageId === null || isSelected)}
              isSelected={isSelected}
              imagePlaneOpacity={imagePlaneOpacity}
              color={frustumColor}
              cullAngleThreshold={COS_90_DEG}
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
        frustumColorMode={frustumColorMode}
        selectionColorMode={selectionColorMode}
        selectionAnimationSpeed={selectionAnimationSpeed}
        unselectedCameraOpacity={unselectedCameraOpacity}
        showImagePlanes={showImagePlanes}
      />
      {/* Per-frustum planes for texture + interaction */}
      {/* TODO: Re-enable view frustum culling: .filter(f => visibleFrustumIds.size === 0 || visibleFrustumIds.has(f.image.imageId) || f.image.imageId === selectedImageId) */}
      {frustums.map((f) => {
          // Determine frustum color based on mode (for plane fallback color)
          const isSelected = f.image.imageId === selectedImageId;
          const isMatched = matchedImageIds.has(f.image.imageId);
          const isDimmed = selectedImageId !== null && !isSelected && !isMatched;
          let frustumColor: string;
          if (isSelected) {
            frustumColor = VIZ_COLORS.frustum.selected;
          } else if (frustumColorMode === 'byCamera') {
            frustumColor = getCameraColor(f.cameraIndex);
          } else {
            frustumColor = VIZ_COLORS.frustum.default;
          }
          // Compute plane opacity - selected image uses fixed 0.8, others use unselectedCameraOpacity
          let planeOpacity = isSelected ? 0.8 : imagePlaneOpacity * unselectedCameraOpacity;
          if (isDimmed) planeOpacity *= OPACITY.dimmed;
          if (isMatched) planeOpacity *= matchesOpacity;
          return (
            <FrustumPlane
              key={f.image.imageId}
              position={f.position}
              quaternion={f.quaternion}
              camera={f.camera}
              image={f.image}
              scale={cameraScale}
              imageFile={f.imageFile}
              showImagePlane={imageLoadMode !== 'skip' && isSelected}
              isSelected={isSelected}
              imagePlaneOpacity={planeOpacity}
              color={frustumColor}
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
  const materialRef = useRef<THREE.LineBasicMaterial>(null);
  const blinkPhaseRef = useRef(0);

  // Animate blink effect
  useFrame((_, delta) => {
    if (matchesDisplayMode === 'blink' && materialRef.current) {
      // Blink: quick flash on, longer off
      blinkPhaseRef.current = (blinkPhaseRef.current + delta) % 2; // 2 second cycle
      const t = blinkPhaseRef.current;
      let blinkFactor: number;
      if (t < 0.3) {
        // Fade in (0 to 0.3s)
        blinkFactor = t / 0.3;
      } else if (t < 0.6) {
        // Hold bright (0.3 to 0.6s)
        blinkFactor = 1;
      } else if (t < 1.0) {
        // Fade out (0.6 to 1.0s)
        blinkFactor = 1 - (t - 0.6) / 0.4;
      } else {
        // Stay off (1.0 to 3.0s)
        blinkFactor = 0;
      }
      materialRef.current.opacity = matchesOpacity * (0.1 + 0.9 * blinkFactor);
    }
  });

  // Build geometry with all line segments in a single buffer
  const geometry = useMemo(() => {
    // Hide match lines when cameras are hidden or in imageplane mode
    if (!reconstruction || selectedImageId === null || matchesDisplayMode === 'off' || cameraDisplayMode === 'off' || cameraDisplayMode === 'imageplane') return null;

    const selectedImage = reconstruction.images.get(selectedImageId);
    if (!selectedImage) return null;

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

    if (matchedImageIds.size === 0) return null;

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

  if (matchesDisplayMode === 'off' || cameraDisplayMode === 'off' || cameraDisplayMode === 'imageplane' || !geometry) return null;

  return (
    <lineSegments geometry={geometry} renderOrder={999}>
      <lineBasicMaterial
        ref={materialRef}
        color={VIZ_COLORS.match}
        transparent
        opacity={matchesOpacity}
        depthTest={false}
      />
    </lineSegments>
  );
}
